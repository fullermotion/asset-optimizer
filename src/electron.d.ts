import type { AssetItem, OptimizePayload, ProgressUpdate } from "./types";

declare global {
  interface Window {
    assetOptimizer: {
      platform: string;
      selectFiles: () => Promise<string[]>;
      selectOutputFolder: () => Promise<string | null>;
      readAssetMetadata: (filePaths: string[]) => Promise<AssetItem[]>;
      optimizeAssets: (payload: OptimizePayload) => Promise<Array<{ id: string; status: string; outputPath?: string; outputSize?: number; savings?: number; error?: string }>>;
      revealInFinder: (filePath: string) => Promise<void>;
      getPathForFile: (file: File) => string;
      onProgress: (callback: (update: ProgressUpdate) => void) => () => void;
    };
  }
}

export {};
