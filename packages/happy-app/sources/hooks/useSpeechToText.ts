/**
 * Core speech-to-text hook using whisper.rn for on-device transcription.
 *
 * State machine: idle → downloading → recording → transcribing → idle
 *
 * Recording uses expo-audio at 16kHz mono (required by Whisper).
 * Whisper context is initialized once per model and cached in a ref.
 * AsyncLock prevents concurrent recording/transcription operations.
 * On web this hook is a no-op.
 */
import * as React from "react";
import { Platform } from "react-native";
import {
  useAudioRecorder,
  IOSOutputFormat,
  AudioQuality,
} from "expo-audio";
import { initWhisper, type WhisperContext } from "whisper.rn";
import { AsyncLock } from "@/utils/lock";
import {
  requestMicrophonePermission,
  showMicrophonePermissionDeniedAlert,
} from "@/utils/microphonePermissions";
import {
  getModelFilePath,
  useWhisperModelManager,
} from "./useWhisperModelManager";
import { useSetting } from "@/sync/storage";

export type STTState = "idle" | "downloading" | "recording" | "transcribing";

interface UseSpeechToTextOptions {
  onTranscription: (text: string) => void;
}

// 16kHz mono WAV recording options for Whisper compatibility.
const RECORDING_OPTIONS = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    outputFormat: "default" as const,
    audioEncoder: "default" as const,
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/wav",
    bitsPerSecond: 256000,
  },
};

const lock = new AsyncLock();

export function useSpeechToText({ onTranscription }: UseSpeechToTextOptions) {
  const speechToTextEnabled = useSetting("speechToTextEnabled");
  const speechToTextModel = useSetting("speechToTextModel");
  const [state, setState] = React.useState<STTState>("idle");
  const [downloadProgress, setDownloadProgress] = React.useState(0);

  const whisperContextRef = React.useRef<WhisperContext | null>(null);
  const currentModelRef = React.useRef<string | null>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const modelManager = useWhisperModelManager();
  const modelManagerRef = React.useRef(modelManager);
  modelManagerRef.current = modelManager;
  const onTranscriptionRef = React.useRef(onTranscription);
  onTranscriptionRef.current = onTranscription;

  // Release whisper context on unmount
  React.useEffect(() => {
    return () => {
      whisperContextRef.current?.release();
      whisperContextRef.current = null;
    };
  }, []);

  // Ensure model is downloaded and whisper context is ready
  const ensureReady = React.useCallback(async (): Promise<boolean> => {
    const modelId = speechToTextModel;
    const mm = modelManagerRef.current;
    const modelStatus = mm.models.find((m) => m.id === modelId);

    // Download if needed
    if (!modelStatus?.ready) {
      setState("downloading");
      await mm.downloadModel(modelId);
      // Re-check after download
      const filePath = getModelFilePath(modelId);
      if (!filePath) return false;
    }

    // Initialize or re-initialize whisper context if model changed
    const filePath = getModelFilePath(modelId);
    if (!filePath) return false;

    if (currentModelRef.current !== modelId || !whisperContextRef.current) {
      // Release old context
      if (whisperContextRef.current) {
        await whisperContextRef.current.release();
        whisperContextRef.current = null;
      }
      const ctx = await initWhisper({ filePath });
      whisperContextRef.current = ctx;
      currentModelRef.current = modelId;
    }

    return true;
  }, [speechToTextModel]);

  const toggle = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    if (!speechToTextEnabled) return;

    // If recording, stop and transcribe
    if (state === "recording") {
      await lock.inLock(async () => {
        try {
          // Stop recording
          await recorder.stop();
          const audioUri = recorder.uri;
          if (!audioUri) {
            setState("idle");
            return;
          }

          // Transcribe
          setState("transcribing");
          if (!whisperContextRef.current) {
            setState("idle");
            return;
          }

          const { promise } = whisperContextRef.current.transcribe(audioUri, {
            language: "en",
          });
          const result = await promise;
          const text = result?.result?.trim();
          if (text) {
            onTranscriptionRef.current(text);
          }
        } catch (error) {
          console.error("[STT] Transcription failed:", error);
        } finally {
          setState("idle");
        }
      });
      return;
    }

    // If idle, start a new recording
    if (state === "idle") {
      await lock.inLock(async () => {
        try {
          // Check permissions
          const permission = await requestMicrophonePermission();
          if (!permission.granted) {
            showMicrophonePermissionDeniedAlert(permission.canAskAgain);
            return;
          }

          // Ensure model and whisper context ready
          const ready = await ensureReady();
          if (!ready) {
            setState("idle");
            return;
          }

          // Start recording
          setState("recording");
          await recorder.prepareToRecordAsync();
          recorder.record();
        } catch (error) {
          console.error("[STT] Failed to start recording:", error);
          setState("idle");
        }
      });
    }
  }, [state, speechToTextEnabled, recorder, ensureReady]);

  // Watch model download progress for UI
  const currentModelStatus = modelManager.models.find(
    (m) => m.id === speechToTextModel,
  );
  const currentProgress = currentModelStatus?.downloading
    ? currentModelStatus.progress
    : downloadProgress;
  if (currentProgress !== downloadProgress) {
    setDownloadProgress(currentProgress);
  }

  return {
    state,
    toggle,
    downloadProgress,
    enabled: speechToTextEnabled && Platform.OS !== "web",
  };
}
