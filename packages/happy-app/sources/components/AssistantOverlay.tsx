/**
 * Full-screen modal overlay for the assistant chat.
 *
 * Shows an inverted FlatList of messages (reusing MessageView),
 * a two-row input bar with stop/restart + STT + send, and empty / loading states.
 *
 * Keyboard handling uses react-native-keyboard-controller with animated
 * transforms (matching AgentContentView.ios.tsx) to work reliably inside
 * a pageSheet modal.
 */
import * as React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Platform,
  Modal as RNModal,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from "react-native";
import {
  useReanimatedKeyboardAnimation,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Typography } from "@/constants/Typography";
import { MessageView } from "./MessageView";
import { StatusDot } from "./StatusDot";
import { STTButton } from "./STTButton";
import { STTWaveform } from "./STTWaveform";
import { FloatingOverlay } from "./FloatingOverlay";
import {
  getAvailablePermissionModes,
  getAvailableModels,
  getDefaultPermissionModeKey,
  getDefaultModelKey,
  resolveCurrentOption,
} from "./modelModeOptions";
import type { PermissionMode, ModelMode } from "./modelModeOptions";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useCLIDetection } from "@/hooks/useCLIDetection";
import { Modal } from "@/modal";
import { t } from "@/text";
import { storage, useSetting } from "@/sync/storage";
import { sync } from "@/sync/sync";
import { useShallow } from "zustand/react/shallow";
import type { AssistantSession } from "@/hooks/useAssistantSession";
import type { Message } from "@/sync/typesMessage";

const mascot = require("@/assets/images/mascot.png");

interface AssistantOverlayProps {
  visible: boolean;
  onClose: () => void;
  assistant: AssistantSession;
}

