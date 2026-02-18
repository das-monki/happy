/**
 * Assistant Tool Proxy
 *
 * Registers MCP tools that the assistant can call to manage tasks, sessions,
 * and permissions. Tool calls are proxied to the app for execution (the CLI
 * cannot decrypt data from other sessions/tasks).
 *
 * Flow:
 *   Claude calls MCP tool → handler writes to agentState.toolRequests →
 *   app sees change, executes locally → app sends result via sessionRPC →
 *   RPC handler resolves the pending Promise → tool returns result to Claude
 *
 * Mirrors the permission flow in BasePermissionHandler.ts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { AgentState } from "@/api/types";

interface PendingToolCall {
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    tool: string;
}

interface ToolResultPayload {
    requestId: string;
    tool: string;
    result?: string;
    error?: string;
}

const PROGRESS_INTERVAL_MS = 15_000;

const pendingToolCalls = new Map<string, PendingToolCall>();

/**
 * Sends a tool request through agentState and waits for the app to respond
 * via the `assistantToolResult` RPC. Progress notifications are sent every
 * 15 s to keep the MCP client timeout alive.
 */
async function callToolViaApp(
    client: ApiSessionClient,
    tool: string,
    args: Record<string, unknown>,
    extra: { sendNotification: (notification: any) => Promise<void>; _meta?: { progressToken?: string | number } },
): Promise<string> {
    const requestId = randomUUID();
    logger.debug(`[assistantTools] callToolViaApp tool=${tool} requestId=${requestId}`);

    const promise = new Promise<string>((resolve, reject) => {
        pendingToolCalls.set(requestId, { resolve, reject, tool });
    });

    // Write request into agentState so the app picks it up
    client.updateAgentState((state: AgentState) => ({
        ...state,
        toolRequests: {
            ...state.toolRequests,
            [requestId]: {
                tool,
                arguments: args,
                createdAt: Date.now(),
            },
        },
    }));

    // Keep-alive: send MCP progress notifications every 15 s
    let progressCount = 0;
    const progressToken = extra._meta?.progressToken;
    const interval = setInterval(async () => {
        progressCount++;
        try {
            await extra.sendNotification({
                method: "notifications/progress" as const,
                params: {
                    progressToken: progressToken ?? requestId,
                    progress: progressCount,
                    message: `Waiting for app to execute ${tool}…`,
                },
            });
        } catch {
            // Notification failures are non-fatal
        }
    }, PROGRESS_INTERVAL_MS);

    try {
        return await promise;
    } finally {
        clearInterval(interval);
    }
}

/**
 * Registers assistant-specific MCP tools and the RPC handler that receives
 * results from the app.
 *
 * Returns the list of registered tool names.
 */
