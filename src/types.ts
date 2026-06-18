export type AssetType = "image" | "video" | "unsupported";
export type AssetStatus = "ready" | "running" | "done" | "error";
export type ActivePanel = "optimize" | "convert" | "rename";
export type ThemeMode = "light" | "dark";

export interface AssetItem {
  id: string;
  path: string;
  name: string;
  extension: string;
  type: AssetType;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnail: string | null;
  status: AssetStatus;
  progress?: number;
  message?: string;
  outputPath?: string;
  outputSize?: number;
  savings?: number;
  error?: string;
}

export interface RenameSettings {
  pattern: string;
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  padding: number;
  caseMode: "none" | "lower" | "upper";
  slugify: boolean;
}

export interface OptimizerSettings {
  preset: "balanced" | "smallest" | "quality" | "custom";
  quality: number;
  videoQuality: number;
  outputFormat: "auto" | "original" | "jpeg" | "png" | "webp" | "avif" | "mp4" | "webm" | "mov" | "mkv";
  resizeMode: "manual" | "percentage";
  resizePercent: number;
  maxWidth: number;
  maxHeight: number;
  preserveMetadata: boolean;
  stripAudio: boolean;
  outputDir: string;
  rename: RenameSettings;
}

export interface OptimizePayload {
  assets: Array<AssetItem & { batchIndex: number }>;
  settings: OptimizerSettings;
}

export interface ProgressUpdate {
  id: string;
  phase: "running" | "done" | "error";
  progress: number;
  message: string;
}