export const AssistantOverlay = React.memo(
  ({ visible, onClose, assistant }: AssistantOverlayProps) => {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const [inputText, setInputText] = React.useState("");
    const inputRef = React.useRef<TextInput>(null);

    // Agent settings — visible when no session is active
    const experimentsEnabled = useSetting("experiments");
    const lastUsedPermissionMode = useSetting("lastUsedPermissionMode");
    const lastUsedModelMode = useSetting("lastUsedModelMode");
    const cliAvailability = useCLIDetection(assistant.onlineMachineId);

    const [showSettings, setShowSettings] = React.useState(false);

    const handleAgentTypeClick = React.useCallback(() => {
      const order: Array<"claude" | "codex" | "gemini"> = experimentsEnabled
        ? ["claude", "codex", "gemini"]
        : ["claude", "codex"];
      assistant.setAgent(
        (() => {
          const currentIdx = order.indexOf(assistant.agent);
          for (let i = 1; i <= order.length; i++) {
            const candidate = order[(currentIdx + i) % order.length];
            if (cliAvailability[candidate] !== false) return candidate;
          }
          return assistant.agent;
        })(),
      );
    }, [experimentsEnabled, cliAvailability, assistant]);

    const availableModes = React.useMemo(
      () => getAvailablePermissionModes(assistant.agent, null, t),
      [assistant.agent],
    );
    const availableModels = React.useMemo(
      () => getAvailableModels(assistant.agent, null, t),
      [assistant.agent],
    );

    const [selectedPermissionMode, setSelectedPermissionMode] =
      React.useState<PermissionMode>(
        () =>
          resolveCurrentOption(availableModes, [
            lastUsedPermissionMode,
            getDefaultPermissionModeKey(assistant.agent),
          ]) ?? availableModes[0],
      );
    const [selectedModelMode, setSelectedModelMode] =
      React.useState<ModelMode>(
        () =>
          resolveCurrentOption(availableModels, [
            lastUsedModelMode,
            getDefaultModelKey(assistant.agent),
          ]) ?? availableModels[0],
      );

    // Reset permission mode & model when agent type changes
    React.useEffect(() => {
      setSelectedPermissionMode(
        resolveCurrentOption(availableModes, [
          getDefaultPermissionModeKey(assistant.agent),
        ]) ?? availableModes[0],
      );
      setSelectedModelMode(
        resolveCurrentOption(availableModels, [
          getDefaultModelKey(assistant.agent),
        ]) ?? availableModels[0],
      );
    }, [assistant.agent, availableModes, availableModels]);

    // Close settings overlay when session starts
    React.useEffect(() => {
      if (assistant.sessionId) setShowSettings(false);
    }, [assistant.sessionId]);

    const handleSpawn = React.useCallback(() => {
      assistant.spawn(
        selectedPermissionMode.key,
        selectedModelMode?.key ?? null,
      );
      sync.applySettings({
        lastUsedAgent: assistant.agent,
        lastUsedPermissionMode: selectedPermissionMode.key,
        lastUsedModelMode: selectedModelMode?.key ?? null,
      });
    }, [assistant, selectedPermissionMode, selectedModelMode]);

    // Keyboard animation (same approach as AgentContentView.ios.tsx)
    const keyboard = useReanimatedKeyboardAnimation();
    const animatedPadding = useSharedValue(0);
    useKeyboardHandler(
      {
        onEnd(e) {
          "worklet";
          animatedPadding.value =
            e.progress === 1
              ? -keyboard.height.value - safeArea.bottom
              : 0;
        },
        onStart() {
          "worklet";
          animatedPadding.value = 0;
        },
      },
      [safeArea.bottom],
    );

    const animatedContentStyle = useAnimatedStyle(
      () => ({
        paddingTop: animatedPadding.value,
        transform: [
          {
            translateY:
              keyboard.height.value +
              safeArea.bottom * keyboard.progress.value,
          },
        ],
      }),
      [safeArea.bottom],
    );

    const animatedInputStyle = useAnimatedStyle(
      () => ({
        transform: [
          {
            translateY:
              keyboard.height.value +
              safeArea.bottom * keyboard.progress.value,
          },
        ],
      }),
      [safeArea.bottom],
    );

    // Count pending tool requests on the assistant session
    const pendingToolCount = storage(
      useShallow((state) => {
        if (!assistant.sessionId) return 0;
        const requests =
          state.sessions[assistant.sessionId]?.agentState?.toolRequests;
        return requests ? Object.keys(requests).length : 0;
      }),
    );

    const handleSend = React.useCallback(() => {
      const trimmed = inputText.trim();
      if (!trimmed || !assistant.sessionId) return;
      assistant.send(trimmed);
      setInputText("");
    }, [inputText, assistant]);

    const handleClear = React.useCallback(async () => {
      const confirmed = await Modal.confirm(
        t("assistant.clearConfirmTitle"),
        t("assistant.clearConfirmMessage"),
        { confirmText: t("assistant.clearConversation") },
      );
      if (confirmed) {
        assistant.clear();
      }
    }, [assistant]);

    const handleTranscription = React.useCallback((text: string) => {
      setInputText((prev) => (prev ? prev + " " + text : text));
    }, []);
    const stt = useSpeechToText({ onTranscription: handleTranscription });

    const keyExtractor = React.useCallback((item: Message) => item.id, []);
    const renderItem = React.useCallback(
      ({ item }: { item: Message }) => (
        <MessageView
          message={item}
          metadata={assistant.metadata}
          sessionId={assistant.sessionId!}
        />
      ),
      [assistant.metadata, assistant.sessionId],
    );

    const showEmptyState =
      !assistant.sessionId || assistant.messages.length === 0;
    const canSend =
      (inputText.trim().length > 0 && assistant.status === "connected") ||
      assistant.status === "thinking";
    const isThinking = assistant.status === "thinking";
    const isConnected =
      assistant.status === "connected" || assistant.status === "thinking";

    // Status text + dot for the connection indicator
    const statusColor = isConnected
      ? theme.colors.success
      : theme.colors.textSecondary;
    const statusText = isThinking
      ? t("assistant.thinking")
      : isConnected
        ? t("assistant.connected")
        : t("assistant.disconnected");

    return (
      <RNModal
        visible={visible}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={onClose}
      >
        <View
          style={[
            styles.root,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {/* Header — zIndex ensures touches reach the close button even when
              the keyboard-animated body overlaps (translateY shifts it upward) */}
          <View
            style={[
              styles.header,
              {
                zIndex: 1,
                paddingTop: Platform.OS === "ios" ? 16 : safeArea.top + 8,
                borderBottomColor: theme.colors.divider,
              },
            ]}
          >
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {t("assistant.title")}
            </Text>
            <View style={styles.headerButtons}>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.headerButton}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Message list or empty state */}
          <View style={styles.body}>
            {assistant.status === "no_machine" ? (
              <EmptyState
                title={t("assistant.emptyTitle")}
                description={t("assistant.noMachineOnline")}
              />
            ) : !assistant.sessionId ? (
              <EmptyState
                title={t("assistant.emptyTitle")}
                description={t("assistant.emptyDescription")}
                actionLabel={t("assistant.startAssistant")}
                onAction={handleSpawn}
                loading={assistant.spawning}
              >
                {/* Agent type & settings row */}
                <View style={{ position: "relative", width: "100%", marginTop: 20 }}>
                  {showSettings && (
                    <>
                      <TouchableWithoutFeedback
                        onPress={() => setShowSettings(false)}
                      >
                        <View
                          style={{
                            position: "absolute",
                            top: -1000,
                            left: -1000,
                            right: -1000,
                            bottom: -1000,
                            zIndex: 999,
                          }}
                        />
                      </TouchableWithoutFeedback>
                      <View
                        style={{
                          position: "absolute",
                          bottom: "100%",
                          left: 0,
                          right: 0,
                          marginBottom: 4,
                          zIndex: 1000,
                        }}
                      >
                        <FloatingOverlay maxHeight={300}>
                          {/* Permission Mode */}
                          <View style={{ paddingVertical: 8 }}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: theme.colors.textSecondary,
                                paddingHorizontal: 16,
                                paddingBottom: 4,
                              }}
                            >
                              {t("agentInput.permissionMode.title")}
                            </Text>
                            {availableModes.map((mode) => {
                              const isSelected =
                                selectedPermissionMode.key === mode.key;
                              return (
                                <Pressable
                                  key={mode.key}
                                  onPress={() =>
                                    setSelectedPermissionMode(mode)
                                  }
                                  style={({ pressed }) => ({
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingHorizontal: 16,
                                    paddingVertical: 8,
                                    backgroundColor: pressed
                                      ? theme.colors.surfaceRipple
                                      : "transparent",
                                  })}
                                >
                                  <View
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 8,
                                      borderWidth: 2,
                                      borderColor: isSelected
                                        ? theme.colors.radio.active
                                        : theme.colors.radio.inactive,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginRight: 12,
                                    }}
                                  >
                                    {isSelected && (
                                      <View
                                        style={{
                                          width: 6,
                                          height: 6,
                                          borderRadius: 3,
                                          backgroundColor:
                                            theme.colors.radio.dot,
                                        }}
                                      />
                                    )}
                                  </View>
                                  <Text
                                    style={{
                                      flex: 1,
                                      fontSize: 14,
                                      color: isSelected
                                        ? theme.colors.radio.active
                                        : theme.colors.text,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {mode.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <View
                            style={{
                              height: 1,
                              backgroundColor: theme.colors.divider,
                              marginHorizontal: 16,
                            }}
                          />
                          {/* Model */}
                          <View style={{ paddingVertical: 8 }}>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: theme.colors.textSecondary,
                                paddingHorizontal: 16,
                                paddingBottom: 4,
                              }}
                            >
                              {t("agentInput.model.title")}
                            </Text>
                            {availableModels.map((model) => {
                              const isSelected =
                                selectedModelMode.key === model.key;
                              return (
                                <Pressable
                                  key={model.key}
                                  onPress={() => setSelectedModelMode(model)}
                                  style={({ pressed }) => ({
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingHorizontal: 16,
                                    paddingVertical: 8,
                                    backgroundColor: pressed
                                      ? theme.colors.surfaceRipple
                                      : "transparent",
                                  })}
                                >
                                  <View
                                    style={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 8,
                                      borderWidth: 2,
                                      borderColor: isSelected
                                        ? theme.colors.radio.active
                                        : theme.colors.radio.inactive,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginRight: 12,
                                    }}
                                  >
                                    {isSelected && (
                                      <View
                                        style={{
                                          width: 6,
                                          height: 6,
                                          borderRadius: 3,
                                          backgroundColor:
                                            theme.colors.radio.dot,
                                        }}
                                      />
                                    )}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        color: isSelected
                                          ? theme.colors.radio.active
                                          : theme.colors.text,
                                      }}
                                      numberOfLines={1}
                                    >
                                      {model.name}
                                    </Text>
                                    {model.description ? (
                                      <Text
                                        style={{
                                          fontSize: 11,
                                          color: theme.colors.textSecondary,
                                        }}
                                        numberOfLines={1}
                                      >
                                        {model.description}
                                      </Text>
                                    ) : null}
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        </FloatingOverlay>
                      </View>
                    </>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Pressable
                      onPress={handleAgentTypeClick}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 16,
                        opacity: pressed ? 0.7 : 1,
                        gap: 5,
                      })}
                    >
                      <Ionicons
                        name="hardware-chip-outline"
                        size={14}
                        color={
                          cliAvailability[assistant.agent] === null
                            ? theme.colors.textSecondary
                            : cliAvailability[assistant.agent]
                              ? theme.colors.success
                              : theme.colors.textDestructive
                        }
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color:
                            cliAvailability[assistant.agent] === null
                              ? theme.colors.textSecondary
                              : cliAvailability[assistant.agent]
                                ? theme.colors.success
                                : theme.colors.textDestructive,
                        }}
                      >
                        {assistant.agent === "claude"
                          ? t("agentInput.agent.claude")
                          : assistant.agent === "codex"
                            ? t("agentInput.agent.codex")
                            : t("agentInput.agent.gemini")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setShowSettings((prev) => !prev)}
                      style={({ pressed }) => ({
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 16,
                        opacity: pressed ? 0.7 : 1,
                        gap: 5,
                        minWidth: 0,
                      })}
                    >
                      <Ionicons
                        name="settings-outline"
                        size={14}
                        color={theme.colors.textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 13,
                          color: theme.colors.textSecondary,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {selectedPermissionMode.name} ·{" "}
                        {selectedModelMode.name}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </EmptyState>
            ) : showEmptyState &&
              (assistant.status === "spawning" || assistant.spawning) ? (
              <EmptyState
                title={t("assistant.emptyTitle")}
                description={t("assistant.connecting")}
                loading={true}
              />
            ) : (
              <Animated.View style={[styles.body, animatedContentStyle]}>
                <FlatList
                  data={assistant.messages}
                  inverted={true}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  maintainVisibleContentPosition={{
                    minIndexForVisible: 0,
                    autoscrollToTopThreshold: 10,
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={
                    Platform.OS === "ios" ? "interactive" : "none"
                  }
                  contentContainerStyle={styles.listContent}
                />
              </Animated.View>
            )}
          </View>

          {/* Input bar */}
          {assistant.sessionId && (
            <Animated.View
              style={[
                styles.inputContainer,
                {
                  paddingBottom: (safeArea.bottom || 8) + 8,
                },
                animatedInputStyle,
              ]}
            >
              {/* Tool-pending indicator */}
              {pendingToolCount > 0 && (
                <View style={styles.toolPendingBar}>
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.toolPendingText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {t("assistant.runningTools")}
                  </Text>
                </View>
              )}

              {/* Status row */}
              <View style={styles.statusRow}>
                <View style={styles.statusRowInner}>
                  <StatusDot
                    color={statusColor}
                    isPulsing={isThinking}
                    size={6}
                  />
                  <Text
                    style={[styles.statusText, { color: statusColor }]}
                  >
                    {statusText}
                  </Text>
                </View>
              </View>

              {/* Unified panel (matching AgentInput) */}
              <View
                style={[
                  styles.unifiedPanel,
                  { backgroundColor: theme.colors.input.background },
                ]}
              >
                {/* Row 1: Text input */}
                <View style={styles.inputFieldContainer}>
                  <TextInput
                    ref={inputRef}
                    style={[styles.textInput, { color: theme.colors.text }]}
                    placeholder={t("assistant.placeholder")}
                    placeholderTextColor={theme.colors.textSecondary}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={10000}
                    onSubmitEditing={handleSend}
                    blurOnSubmit={false}
                    returnKeyType="send"
                  />
                </View>

                {/* Row 2: Action buttons */}
                <View style={styles.actionButtonsRow}>
                  <View style={styles.actionButtonsLeft}>
                    {stt.state === "recording" || stt.state === "transcribing" ? (
                      <>
                        <Pressable
                          onPress={stt.cancel}
                          hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
                          style={({ pressed }) => [
                            styles.actionButton,
                            { opacity: pressed ? 0.7 : 1 },
                          ]}
                        >
                          <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
                        </Pressable>
                        <STTWaveform
                          level={stt.audioLevel}
                          isRecording={stt.state === "recording"}
                        />
                      </>
                    ) : (
                    <>
                    {/* Abort button */}
                    <Pressable
                      onPress={assistant.abort}
                      disabled={assistant.aborting || !isThinking}
                      hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                      style={({ pressed }) => [
                        styles.actionButton,
                        {
                          opacity:
                            !isThinking && !assistant.aborting
                              ? 0.35
                              : pressed
                                ? 0.7
                                : 1,
                        },
                      ]}
                    >
                      {assistant.aborting ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.button.secondary.tint}
                        />
                      ) : (
                        <Octicons
                          name="stop"
                          size={16}
                          color={theme.colors.button.secondary.tint}
                        />
                      )}
                    </Pressable>

                    {/* Restart button */}
                    <Pressable
                      onPress={handleClear}
                      disabled={assistant.clearing}
                      hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                      style={({ pressed }) => [
                        styles.actionButton,
                        { opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      {assistant.clearing ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.button.secondary.tint}
                        />
                      ) : (
                        <Ionicons
                          name="refresh-outline"
                          size={16}
                          color={theme.colors.button.secondary.tint}
                        />
                      )}
                    </Pressable>
                    </>
                    )}
                  </View>

                  {/* STT button */}
                  <STTButton
                    state={stt.state}
                    enabled={stt.enabled}
                    onToggle={stt.toggle}
                  />

                  {/* Send button */}
                  <Pressable
                    onPress={handleSend}
                    disabled={!canSend}
                    hitSlop={5}
                    style={[
                      styles.sendButton,
                      {
                        backgroundColor: canSend
                          ? theme.colors.button.primary.background
                          : theme.colors.button.primary.disabled,
                      },
                    ]}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.sendButtonInner,
                          pressed && styles.sendButtonInnerPressed,
                        ]}
                      >
                        <Octicons
                          name="arrow-up"
                          size={16}
                          color={theme.colors.button.primary.tint}
                        />
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )}
        </View>
      </RNModal>
    );
  },
);

