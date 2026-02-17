declare module "expo-file-system/legacy" {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;

  export interface FileInfo {
    exists: boolean;
    uri?: string;
    size?: number;
    isDirectory?: boolean;
    modificationTime?: number;
    md5?: string;
  }

  export interface DownloadProgressData {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }

  export interface DownloadOptions {
    headers?: Record<string, string>;
    md5?: boolean;
    sessionType?: number;
  }

  export interface FileSystemDownloadResult {
    uri: string;
    status: number;
    headers: Record<string, string>;
    md5?: string;
  }

  export function getInfoAsync(
    fileUri: string,
    options?: { md5?: boolean; size?: boolean },
  ): Promise<FileInfo>;

  export function makeDirectoryAsync(
    fileUri: string,
    options?: { intermediates?: boolean },
  ): Promise<void>;

  export function deleteAsync(
    fileUri: string,
    options?: { idempotent?: boolean },
  ): Promise<void>;

  export class DownloadResumable {
    constructor(
      url: string,
      fileUri: string,
      options?: DownloadOptions,
      callback?: (data: DownloadProgressData) => void,
      resumeData?: string,
    );
    downloadAsync(): Promise<FileSystemDownloadResult | undefined>;
    pauseAsync(): Promise<object>;
    resumeAsync(): Promise<FileSystemDownloadResult | undefined>;
    savable(): object;
  }

  export function createDownloadResumable(
    uri: string,
    fileUri: string,
    options?: DownloadOptions,
    callback?: (data: DownloadProgressData) => void,
    resumeData?: string,
  ): DownloadResumable;
}
