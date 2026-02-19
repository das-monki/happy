/**
 * Hook managing the assistant session lifecycle.
 *
 * Handles spawning a hidden CLI session on the first online machine,
 * tracking session messages/status, sending messages, and clearing
 * (kill + delete) the conversation. After clear the user returns to
 * idle so agent/mode settings are visible again.
 */
import * as React from "react";
import {
  useSettingMutable,
  useAllMachines,
  useSessionMessages,
  useAssistantSessionData,
} from "@/sync/storage";
import { isMachineOnline } from "@/utils/machineUtils";
import {
  machineSpawnNewSession,
  sessionKill,
  sessionDelete,
  sessionAbort,
} from "@/sync/ops";
import { sync } from "@/sync/sync";
import { storage } from "@/sync/storage";
import { useHappyAction } from "./useHappyAction";
import type { Message } from "@/sync/typesMessage";
import type { Metadata } from "@/sync/storageTypes";

/**
 * Builds the assistant system prompt by concatenating the agent prompt
 * and soul prompt from settings, skipping empty values.
 */
function buildAssistantPrompt(): string {
  const { settings } = storage.getState();
  const parts: string[] = [];
  if (settings.assistantAgentPrompt.trim()) {
    parts.push(settings.assistantAgentPrompt.trim());
  }
  if (settings.assistantSoulPrompt.trim()) {
    parts.push(settings.assistantSoulPrompt.trim());
  }
  return parts.join("\n\n");
}

export interface AssistantSession {
  sessionId: string | null;
  status: "no_machine" | "idle" | "spawning" | "connected" | "thinking";
  messages: Message[];
  metadata: Metadata | null;
  agent: "claude" | "codex" | "gemini";
  setAgent: (agent: "claude" | "codex" | "gemini") => void;
  onlineMachineId: string | null;
  spawn: (permissionModeKey?: string, modelModeKey?: string | null) => void;
  spawning: boolean;
  send: (text: string) => void;
  abort: () => void;
  aborting: boolean;
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

  // Spawn action — accepts optional permission/model mode keys to apply after creation
  const spawnArgsRef = React.useRef<{
    permissionModeKey?: string;
    modelModeKey?: string | null;
  }>({});
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
        agentSystemPrompt: buildAssistantPrompt(),
      });

      if (result.type === "success") {
        const { permissionModeKey, modelModeKey } = spawnArgsRef.current;
        if (permissionModeKey) {
          storage
            .getState()
            .updateSessionPermissionMode(result.sessionId, permissionModeKey);
        }
        if (modelModeKey) {
          storage
            .getState()
            .updateSessionModelMode(result.sessionId, modelModeKey);
        }
        sync.applySettings({ assistantSessionId: result.sessionId });
      } else if (result.type === "error") {
        throw new Error(result.errorMessage);
      }
    }, [onlineMachine, agent]),
  );

  const spawn = React.useCallback(
    (permissionModeKey?: string, modelModeKey?: string | null) => {
      spawnArgsRef.current = { permissionModeKey, modelModeKey };
      doSpawn();
    },
    [doSpawn],
  );

  // Send message
  const send = React.useCallback(
    (text: string) => {
      if (!sessionId) return;
      sync.sendMessage(sessionId, text);
    },
    [sessionId],
  );

  // Abort: interrupt the current generation
  const [aborting, doAbort] = useHappyAction(
    React.useCallback(async () => {
      if (!sessionId) return;
      await sessionAbort(sessionId);
    }, [sessionId]),
  );

  // Clear: kill + delete, then return to idle so settings are visible again
  const [clearing, doClear] = useHappyAction(
    React.useCallback(async () => {
      const currentId = sessionId;
      if (currentId) {
        await sessionKill(currentId);
        await sessionDelete(currentId);
        // Remove session from local storage so it vanishes from UI immediately
        storage.getState().deleteSession(currentId);
      }
      // Clear the setting — user returns to idle state with settings visible
      sync.applySettings({ assistantSessionId: null });
    }, [sessionId]),
  );

  return {
    sessionId,
    status,
    messages,
    metadata: session?.metadata ?? null,
    agent,
    setAgent,
    onlineMachineId: onlineMachine?.id ?? null,
    spawn,
    spawning,
    send,
    abort: doAbort,
    aborting,
    clear: doClear,
    clearing,
  };
}
