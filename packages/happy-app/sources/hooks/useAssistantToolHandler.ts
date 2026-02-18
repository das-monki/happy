/**
 * App-side executor for assistant MCP tool requests.
 *
 * Watches the assistant session's `agentState.toolRequests` and executes
 * each request locally (the app has decryption keys that the CLI lacks).
 * Results are sent back via `apiSocket.sessionRPC('assistantToolResult', …)`.
 *
 * Runs as an effect that fires whenever toolRequests changes; processed
 * request IDs are tracked in a Set ref to avoid double-execution.
 */
import * as React from "react";
import { storage } from "@/sync/storage";
import { apiSocket } from "@/sync/apiSocket";
import { sync } from "@/sync/sync";
import { machineSpawnNewSession, sessionAllow, sessionDeny, sessionKill } from "@/sync/ops";
import { isMachineOnline } from "@/utils/machineUtils";
import type { DecryptedTask } from "@/sync/taskTypes";
import type { Session } from "@/sync/storageTypes";
import type { Message } from "@/sync/typesMessage";
import { useShallow } from "zustand/react/shallow";

interface ToolResultPayload {
    requestId: string;
    tool: string;
    result?: string;
    error?: string;
}

/**
 * Subscribes to the assistant session's agentState.toolRequests and executes
 * each tool call locally, sending results back to the CLI via RPC.
 */
export function useAssistantToolHandler(sessionId: string | null): void {
    const processedRef = React.useRef(new Set<string>());

    // Reset processed set when session changes
    React.useEffect(() => {
        processedRef.current = new Set<string>();
    }, [sessionId]);

    // Subscribe to toolRequests via the Zustand store hook
    const toolRequests = storage(useShallow((state) => {
        if (!sessionId) return null;
        return state.sessions[sessionId]?.agentState?.toolRequests ?? null;
    }));

    // Stable ref for sessionId so the effect closure always has the latest
    const sessionIdRef = React.useRef(sessionId);
    sessionIdRef.current = sessionId;

    React.useEffect(() => {
        const sid = sessionIdRef.current;
        if (!toolRequests || !sid) return;

        for (const [requestId, request] of Object.entries(toolRequests)) {
            if (processedRef.current.has(requestId)) continue;
            processedRef.current.add(requestId);
            executeAndRespond(sid, requestId, request.tool, request.arguments ?? {});
        }
    }, [toolRequests]);
}

async function executeAndRespond(
    sessionId: string,
    requestId: string,
    tool: string,
    args: Record<string, any>,
): Promise<void> {
    let result: string | undefined;
    let error: string | undefined;

    try {
        result = await executeTool(tool, args, sessionId);
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    try {
        await apiSocket.sessionRPC<void, ToolResultPayload>(sessionId, 'assistantToolResult', {
            requestId,
            tool,
            result,
            error,
        });
    } catch (e) {
        console.error(`[assistantTools] Failed to send tool result for ${tool}:`, e);
    }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function executeTool(tool: string, args: Record<string, any>, assistantSessionId: string): Promise<string> {
    switch (tool) {
        case 'list_tasks': return listTasks(args as { status?: string });
        case 'create_task': return createTask(args as { title: string; description?: string; directory?: string });
        case 'update_task': return updateTask(args as { taskId: string; title?: string; description?: string; status?: 'completed' | 'failed'; archived?: boolean });
        case 'list_sessions': return listSessions(args as { activeOnly?: boolean }, assistantSessionId);
        case 'get_inbox': return getInbox();
        case 'send_message_to_session': return sendMessageToSession(args as { sessionId: string; message: string });
        case 'start_session': return startSession(args as { directory: string; agent?: 'claude' | 'codex' | 'gemini'; taskId?: string; message?: string });
        case 'get_session_messages': return getSessionMessages(args as { sessionId: string; limit?: number });
        case 'approve_permission': return approvePermission(args as { sessionId: string; permissionId: string; decision: 'approve' | 'deny' });
        default: throw new Error(`Unknown tool: ${tool}`);
    }
}

function listTasks(args: { status?: string }): string {
    const state = storage.getState();
    const tasks = Object.values(state.tasks) as DecryptedTask[];
    const status = args.status ?? 'active';

    const filtered = tasks.filter((t) => {
        if (status === 'all') return true;
        if (status === 'archived') return t.archived === true;
        if (status === 'completed') return t.status === 'completed' && !t.archived;
        if (status === 'failed') return t.status === 'failed' && !t.archived;
        // "active" — not completed, not failed, not archived
        return !t.status && !t.archived;
    });

    const items = filtered.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status ?? 'active',
        directory: t.directory ?? null,
        archived: t.archived ?? false,
    }));

    return JSON.stringify(items, null, 2);
}

