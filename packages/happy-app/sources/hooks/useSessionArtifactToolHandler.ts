/**
 * App-side handler for artifact MCP tool requests from regular sessions.
 *
 * Watches ALL sessions (except the assistant session which has its own handler)
 * for `agentState.toolRequests` containing artifact tools (create_artifact,
 * read_artifact, list_task_artifacts, update_artifact). Executes them locally
 * using the app's decryption keys and sends results back via
 * `apiSocket.sessionRPC('artifactToolResult', …)`.
 *
 * Uses a stable selector (returns a serialized key of pending request IDs) to
 * avoid the infinite re-render loop that occurs when creating new objects in
 * the selector — the actual request data is read imperatively from the store.
 */
import * as React from "react";
import { storage } from "@/sync/storage";
import { apiSocket } from "@/sync/apiSocket";
import { sync } from "@/sync/sync";
import type { DecryptedArtifact } from "@/sync/artifactTypes";

interface ToolResultPayload {
    requestId: string;
    tool: string;
    result?: string;
    error?: string;
}

const ARTIFACT_TOOLS = new Set(['create_artifact', 'read_artifact', 'list_task_artifacts', 'update_artifact']);

/**
 * Subscribes to all sessions' agentState.toolRequests for artifact tools
 * and executes them app-side (which has decryption keys), sending results
 * back to the CLI via sessionRPC.
 *
 * The selector returns a stable primitive (sorted request ID string) so that
 * React only re-renders when requests actually change. The effect then reads
 * the store imperatively to get the full request data.
 */
export function useSessionArtifactToolHandler(assistantSessionId: string | null): void {
    const processedRef = React.useRef(new Set<string>());
    const assistantSessionIdRef = React.useRef(assistantSessionId);
    assistantSessionIdRef.current = assistantSessionId;

    // Return a stable primitive: sorted comma-joined request IDs for artifact tools.
    // Only changes when the set of pending artifact request IDs actually changes.
    const requestIdsKey = storage((state) => {
        const ids: string[] = [];
        for (const [sid, session] of Object.entries(state.sessions)) {
            if (sid === assistantSessionIdRef.current) continue;
            const requests = session?.agentState?.toolRequests;
            if (!requests) continue;
            for (const [rid, req] of Object.entries(requests)) {
                if (ARTIFACT_TOOLS.has(req.tool)) {
                    ids.push(rid);
                }
            }
        }
        ids.sort();
        return ids.join(',');
    });

    React.useEffect(() => {
        if (!requestIdsKey) return;

        // Read current state imperatively to get full request data
        const state = storage.getState();
        for (const [sid, session] of Object.entries(state.sessions)) {
            if (sid === assistantSessionIdRef.current) continue;
            const requests = session?.agentState?.toolRequests;
            if (!requests) continue;
            for (const [rid, req] of Object.entries(requests)) {
                if (!ARTIFACT_TOOLS.has(req.tool)) continue;
                if (processedRef.current.has(rid)) continue;
                processedRef.current.add(rid);
                executeAndRespond(sid, rid, req.tool, req.arguments ?? {});
            }
        }
    }, [requestIdsKey]);

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
        result = await executeArtifactTool(tool, args);
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    try {
        await apiSocket.sessionRPC<void, ToolResultPayload>(sessionId, 'artifactToolResult', {
            requestId,
            tool,
            result,
            error,
        });
    } catch (e) {
        console.error(`[artifactTools] Failed to send tool result for ${tool}:`, e);
    }
}

async function executeArtifactTool(tool: string, args: Record<string, any>): Promise<string> {
    switch (tool) {
        case 'create_artifact': return createArtifact(args as { title: string; body: string; taskId?: string | null; sourceSessionId?: string | null });
        case 'read_artifact': return readArtifact(args as { artifactId: string });
        case 'list_task_artifacts': return listTaskArtifacts(args as { taskId?: string });
        case 'update_artifact': return updateArtifact(args as { artifactId: string; title?: string; body?: string });
        default: throw new Error(`Unknown artifact tool: ${tool}`);
    }
}

async function createArtifact(args: { title: string; body: string; taskId?: string | null; sourceSessionId?: string | null }): Promise<string> {
    const artifactId = await sync.createArtifact(
        args.title || null,
        args.body || null,
        undefined, // sessions
        undefined, // draft
        args.taskId,
        args.sourceSessionId,
    );
    // Force a full artifact resync so the new artifact is visible everywhere
    sync.refreshArtifacts().catch(() => {});
    return JSON.stringify({ success: true, artifactId, title: args.title });
}

async function readArtifact(args: { artifactId: string }): Promise<string> {
    const artifact = await sync.fetchArtifactWithBody(args.artifactId);
    if (!artifact) throw new Error(`Artifact not found: ${args.artifactId}`);

    return JSON.stringify({
        id: artifact.id,
        title: artifact.title,
        body: artifact.body,
        taskId: artifact.taskId ?? null,
    });
}

function listTaskArtifacts(args: { taskId?: string }): string {
    const state = storage.getState();
    const allArtifacts = Object.values(state.artifacts) as DecryptedArtifact[];

    const filtered = args.taskId
        ? allArtifacts.filter(a => a.taskId === args.taskId)
        : allArtifacts;

    if (filtered.length === 0) {
        return 'No artifacts found';
    }

    const items = filtered.map(a => ({
        id: a.id,
        title: a.title,
        updatedAt: a.updatedAt,
    }));

    return JSON.stringify(items, null, 2);
}

async function updateArtifact(args: { artifactId: string; title?: string; body?: string }): Promise<string> {
    const state = storage.getState();
    const current = state.artifacts[args.artifactId];
    if (!current) throw new Error(`Artifact not found: ${args.artifactId}`);

    const newTitle = args.title !== undefined ? args.title : (current.title ?? null);
    const newBody = args.body !== undefined ? args.body : (current.body ?? null);

    await sync.updateArtifact(args.artifactId, newTitle, newBody, current.sessions, current.draft);
    return JSON.stringify({ success: true, artifactId: args.artifactId });
}
