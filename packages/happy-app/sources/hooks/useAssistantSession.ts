/**
 * Hook managing the assistant session lifecycle.
 *
 * Handles spawning a hidden CLI session on the first online machine,
 * tracking session messages/status, sending messages, and clearing
 * (kill + delete + respawn) the conversation.
 */
import * as React from "react";
import {
  useSettingMutable,
  useAllMachines,
  useSessionMessages,
  useAssistantSessionData,
} from "@/sync/storage";
import { isMachineOnline } from "@/utils/machineUtils";
import { machineSpawnNewSession, sessionKill, sessionDelete } from "@/sync/ops";
import { sync } from "@/sync/sync";
import { storage } from "@/sync/storage";
import { useHappyAction } from "./useHappyAction";
import type { Message } from "@/sync/typesMessage";
import type { Metadata } from "@/sync/storageTypes";

const ASSISTANT_SYSTEM_PROMPT = `You are Happy Assistant, a helpful AI assistant embedded in the Happy app. You help users manage their tasks, sessions, and day-to-day work. Be concise and helpful.

You have MCP tools to interact with the app:
- list_tasks: List tasks (filter by status: all/active/completed/failed/archived)
- create_task: Create a new task (title, optional description and directory)
- update_task: Update a task (title, description, status, archived)
- list_sessions: List CLI sessions (with directory, thinking/idle status)
- get_inbox: Get tasks waiting for user input
- send_message_to_session: Send a message to another session
- start_session: Spawn a new CLI session (directory, agent, optional task link and initial message)
- approve_permission: Approve or deny a pending permission request on a session (only works if the user has enabled auto-approve in settings)

Use these tools proactively when the user asks about their tasks, sessions, or wants to manage work. Always use the tools to get real data rather than guessing.`;

export interface AssistantSession {
  sessionId: string | null;
  status: "no_machine" | "idle" | "spawning" | "connected" | "thinking";
  messages: Message[];
  metadata: Metadata | null;
  agent: "claude" | "codex" | "gemini";
  setAgent: (agent: "claude" | "codex" | "gemini") => void;
  spawn: () => void;
  spawning: boolean;
  send: (text: string) => void;
  clear: () => void;
  clearing: boolean;
}

export function useAssistantSession(): AssistantSession {
  const [sessionId, setSessionId] = useSettingMutable("assistantSessionId");
  const [agent, setAgent] = useSettingMutable("assistantAgent");
  const machines = useAllMachines();
  const session = useAssistantSessionData();
  const { messages } = useSessionMessages(sessionId ?? "");

  // Find first online machine
  const onlineMachine = React.useMemo(
    () => machines.find(isMachineOnline) ?? null,
    [machines],
  );

  // Derive status
  const status = React.useMemo<AssistantSession["status"]>(() => {
    if (!onlineMachine) return "no_machine";
    if (!sessionId || !session) return "idle";
    if (session.thinking) return "thinking";
    if (session.active) return "connected";
    return "idle";
  }, [onlineMachine, sessionId, session]);

  // On mount: if assistantSessionId is set but session is dead, clear it
  React.useEffect(() => {
    if (sessionId && session && !session.active) {
      // Session is dead — clear the reference so user sees idle state
      sync.applySettings({ assistantSessionId: null });
    }
  }, [sessionId, session]);

  // Spawn action
  const [spawning, doSpawn] = useHappyAction(
    React.useCallback(async () => {
      if (!onlineMachine) return;
      const homeDir = onlineMachine.metadata?.happyHomeDir ?? "~/.happy";
      const directory = homeDir + "/assistant/";

      const result = await machineSpawnNewSession({
        machineId: onlineMachine.id,
        directory,
        approvedNewDirectoryCreation: true,
        agent,
        isAssistant: true,
        agentSystemPrompt: ASSISTANT_SYSTEM_PROMPT,
      });

      if (result.type === "success") {
        sync.applySettings({ assistantSessionId: result.sessionId });
      } else if (result.type === "error") {
        throw new Error(result.errorMessage);
      }
    }, [onlineMachine, agent]),
  );

  // Send message
  const send = React.useCallback(
    (text: string) => {
      if (!sessionId) return;
      sync.sendMessage(sessionId, text);
    },
    [sessionId],
  );

  // Clear: kill + delete + respawn
  const [clearing, doClear] = useHappyAction(
    React.useCallback(async () => {
      const currentId = sessionId;
      if (currentId) {
        await sessionKill(currentId);
        await sessionDelete(currentId);
        // Remove session from local storage so it vanishes from UI immediately
        storage.getState().deleteSession(currentId);
      }
      // Clear the setting
      sync.applySettings({ assistantSessionId: null });

      // Auto-respawn
      if (!onlineMachine) return;
      const homeDir = onlineMachine.metadata?.happyHomeDir ?? "~/.happy";
      const directory = homeDir + "/assistant/";

      const result = await machineSpawnNewSession({
        machineId: onlineMachine.id,
        directory,
        approvedNewDirectoryCreation: true,
        agent,
        isAssistant: true,
        agentSystemPrompt: ASSISTANT_SYSTEM_PROMPT,
      });

      if (result.type === "success") {
        sync.applySettings({ assistantSessionId: result.sessionId });
      }
    }, [sessionId, onlineMachine, agent]),
  );

  return {
    sessionId,
    status,
    messages,
    metadata: session?.metadata ?? null,
    agent,
    setAgent,
    spawn: doSpawn,
    spawning,
    send,
    clear: doClear,
    clearing,
  };
}
