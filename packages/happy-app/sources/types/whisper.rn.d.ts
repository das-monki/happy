declare module "whisper.rn" {
  export interface WhisperContext {
    transcribe(
      audioUri: string,
      options?: { language?: string; maxLen?: number; translate?: boolean },
    ): { stop: () => void; promise: Promise<{ result: string }> };
    release(): Promise<void>;
  }

  export function initWhisper(options: {
    filePath: string | number;
    isBundleAsset?: boolean;
    coreMLModelAsset?: { filename: string; assets: number[] };
  }): Promise<WhisperContext>;
}
