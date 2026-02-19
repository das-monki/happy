/**
 * Presentational speech-to-text microphone button.
 *
 * Shows visual states: idle (mic icon), downloading (progress),
 * recording (red mic + pulsing ring), transcribing (spinner).
 * All state is passed in via props — the parent owns useSpeechToText.
 */
import * as React from "react";
import { Platform, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUnistyles } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { hapticsLight } from "./haptics";
import type { STTState } from "@/hooks/useSpeechToText";

interface STTButtonProps {
  state: STTState;
  enabled: boolean;
  onToggle: () => void;
}

export const STTButton = React.memo(function STTButton({
  state,
  enabled,
  onToggle,
}: STTButtonProps) {
  const { theme } = useUnistyles();

  if (!enabled || Platform.OS === "web") {
    return null;
  }

  const handlePress = React.useCallback(() => {
    hapticsLight();
    onToggle();
  }, [onToggle]);

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
        <ActivityIndicator size="small" color={theme.colors.text} />
      ) : (
        <>
          {isRecording && <PulsingRing />}
          <Ionicons
            name={isRecording ? "mic" : "mic-outline"}
            size={20}
            color={isRecording ? "#FF3B30" : theme.colors.text}
          />
        </>
      )}
    </Pressable>
  );
});

/** Animated red ring behind the mic icon while recording */
const PulsingRing = React.memo(function PulsingRing() {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.5, { duration: 800 }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(scale);
    };
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255, 59, 48, 0.4)",
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={animatedStyle} />;
});
