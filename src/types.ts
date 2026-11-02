export type AssetType = "image" | "video" | "audio" | "unsupported";
export type AssetStatus = "ready" | "running" | "done" | "error";
export type ActivePanel = "optimize" | "convert" | "rename";
export type ThemeMode = "light" | "dark";
export type EffortLevel = "fast" | "balanced" | "max";

export interface AssetItem {
  id: string;
  path: string;
  name: string;
  extension: string;
  type: AssetType;
  size: number;
  width: number | null;
  height: number | null;
  wideGamut?: boolean;
  duration: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  bitrate?: number | null;
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
  audioQuality: number;
  effort: EffortLevel;
  outputFormat:
    | "auto"
    | "original"
    | "jpeg"
    | "png"
    | "webp"
    | "avif"
    | "jxl"
    | "mp4"
    | "mp4-hevc"
    | "mp4-av1"
    | "webm"
    | "webm-av1"
    | "mov"
    | "mkv"
    | "m4a"
    | "opus"
    | "mp3"
    | "flac";
  resizeMode: "manual" | "percentage";
  resizePercent: number;
  maxWidth: number;
  maxHeight: number;
  preserveMetadata: boolean;
  wideGamut: boolean;
  avif10Bit: boolean;
  stripAudio: boolean;
  outputDir: string;
  rename: RenameSettings;
}

export interface OptimizePayload {
  assets: Array<AssetItem & { batchIndex: number }>;
  settings: OptimizerSettings;
}

export interface Capabilities {
  av1Encoder: "libsvtav1" | "libaom-av1" | null;
  av1Accelerated: boolean;
}

export interface ProgressUpdate {
  id: string;
  phase: "running" | "done" | "error";
  progress: number;
  message: string;
}