async function createTask(args: { title: string; description?: string; directory?: string }): Promise<string> {
    const taskId = await sync.createTask(
        args.title,
        args.description ?? null,
        null, // agentKey
        null, // machineId
        args.directory ?? null,
    );
    return JSON.stringify({ taskId });
}

async function updateTask(args: {
    taskId: string;
    title?: string;
    description?: string;
    status?: 'completed' | 'failed';
    archived?: boolean;
}): Promise<string> {
    const state = storage.getState();
    const task = state.tasks[args.taskId] as DecryptedTask | undefined;
    if (!task) throw new Error(`Task not found: ${args.taskId}`);

    // Archiving is only allowed from completed or failed state
    if (args.archived === true) {
        const currentStatus = task.status;
        if (currentStatus !== 'completed' && currentStatus !== 'failed') {
            throw new Error('Cannot archive a task that is not completed or failed. Complete or fail the task first.');
        }
    }

    // When completing or failing a task, kill active linked sessions first
    if (args.status === 'completed' || args.status === 'failed') {
        const sessions = Object.values(state.sessions) as Session[];
        const activeSessions = sessions.filter((s) => s.taskId === args.taskId && s.active);
        for (const s of activeSessions) {
            await sessionKill(s.id);
        }
    }

    const updates: Record<string, any> = {};
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;
    if (args.archived !== undefined) updates.archived = args.archived;

    await sync.updateTaskHeader(args.taskId, updates);
    return JSON.stringify({ success: true });
}

function listSessions(args: { activeOnly?: boolean }, assistantSessionId: string): string {
    const state = storage.getState();
    const sessions = Object.values(state.sessions) as Session[];
    const activeOnly = args.activeOnly !== false; // default true

    const filtered = sessions.filter((s) => {
        // Exclude the assistant's own session
        if (s.id === assistantSessionId) return false;
        if (activeOnly && !s.active) return false;
        return true;
    });

    const items = filtered.map((s) => ({
        id: s.id,
        directory: s.metadata?.path ?? null,
        active: s.active,
        thinking: s.thinking,
        taskId: s.taskId,
        flavor: s.metadata?.flavor ?? null,
    }));

    return JSON.stringify(items, null, 2);
}