// Empty / loading state within the overlay
const EmptyState = React.memo(
  ({
    title,
    description,
    actionLabel,
    onAction,
    loading,
    children,
  }: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    loading?: boolean;
    children?: React.ReactNode;
  }) => {
    const { theme } = useUnistyles();
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={mascot}
          style={{ width: 80, height: 80 }}
          contentFit="cover"
        />
        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.emptyDescription,
            { color: theme.colors.textSecondary },
          ]}
        >
          {description}
        </Text>
        {children}
        {loading && (
          <ActivityIndicator
            style={{ marginTop: 16 }}
            color={theme.colors.textSecondary}
          />
        )}
        {actionLabel && onAction && !loading && (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [
              styles.emptyActionButton,
              {
                backgroundColor: theme.colors.button.primary.background,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.emptyActionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    ...Typography.default("semiBold"),
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingVertical: 8,
  },

  // Input area — matches AgentInput container
  inputContainer: {
    alignItems: "center",
    paddingBottom: 8,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  toolPendingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 4,
  },
  toolPendingText: {
    fontSize: 13,
    ...Typography.default(),
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
    width: "100%",
    minHeight: 20,
  },
  statusRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    ...Typography.default(),
  },

  // Unified panel — matches AgentInput.unifiedPanel
  unifiedPanel: {
    borderRadius: Platform.select({ default: 16, android: 20 }),
    overflow: "hidden",
    paddingVertical: 2,
    paddingBottom: 8,
    paddingHorizontal: 8,
    width: "100%",
  },
  inputFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 4,
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingTop: Platform.OS === "web" ? 10 : 8,
    paddingBottom: Platform.OS === "web" ? 10 : 8,
    ...Typography.default(),
  },

  // Action buttons — matches AgentInput.actionButtonsContainer
  actionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  actionButtonsLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    overflow: "hidden",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Platform.select({ default: 16, android: 20 }),
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: "center",
    height: 32,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    marginLeft: 8,
  },
  sendButtonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonInnerPressed: {
    opacity: 0.7,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    ...Typography.default("semiBold"),
  },
  emptyDescription: {
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
    ...Typography.default(),
  },
  emptyActionButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyActionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    ...Typography.default("semiBold"),
  },
}));
