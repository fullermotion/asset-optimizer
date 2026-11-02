import type { AssetItem, OptimizerSettings, RenameSettings } from "../types";

export function previewOutputName(asset: AssetItem, settings: OptimizerSettings, index: number): string {
  const base = applyRename(asset, settings.rename, settings, index);
  return `${base}.${outputExtension(chooseOutputFormat(asset, settings))}`;
}

// Mirrors the output format choice in electron/main.cjs so previews match the files that get written.
const outputFormats: Partial<Record<AssetItem["type"], Set<string>>> = {
  image: new Set(["jpeg", "png", "webp", "avif", "jxl", "tiff"]),
  video: new Set(["mp4", "mp4-hevc", "mp4-av1", "webm", "webm-av1", "mov", "m4v", "mkv"]),
  audio: new Set(["m4a", "opus", "mp3", "flac", "ogg", "wav", "aiff"])
};
const defaultFormats: Partial<Record<AssetItem["type"], string>> = { image: "webp", video: "mp4", audio: "m4a" };
const extensionAliases: Record<string, string> = { jpg: "jpeg", tif: "tiff", aif: "aiff", oga: "ogg", aac: "m4a" };

export function chooseOutputFormat(asset: AssetItem, settings: Pick<OptimizerSettings, "outputFormat">): string {
  const formats = outputFormats[asset.type];
  if (!formats) {
    return normalizeExtension(asset.extension);
  }

  if (settings.outputFormat === "original") {
    const original = normalizeExtension(asset.extension);
    if (formats.has(original)) {
      return original;
    }
  } else if (formats.has(settings.outputFormat)) {
    return settings.outputFormat;
  }

  return defaultFormats[asset.type] ?? normalizeExtension(asset.extension);
}

function outputExtension(format: string): string {
  return format.replace(/-(hevc|av1)$/, "");
}

function applyRename(asset: AssetItem, rename: RenameSettings, settings: OptimizerSettings, index: number): string {
  const originalName = asset.name.replace(/\.[^.]+$/, "");
  let name = rename.pattern || "{name}";
  name = name
    .replaceAll("{name}", originalName)
    .replaceAll("{index}", String(index).padStart(rename.padding, "0"))
    .replaceAll("{date}", new Date().toISOString().slice(0, 10))
    .replaceAll("{width}", asset.width ? String(asset.width) : "")
    .replaceAll("{height}", asset.height ? String(asset.height) : "")
    .replaceAll("{format}", outputExtension(chooseOutputFormat(asset, settings)));

  if (rename.find) {
    name = name.replaceAll(rename.find, rename.replace);
  }

  if (rename.prefix) {
    name = `${rename.prefix}${name}`;
  }

  if (rename.suffix) {
    name = `${name}${rename.suffix}`;
  }

  if (rename.caseMode === "lower") {
    name = name.toLowerCase();
  }

  if (rename.caseMode === "upper") {
    name = name.toUpperCase();
  }

  if (rename.slugify) {
    name = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  return sanitizeFileName(name || "asset");
}

function normalizeExtension(extension: string): string {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  return extensionAliases[normalized] ?? normalized;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim() || "asset";
}
