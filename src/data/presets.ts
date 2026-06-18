import type { OptimizerSettings } from "../types";

export const defaultSettings: OptimizerSettings = {
  preset: "balanced",
  quality: 80,
  videoQuality: 72,
  outputFormat: "auto",
  resizeMode: "manual",
  resizePercent: 100,
  maxWidth: 2400,
  maxHeight: 2400,
  preserveMetadata: false,
  stripAudio: false,
  outputDir: "",
  rename: {
    pattern: "{name}",
    prefix: "",
    suffix: "",
    find: "",
    replace: "",
    padding: 2,
    caseMode: "none",
    slugify: true
  }
};

export function settingsForPreset(preset: OptimizerSettings["preset"], current: OptimizerSettings): OptimizerSettings {
  if (preset === "balanced") {
    return { ...current, preset, quality: 80, videoQuality: 72, resizeMode: "manual", resizePercent: 100, maxWidth: 2400, maxHeight: 2400, preserveMetadata: false };
  }

  if (preset === "smallest") {
    return { ...current, preset, quality: 58, videoQuality: 55, resizeMode: "manual", resizePercent: 100, maxWidth: 1600, maxHeight: 1600, preserveMetadata: false };
  }

  if (preset === "quality") {
    return { ...current, preset, quality: 92, videoQuality: 86, resizeMode: "manual", resizePercent: 100, maxWidth: 3840, maxHeight: 3840, preserveMetadata: true };
  }

  return { ...current, preset };
}