function getInbox(): string {
    const state = storage.getState();
    const tasks = Object.values(state.tasks) as DecryptedTask[];
    const sessions = Object.values(state.sessions) as Session[];

    const waiting = tasks.filter((task) => {
        if (task.archived) return false;
        if (task.status === 'completed' || task.status === 'failed') return false;
        const linked = sessions.filter((s) => s.taskId === task.id);
        if (linked.length === 0) return false;
        return linked.every((s) => !s.thinking);
    });

    const items = waiting.map((t) => {
        const linked = sessions.filter((s) => s.taskId === t.id && s.active);
        const sessionDetails = linked.map((s) => {
            // Check for pending permission requests
            const pendingPermissions = s.agentState?.requests
                ? Object.entries(s.agentState.requests).map(([id, req]) => ({
                    permissionId: id,
                    tool: req.tool,
                    arguments: req.arguments,
                }))
                : [];

            // Get the last agent message for context
            const sessionMsgs = state.sessionMessages[s.id];
            let lastAgentMessage: string | null = null;
            if (sessionMsgs?.isLoaded) {
                for (let i = sessionMsgs.messages.length - 1; i >= 0; i--) {
                    const msg = sessionMsgs.messages[i];
                    if (msg.kind === 'agent-text' && !msg.isThinking) {
                        lastAgentMessage = msg.text;
                        break;
                    }
                }
            }

            return {
                sessionId: s.id,
                directory: s.metadata?.path ?? null,
                flavor: s.metadata?.flavor ?? null,
                waitingFor: pendingPermissions.length > 0
                    ? 'permission'
                    : 'user_input',
                pendingPermissions,
                lastAgentMessage,
            };
        });

        return {
            id: t.id,
            title: t.title,
            description: t.description,
            directory: t.directory ?? null,
            sessions: sessionDetails,
        };
    });

    return JSON.stringify(items, null, 2);
}

async function sendMessageToSession(args: { sessionId: string; message: string }): Promise<string> {
    sync.sendMessage(args.sessionId, args.message);
    return JSON.stringify({ success: true });
}

async function startSession(args: {
    directory: string;
    agent?: 'claude' | 'codex' | 'gemini';
    taskId?: string;
    message?: string;
}): Promise<string> {
    const state = storage.getState();
    const machines = Object.values(state.machines);
    const onlineMachine = machines.find(isMachineOnline);

    if (!onlineMachine) {
        throw new Error('No online machine available to spawn a session');
    }

    const result = await machineSpawnNewSession({
        machineId: onlineMachine.id,
        directory: args.directory,
        approvedNewDirectoryCreation: true,
        agent: args.agent,
        taskId: args.taskId,
    });

    if (result.type === 'error') {
        throw new Error(result.errorMessage);
    }

    // Send initial message if provided
    if (args.message && result.type === 'success') {
        // Small delay so the session has time to initialize
        setTimeout(() => {
            sync.sendMessage(result.sessionId, args.message!);
        }, 2000);
    }

    return JSON.stringify({
        sessionId: result.type === 'success' ? result.sessionId : null,
        status: result.type,
    });
}

function getSessionMessages(args: { sessionId: string; limit?: number }): string {
    const state = storage.getState();
    const sessionMessages = state.sessionMessages[args.sessionId];
    if (!sessionMessages || !sessionMessages.isLoaded) {
        throw new Error(`No messages found for session: ${args.sessionId}`);
    }

    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const all = sessionMessages.messages;
    const recent = all.slice(-limit);

    const items = recent.map((msg: Message) => {
        switch (msg.kind) {
            case 'agent-text':
                return { kind: 'agent-text', text: msg.text, createdAt: msg.createdAt };
            case 'user-text':
                return { kind: 'user-text', text: msg.text, createdAt: msg.createdAt };
            case 'tool-call':
                return {
                    kind: 'tool-call',
                    tool: msg.tool.name,
                    state: msg.tool.state,
                    description: msg.tool.description,
                    createdAt: msg.createdAt,
                };
            case 'agent-event':
                return { kind: 'agent-event', event: msg.event, createdAt: msg.createdAt };
            default:
                return { kind: 'unknown', createdAt: (msg as any).createdAt };
        }
    });

    return JSON.stringify(items, null, 2);
}

async function approvePermission(args: {
    sessionId: string;
    permissionId: string;
    decision: 'approve' | 'deny';
}): Promise<string> {
    const state = storage.getState();
    const autoApprove = state.settings.assistantAutoApprove;
    if (!autoApprove) {
        throw new Error('Auto-approve is disabled in settings. The user must approve permissions manually.');
    }

    if (args.decision === 'approve') {
        await sessionAllow(args.sessionId, args.permissionId);
    } else {
        await sessionDeny(args.sessionId, args.permissionId);
    }

    return JSON.stringify({ success: true, decision: args.decision });
}
