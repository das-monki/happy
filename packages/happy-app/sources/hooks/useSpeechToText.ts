/**
 * Core speech-to-text hook using whisper.rn for on-device transcription.
 *
 * State machine: idle → downloading → recording → transcribing → idle
 *
 * Recording uses expo-audio at 16kHz mono (required by Whisper).
 * Whisper context is initialized once per model and cached in a ref.
 * AsyncLock prevents concurrent recording/transcription operations.
 * Tracks recording duration via an interval timer (updates every second).
 * Supports cancel (stop recording without transcribing).
 * Migrates old .en model IDs to multilingual IDs on first use.
 * On web this hook is a no-op.
 */
import * as React from "react";
import { Platform } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
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
  WHISPER_MODELS,
} from "./useWhisperModelManager";
import { useSetting, useSettingMutable } from "@/sync/storage";

export type STTState = "idle" | "downloading" | "recording" | "transcribing";

interface UseSpeechToTextOptions {
  onTranscription: (text: string) => void;
}

// Migration map: old English-only model IDs → multilingual equivalents
const MODEL_MIGRATION: Record<string, string> = {
  "tiny.en": "tiny",
  "base.en": "base",
  "small.en": "small",
};

// 16kHz mono WAV recording options for Whisper compatibility.
// isMeteringEnabled gives us audio levels for waveform visualization.
const RECORDING_OPTIONS = {
  isMeteringEnabled: true,
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

// Convert dBFS metering value (-160..0) to a 0..1 linear scale.
function dbToLinear(db: number): number {
  // Clamp to a reasonable range (-60 dB is effectively silence)
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

const lock = new AsyncLock();

export function useSpeechToText({ onTranscription }: UseSpeechToTextOptions) {
  const speechToTextEnabled = useSetting("speechToTextEnabled");
  const [speechToTextModel, setSpeechToTextModel] =
    useSettingMutable("speechToTextModel");
  const speechToTextLanguage = useSetting("speechToTextLanguage");
  const [state, setState] = React.useState<STTState>("idle");
  const [downloadProgress, setDownloadProgress] = React.useState(0);
  const [recordingDuration, setRecordingDuration] = React.useState(0);

  const whisperContextRef = React.useRef<WhisperContext | null>(null);
  const currentModelRef = React.useRef<string | null>(null);
  const durationIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const modelManager = useWhisperModelManager();
  const modelManagerRef = React.useRef(modelManager);
  modelManagerRef.current = modelManager;
  const onTranscriptionRef = React.useRef(onTranscription);
  onTranscriptionRef.current = onTranscription;

  // Start/stop the recording duration timer
  const startDurationTimer = React.useCallback(() => {
    setRecordingDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = React.useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Release whisper context and timer on unmount
  React.useEffect(() => {
    return () => {
      whisperContextRef.current?.release();
      whisperContextRef.current = null;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Ensure model is downloaded and whisper context is ready.
  // Migrates old .en model IDs to multilingual equivalents.
  const ensureReady = React.useCallback(async (): Promise<boolean> => {
    let modelId = speechToTextModel;

    // Migrate old .en model IDs
    if (MODEL_MIGRATION[modelId]) {
      modelId = MODEL_MIGRATION[modelId];
      setSpeechToTextModel(modelId);
    }

    // Verify model ID is valid
    if (!WHISPER_MODELS.find((m) => m.id === modelId)) {
      modelId = "tiny";
      setSpeechToTextModel(modelId);
    }

    const mm = modelManagerRef.current;
    const modelStatus = mm.models.find((m) => m.id === modelId);

    // Download if needed
    if (!modelStatus?.ready) {
      setState("downloading");
      await mm.downloadModel(modelId);
      const filePath = getModelFilePath(modelId);
      if (!filePath) return false;
    }

    // Initialize or re-initialize whisper context if model changed
    const filePath = getModelFilePath(modelId);
    if (!filePath) return false;

    if (currentModelRef.current !== modelId || !whisperContextRef.current) {
      if (whisperContextRef.current) {
        await whisperContextRef.current.release();
        whisperContextRef.current = null;
      }
      const ctx = await initWhisper({ filePath });
      whisperContextRef.current = ctx;
      currentModelRef.current = modelId;
    }

    return true;
  }, [speechToTextModel, setSpeechToTextModel]);

  const toggle = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    if (!speechToTextEnabled) return;

    // If recording, stop and transcribe
    if (state === "recording") {
      await lock.inLock(async () => {
        try {
          stopDurationTimer();
          await recorder.stop();
          const audioUri = recorder.uri;
          if (!audioUri) {
            setState("idle");
            return;
          }

          setState("transcribing");
          if (!whisperContextRef.current) {
            setState("idle");
            return;
          }

          const language =
            speechToTextLanguage === "auto" ? undefined : speechToTextLanguage;
          const { promise } = whisperContextRef.current.transcribe(audioUri, {
            language,
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
          const permission = await requestMicrophonePermission();
          if (!permission.granted) {
            showMicrophonePermissionDeniedAlert(permission.canAskAgain);
            return;
          }

          const ready = await ensureReady();
          if (!ready) {
            setState("idle");
            return;
          }

          setState("recording");
          startDurationTimer();
          await recorder.prepareToRecordAsync();
          recorder.record();
        } catch (error) {
          console.error("[STT] Failed to start recording:", error);
          stopDurationTimer();
          setState("idle");
        }
      });
    }
  }, [
    state,
    speechToTextEnabled,
    speechToTextLanguage,
    recorder,
    ensureReady,
    startDurationTimer,
    stopDurationTimer,
  ]);

  // Cancel: stop recording without transcribing
  const cancel = React.useCallback(async () => {
    if (Platform.OS === "web") return;
    if (state !== "recording") return;

    await lock.inLock(async () => {
      try {
        stopDurationTimer();
        await recorder.stop();
      } catch (error) {
        console.error("[STT] Cancel failed:", error);
      } finally {
        setState("idle");
      }
    });
  }, [state, recorder, stopDurationTimer]);

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

  // Audio level (0-1) from recorder metering, used for waveform visualization
  const audioLevel =
    state === "recording" && recorderState.metering != null
      ? dbToLinear(recorderState.metering)
      : 0;

  return {
    state,
    toggle,
    cancel,
    downloadProgress,
    recordingDuration,
    audioLevel,
    enabled: speechToTextEnabled && Platform.OS !== "web",
  };
}
