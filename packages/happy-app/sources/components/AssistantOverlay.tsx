/**
 * Full-screen modal overlay for the assistant chat.
 *
 * Shows an inverted FlatList of messages (reusing MessageView),
 * a simplified input bar with STT support, and empty / loading states.
 */
import * as React from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal as RNModal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Typography } from "@/constants/Typography";
import { MessageView } from "./MessageView";
import { STTButton } from "./STTButton";
import { Modal } from "@/modal";
import { t } from "@/text";
import { storage } from "@/sync/storage";
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

    return (
      <RNModal
        visible={visible}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          style={[
            styles.root,
            { backgroundColor: theme.colors.groupped.background },
          ]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                paddingTop: Platform.OS === "ios" ? 16 : safeArea.top + 8,
                borderBottomColor: theme.colors.divider,
              },
            ]}
          >
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              {t("assistant.title")}
            </Text>
            <View style={styles.headerButtons}>
              {assistant.sessionId && (
                <Pressable
                  onPress={handleClear}
                  hitSlop={10}
                  style={styles.headerButton}
                  disabled={assistant.clearing}
                >
                  {assistant.clearing ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.textSecondary}
                    />
                  ) : (
                    <Ionicons
                      name="refresh-outline"
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  )}
                </Pressable>
              )}
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
                onAction={assistant.spawn}
                loading={assistant.spawning}
              />
            ) : showEmptyState &&
              (assistant.status === "spawning" || assistant.spawning) ? (
              <EmptyState
                title={t("assistant.emptyTitle")}
                description={t("assistant.connecting")}
                loading={true}
              />
            ) : (
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
            )}
          </View>

          {/* Tool-pending indicator */}
          {assistant.sessionId && pendingToolCount > 0 && (
            <View
              style={[
                styles.toolPendingBar,
                { backgroundColor: theme.colors.surface },
              ]}
            >
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

          {/* Input bar */}
          {assistant.sessionId && (
            <View
              style={[
                styles.inputBar,
                {
                  paddingBottom: safeArea.bottom || 12,
                  borderTopColor: theme.colors.divider,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: theme.colors.groupped.background,
                    borderColor: theme.colors.divider,
                  },
                ]}
              >
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
                <STTButton onTranscription={handleTranscription} />
                <Pressable
                  onPress={handleSend}
                  disabled={!canSend}
                  hitSlop={5}
                  style={({ pressed }) => [
                    styles.sendButton,
                    {
                      backgroundColor: canSend
                        ? theme.colors.button.primary.background
                        : theme.colors.divider,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
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
  }: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    loading?: boolean;
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
              styles.actionButton,
              {
                backgroundColor: theme.colors.button.primary.background,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
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
  toolPendingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
  },
  toolPendingText: {
    fontSize: 13,
    ...Typography.default(),
  },
  inputBar: {
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 20,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    paddingTop: 4,
    paddingBottom: 4,
    ...Typography.default(),
  },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
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
  actionButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    ...Typography.default("semiBold"),
  },
}));
