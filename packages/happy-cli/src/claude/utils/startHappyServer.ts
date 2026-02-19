/**
 * Happy MCP server
 * Provides Happy CLI specific tools including chat session title management
 * and task artifact management (create, update, list, read).
 *
 * All artifact tools (create, read, list, update) are proxied through the app
 * via agentState.toolRequests — the app has the encryption keys and can add
 * new artifacts to its local store immediately.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { ApiClient } from "@/api/api";
import { randomUUID } from "node:crypto";
import { registerAssistantTools } from "./assistantTools";
import { AgentState } from "@/api/types";

interface HappyServerOptions {
    client: ApiSessionClient;
    api: ApiClient;
    taskId?: string;
    sessionId?: string;
    enableAssistantTools?: boolean;
}

interface PendingArtifactToolCall {
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    tool: string;
}

interface ArtifactToolResultPayload {
    requestId: string;
    tool: string;
    result?: string;
    error?: string;
}

const PROGRESS_INTERVAL_MS = 15_000;

export async function startHappyServer(clientOrOpts: ApiSessionClient | HappyServerOptions) {
    // Support both old signature (just client) and new options object
    const opts: HappyServerOptions = 'client' in clientOrOpts
        ? clientOrOpts
        : { client: clientOrOpts as unknown as ApiSessionClient, api: null as any };

    const { client, api, taskId, sessionId } = opts;

    logger.debug(`[happyMCP] server:start sessionId=${client.sessionId} taskId=${taskId || 'none'}`);

    // Handler that sends title updates via the client
    const changeTitleHandler = async (title: string) => {
        logger.debug('[happyMCP] Changing title to:', title);
        try {
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Artifact tool proxy: read/list/update go through the app (which has decryption keys)
    //

    const pendingArtifactToolCalls = new Map<string, PendingArtifactToolCall>();

    async function callArtifactToolViaApp(
        tool: string,
        args: Record<string, unknown>,
        extra: { sendNotification: (notification: any) => Promise<void>; _meta?: { progressToken?: string | number } },
    ): Promise<string> {
        const requestId = randomUUID();
        logger.debug(`[happyMCP] callArtifactToolViaApp tool=${tool} requestId=${requestId}`);

        const promise = new Promise<string>((resolve, reject) => {
            pendingArtifactToolCalls.set(requestId, { resolve, reject, tool });
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

    // RPC handler: receives artifact tool results from the app
    client.rpcHandlerManager.registerHandler<ArtifactToolResultPayload, void>(
        'artifactToolResult',
        async (payload) => {
            const pending = pendingArtifactToolCalls.get(payload.requestId);
            if (!pending) {
                logger.debug(`[happyMCP] Artifact tool result for unknown requestId=${payload.requestId}`);
                return;
            }

            pendingArtifactToolCalls.delete(payload.requestId);

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

            logger.debug(`[happyMCP] Artifact tool result received tool=${pending.tool} requestId=${payload.requestId} error=${!!payload.error}`);
        },
    );

    //
    // Create the MCP server
    //

    const mcp = new McpServer({
        name: "Happy MCP",
        version: "1.0.0",
    });

    mcp.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        const response = await changeTitleHandler(args.title);
        if (response.success) {
            return {
                content: [{ type: 'text', text: `Successfully changed chat title to: "${args.title}"` }],
                isError: false,
            };
        } else {
            return {
                content: [{ type: 'text', text: `Failed to change chat title: ${response.error || 'Unknown error'}` }],
                isError: true,
            };
        }
    });

    const toolNames = ['change_title'];

    // Register artifact tools only when api is available
    if (api) {
        // create_artifact: proxied through app so it lands in local store immediately
        mcp.registerTool('create_artifact', {
            description: 'Save a work product (code, document, plan, etc.) as an artifact linked to the current task. The artifact is stored encrypted and visible in the mobile app.',
            title: 'Create Artifact',
            inputSchema: {
                title: z.string().describe('Title of the artifact'),
                body: z.string().describe('Content of the artifact (code, markdown, etc.)'),
                kind: z.string().optional().describe('Type: "artifact" (default), "task-input", or "task-output"'),
            },
        }, async (args, extra) => {
            try {
                const result = await callArtifactToolViaApp('create_artifact', {
                    title: args.title,
                    body: args.body,
                    taskId: taskId || null,
                    sourceSessionId: sessionId || client.sessionId,
                }, extra);
                return { content: [{ type: 'text', text: result }], isError: false };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to create artifact: ${error instanceof Error ? error.message : error}` }],
                    isError: true,
                };
            }
        });

        // update_artifact: proxied through app (needs decryption of existing DEK)
        mcp.registerTool('update_artifact', {
            description: 'Update an existing artifact. The previous version is automatically saved as a snapshot.',
            title: 'Update Artifact',
            inputSchema: {
                artifactId: z.string().describe('ID of the artifact to update'),
                title: z.string().optional().describe('New title (optional)'),
                body: z.string().optional().describe('New body content (optional)'),
            },
        }, async (args, extra) => {
            try {
                const result = await callArtifactToolViaApp('update_artifact', args, extra);
                return { content: [{ type: 'text', text: result }], isError: false };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to update artifact: ${error instanceof Error ? error.message : error}` }],
                    isError: true,
                };
            }
        });

        // list_task_artifacts: proxied through app (needs decryption of headers)
        mcp.registerTool('list_task_artifacts', {
            description: 'List artifacts associated with the current task (or a specified task)',
            title: 'List Task Artifacts',
            inputSchema: {
                taskId: z.string().optional().describe('Task ID to list artifacts for (defaults to current task)'),
            },
        }, async (args, extra) => {
            try {
                const targetTaskId = args.taskId || taskId;
                const result = await callArtifactToolViaApp('list_task_artifacts', { taskId: targetTaskId }, extra);
                return { content: [{ type: 'text', text: result }], isError: false };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to list artifacts: ${error instanceof Error ? error.message : error}` }],
                    isError: true,
                };
            }
        });

        // read_artifact: proxied through app (needs decryption)
        mcp.registerTool('read_artifact', {
            description: 'Read the full content of an artifact by its ID',
            title: 'Read Artifact',
            inputSchema: {
                artifactId: z.string().describe('ID of the artifact to read'),
            },
        }, async (args, extra) => {
            try {
                const result = await callArtifactToolViaApp('read_artifact', args, extra);
                return { content: [{ type: 'text', text: result }], isError: false };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to read artifact: ${error instanceof Error ? error.message : error}` }],
                    isError: true,
                };
            }
        });

        toolNames.push('create_artifact', 'update_artifact', 'list_task_artifacts', 'read_artifact');
    }

    // Register assistant tools (task/session management proxied through the app)
    if (opts.enableAssistantTools) {
        const assistantToolNames = registerAssistantTools(mcp, client);
        toolNames.push(...assistantToolNames);
    }

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    logger.debug(`[happyMCP] server:ready sessionId=${client.sessionId} url=${baseUrl.toString()}`);

    return {
        url: baseUrl.toString(),
        toolNames,
        stop: () => {
            logger.debug(`[happyMCP] server:stop sessionId=${client.sessionId}`);
            mcp.close();
            server.close();
        }
    }
}
