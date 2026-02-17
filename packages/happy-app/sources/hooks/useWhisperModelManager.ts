/**
 * Hook for managing Whisper model files on-device.
 *
 * Downloads ggml-format Whisper models from HuggingFace on first use,
 * stores them in the app's document directory, and tracks download progress.
 * Models are persisted across app launches.
 */
import * as React from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { t } from "@/text";

const MODELS_DIR = `${FileSystem.documentDirectory}whisper-models/`;
const HUGGINGFACE_BASE =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";

export interface WhisperModelDefinition {
  id: string;
  label: string;
  size: string;
  fileName: string;
}

export const WHISPER_MODELS: WhisperModelDefinition[] = [
  {
    id: "tiny.en",
    label: t("settingsFeatures.speechToTextModelTinyEn"),
    size: t("settingsFeatures.speechToTextModelTinyEnSize"),
    fileName: "ggml-tiny.en.bin",
  },
  {
    id: "base.en",
    label: t("settingsFeatures.speechToTextModelBaseEn"),
    size: t("settingsFeatures.speechToTextModelBaseEnSize"),
    fileName: "ggml-base.en.bin",
  },
  {
    id: "small.en",
    label: t("settingsFeatures.speechToTextModelSmallEn"),
    size: t("settingsFeatures.speechToTextModelSmallEnSize"),
    fileName: "ggml-small.en.bin",
  },
];

export interface ModelStatus {
  id: string;
  ready: boolean;
  downloading: boolean;
  progress: number; // 0..1
}

export function getModelFilePath(modelId: string): string | null {
  const model = WHISPER_MODELS.find((m) => m.id === modelId);
  if (!model) return null;
  return MODELS_DIR + model.fileName;
}

export function useWhisperModelManager() {
  const [models, setModels] = React.useState<ModelStatus[]>(
    WHISPER_MODELS.map((m) => ({
      id: m.id,
      ready: false,
      downloading: false,
      progress: 0,
    })),
  );
  const downloadRef = React.useRef<
    Record<string, FileSystem.DownloadResumable>
  >({});

  // Check which models already exist on mount
  React.useEffect(() => {
    if (Platform.OS === "web") return;

    (async () => {
      // Ensure models directory exists
      const dirInfo = await FileSystem.getInfoAsync(MODELS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MODELS_DIR, {
          intermediates: true,
        });
      }

      const statuses = await Promise.all(
        WHISPER_MODELS.map(async (model) => {
          const path = MODELS_DIR + model.fileName;
          const info = await FileSystem.getInfoAsync(path);
          return {
            id: model.id,
            ready: info.exists,
            downloading: false,
            progress: info.exists ? 1 : 0,
          };
        }),
      );
      setModels(statuses);
    })();
  }, []);

  const downloadModel = React.useCallback(async (modelId: string) => {
    if (Platform.OS === "web") return;

    const model = WHISPER_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    // Already downloading
    if (downloadRef.current[modelId]) return;

    const destPath = MODELS_DIR + model.fileName;
    const url = HUGGINGFACE_BASE + model.fileName;

    // Mark as downloading
    setModels((prev) =>
      prev.map((m) =>
        m.id === modelId ? { ...m, downloading: true, progress: 0 } : m,
      ),
    );

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      destPath,
      {},
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesExpectedToWrite > 0
            ? downloadProgress.totalBytesWritten /
              downloadProgress.totalBytesExpectedToWrite
            : 0;
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, progress } : m)),
        );
      },
    );

    downloadRef.current[modelId] = downloadResumable;

    try {
      await downloadResumable.downloadAsync();
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId
            ? { ...m, ready: true, downloading: false, progress: 1 }
            : m,
        ),
      );
    } catch (error) {
      console.error(
        `[WhisperModelManager] Failed to download ${modelId}:`,
        error,
      );
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, downloading: false, progress: 0 } : m,
        ),
      );
    } finally {
      delete downloadRef.current[modelId];
    }
  }, []);

  const deleteModel = React.useCallback(async (modelId: string) => {
    if (Platform.OS === "web") return;

    const model = WHISPER_MODELS.find((m) => m.id === modelId);
    if (!model) return;

    const path = MODELS_DIR + model.fileName;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path);
    }

    setModels((prev) =>
      prev.map((m) =>
        m.id === modelId ? { ...m, ready: false, progress: 0 } : m,
      ),
    );
  }, []);

  return { models, downloadModel, deleteModel };
}
