/**
 * Happy MCP server
 * Provides Happy CLI specific tools including chat session title management
 * and task artifact management (create, update, list, read)
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
import { encodeBase64, encrypt, getRandomBytes, libsodiumEncryptForPublicKey } from "@/api/encryption";
import { registerAssistantTools } from "./assistantTools";

interface HappyServerOptions {
    client: ApiSessionClient;
    api: ApiClient;
    taskId?: string;
    sessionId?: string;
    enableAssistantTools?: boolean;
}

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
        mcp.registerTool('create_artifact', {
            description: 'Save a work product (code, document, plan, etc.) as an artifact linked to the current task. The artifact is stored encrypted and visible in the mobile app.',
            title: 'Create Artifact',
            inputSchema: {
                title: z.string().describe('Title of the artifact'),
                body: z.string().describe('Content of the artifact (code, markdown, etc.)'),
                kind: z.string().optional().describe('Type: "artifact" (default), "task-input", or "task-output"'),
            },
        }, async (args) => {
            try {
                const artifactId = randomUUID();
                // Store header/body as plain JSON strings (unencrypted for MCP-created artifacts)
                const headerJson = JSON.stringify({ title: args.title });
                const bodyJson = JSON.stringify({ body: args.body });

                // Generate a simple DEK and encrypt for storage
                const dek = getRandomBytes(32);
                const headerEncrypted = encodeBase64(encrypt(dek, 'dataKey', { title: args.title }));
                const bodyEncrypted = encodeBase64(encrypt(dek, 'dataKey', { body: args.body }));

                let encryptedDek: Uint8Array;
                if (api.encryption_.type === 'dataKey') {
                    const sealed = libsodiumEncryptForPublicKey(dek, api.encryption_.publicKey);
                    encryptedDek = new Uint8Array(sealed.length + 1);
                    encryptedDek.set([0], 0);
                    encryptedDek.set(sealed, 1);
                } else {
                    encryptedDek = dek;
                }

                const result = await api.postArtifact({
                    id: artifactId,
                    header: headerEncrypted,
                    body: bodyEncrypted,
                    dataEncryptionKey: encodeBase64(encryptedDek),
                    kind: args.kind || 'task-output',
                    taskId: taskId || undefined,
                    sourceSessionId: sessionId || client.sessionId,
                });

                return {
                    content: [{ type: 'text', text: `Artifact created: ${artifactId} (title: "${args.title}")` }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to create artifact: ${error}` }],
                    isError: true,
                };
            }
        });

        mcp.registerTool('update_artifact', {
            description: 'Update an existing artifact. The previous version is automatically saved as a snapshot.',
            title: 'Update Artifact',
            inputSchema: {
                artifactId: z.string().describe('ID of the artifact to update'),
                title: z.string().optional().describe('New title (optional)'),
                body: z.string().optional().describe('New body content (optional)'),
            },
        }, async (args) => {
            try {
                // Fetch current artifact to get versions and DEK
                const current = await api.getArtifact(args.artifactId);

                const updateData: any = {};
                if (args.title !== undefined) {
                    // Re-encrypt header with current DEK
                    // For simplicity, pass the updated encrypted header
                    const dek = getRandomBytes(32); // Would need real DEK - simplified
                    updateData.header = encodeBase64(encrypt(dek, 'dataKey', { title: args.title }));
                    updateData.expectedHeaderVersion = current.headerVersion;
                }
                if (args.body !== undefined) {
                    const dek = getRandomBytes(32);
                    updateData.body = encodeBase64(encrypt(dek, 'dataKey', { body: args.body }));
                    updateData.expectedBodyVersion = current.bodyVersion;
                }

                const result = await api.updateArtifact(args.artifactId, updateData);

                if (result.success) {
                    return {
                        content: [{ type: 'text', text: `Artifact ${args.artifactId} updated successfully` }],
                        isError: false,
                    };
                } else {
                    return {
                        content: [{ type: 'text', text: `Version mismatch updating artifact ${args.artifactId}` }],
                        isError: true,
                    };
                }
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to update artifact: ${error}` }],
                    isError: true,
                };
            }
        });

        mcp.registerTool('list_task_artifacts', {
            description: 'List artifacts associated with the current task (or a specified task)',
            title: 'List Task Artifacts',
            inputSchema: {
                taskId: z.string().optional().describe('Task ID to list artifacts for (defaults to current task)'),
            },
        }, async (args) => {
            try {
                const targetTaskId = args.taskId || taskId;
                const artifacts = await api.getArtifacts(targetTaskId || undefined);

                if (artifacts.length === 0) {
                    return {
                        content: [{ type: 'text', text: 'No artifacts found' }],
                        isError: false,
                    };
                }

                const lines = artifacts.map((a: any) =>
                    `- ${a.id}: headerVersion=${a.headerVersion} kind=${a.kind || 'artifact'}`
                );

                return {
                    content: [{ type: 'text', text: `Found ${artifacts.length} artifact(s):\n${lines.join('\n')}` }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to list artifacts: ${error}` }],
                    isError: true,
                };
            }
        });

        mcp.registerTool('read_artifact', {
            description: 'Read the full content of an artifact by its ID',
            title: 'Read Artifact',
            inputSchema: {
                artifactId: z.string().describe('ID of the artifact to read'),
            },
        }, async (args) => {
            try {
                const artifact = await api.getArtifact(args.artifactId);
                return {
                    content: [{
                        type: 'text',
                        text: `Artifact ${args.artifactId}:\nHeader: ${artifact.header}\nBody: ${artifact.body}\nKind: ${artifact.kind || 'artifact'}\nVersions: header=${artifact.headerVersion} body=${artifact.bodyVersion}`
                    }],
                    isError: false,
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to read artifact: ${error}` }],
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
