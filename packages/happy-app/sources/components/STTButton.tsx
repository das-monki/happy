/**
 * Speech-to-text microphone button for the AgentInput action bar.
 *
 * Tap to start recording, tap again to stop and transcribe.
 * Shows visual states: idle (mic icon), downloading (progress), recording (red mic), transcribing (spinner).
 * Returns null when the feature is disabled or on web.
 */
import * as React from "react";
import { Platform, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUnistyles } from "react-native-unistyles";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { hapticsLight } from "./haptics";

interface STTButtonProps {
  onTranscription: (text: string) => void;
}

export const STTButton = React.memo(function STTButton({
  onTranscription,
}: STTButtonProps) {
  const { theme } = useUnistyles();
  const { state, toggle, enabled } = useSpeechToText({ onTranscription });

  if (!enabled || Platform.OS === "web") {
    return null;
  }

  const handlePress = React.useCallback(() => {
    hapticsLight();
    toggle();
  }, [toggle]);

  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const isDownloading = state === "downloading";
  const isBusy = isTranscribing || isDownloading;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isBusy}
      hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
      style={(p) => ({
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        opacity: p.pressed ? 0.7 : 1,
      })}
    >
      {isBusy ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.text}
        />
      ) : (
        <Ionicons
          name={isRecording ? "mic" : "mic-outline"}
          size={20}
          color={isRecording ? "#FF3B30" : theme.colors.text}
        />
      )}
    </Pressable>
  );
});