export function registerAssistantTools(mcp: McpServer, client: ApiSessionClient): string[] {

    // --- RPC handler: receives tool results from the app ---

    client.rpcHandlerManager.registerHandler<ToolResultPayload, void>(
        'assistantToolResult',
        async (payload) => {
            const pending = pendingToolCalls.get(payload.requestId);
            if (!pending) {
                logger.debug(`[assistantTools] Tool result for unknown requestId=${payload.requestId}`);
                return;
            }

            pendingToolCalls.delete(payload.requestId);

            // Move from toolRequests → completedToolRequests in agentState
            client.updateAgentState((state: AgentState) => {
                const { [payload.requestId]: _, ...remainingRequests } = state.toolRequests || {};
                return {
                    ...state,
                    toolRequests: remainingRequests,
                    completedToolRequests: {
                        ...state.completedToolRequests,
                        [payload.requestId]: {
                            tool: pending.tool,
                            result: payload.result ?? null,
                            error: payload.error,
                            completedAt: Date.now(),
                        },
                    },
                };
            });

            // Prune completed tool requests older than 5 minutes
            const PRUNE_AGE_MS = 5 * 60 * 1000;
            const now = Date.now();
            client.updateAgentState((pruneState: AgentState) => {
                const completed = pruneState.completedToolRequests;
                if (!completed) return pruneState;
                let changed = false;
                const pruned: typeof completed = {};
                for (const [id, entry] of Object.entries(completed)) {
                    if (entry.completedAt && now - entry.completedAt > PRUNE_AGE_MS) {
                        changed = true;
                    } else {
                        pruned[id] = entry;
                    }
                }
                return changed ? { ...pruneState, completedToolRequests: pruned } : pruneState;
            });

            if (payload.error) {
                pending.reject(new Error(payload.error));
            } else {
                pending.resolve(payload.result ?? '');
            }

            logger.debug(`[assistantTools] Tool result received tool=${pending.tool} requestId=${payload.requestId} error=${!!payload.error}`);
        },
    );

    // --- MCP tool registrations ---

    const toolNames: string[] = [];

    const registerTool = (
        name: string,
        description: string,
        inputSchema: Record<string, z.ZodTypeAny>,
        handler: (args: Record<string, any>, extra: any) => Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }>,
    ) => {
        mcp.registerTool(name, { description, inputSchema }, handler);
        toolNames.push(name);
    };

    registerTool(
        'list_tasks',
        'List tasks visible to the user. Returns JSON with task id, title, status, directory, and whether it is archived.',
        {
            status: z.enum(['all', 'active', 'completed', 'failed', 'archived']).optional()
                .describe('Filter by status. "all" includes every task. Default is "active".'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'list_tasks', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'create_task',
        'Create a new task. Returns the new task ID.',
        {
            title: z.string().describe('Title of the task'),
            description: z.string().optional().describe('Longer description of the task'),
            directory: z.string().optional().describe('Working directory for the task'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'create_task', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'update_task',
        'Update fields on an existing task.',
        {
            taskId: z.string().describe('ID of the task to update'),
            title: z.string().optional().describe('New title'),
            description: z.string().optional().describe('New description'),
            status: z.enum(['completed', 'failed']).optional().describe('Set task status'),
            archived: z.boolean().optional().describe('Archive or unarchive the task'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'update_task', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'list_sessions',
        'List active CLI sessions with their ID, name/title, directory, and status (thinking/idle).',
        {
            activeOnly: z.boolean().optional().describe('If true, only return active sessions. Default is true.'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'list_sessions', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'get_inbox',
        'Get tasks that are waiting for user input (active tasks with idle linked sessions).',
        {},
        async (_args, extra) => {
            const result = await callToolViaApp(client, 'get_inbox', {}, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'send_message_to_session',
        'Send a text message to another CLI session. The message appears as if the user typed it.',
        {
            sessionId: z.string().describe('Target session ID'),
            message: z.string().describe('Message text to send'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'send_message_to_session', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'start_session',
        'Spawn a new CLI session on the first available machine.',
        {
            directory: z.string().describe('Working directory for the new session'),
            agent: z.enum(['claude', 'codex', 'gemini']).optional().describe('Which agent to use. Default is "claude".'),
            taskId: z.string().optional().describe('Link this session to a task'),
            message: z.string().optional().describe('Initial message to send after spawning'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'start_session', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    registerTool(
        'approve_permission',
        'Approve or deny a pending permission request on a session. Only works if the user has enabled auto-approve in settings.',
        {
            sessionId: z.string().describe('Session with the pending permission'),
            permissionId: z.string().describe('ID of the permission request'),
            decision: z.enum(['approve', 'deny']).describe('Whether to approve or deny'),
        },
        async (args, extra) => {
            const result = await callToolViaApp(client, 'approve_permission', args, extra);
            return { content: [{ type: 'text', text: result }], isError: false };
        },
    );

    logger.debug(`[assistantTools] Registered ${toolNames.length} assistant tools: ${toolNames.join(', ')}`);
    return toolNames;
}
