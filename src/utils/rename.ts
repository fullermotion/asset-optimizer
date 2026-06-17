import type { AssetItem, OptimizerSettings, RenameSettings } from "../types";

export function previewOutputName(asset: AssetItem, settings: OptimizerSettings, index: number): string {
  const base = applyRename(asset, settings.rename, settings, index);
  return `${base}.${chooseOutputFormat(asset, settings)}`;
}

export function chooseOutputFormat(asset: AssetItem, settings: Pick<OptimizerSettings, "outputFormat">): string {
  const imageFormats = new Set(["jpeg", "png", "webp", "avif"]);
  const videoFormats = new Set(["mp4", "webm", "mov", "mkv"]);

  if (settings.outputFormat === "original") {
    const original = normalizeExtension(asset.extension);
    if (asset.type === "image" && imageFormats.has(original)) {
      return original;
    }

    if (asset.type === "video" && videoFormats.has(original)) {
      return original;
    }
  }

  if (settings.outputFormat !== "auto") {
    const requested = normalizeExtension(settings.outputFormat);
    if (asset.type === "image" && imageFormats.has(requested)) {
      return requested;
    }

    if (asset.type === "video" && videoFormats.has(requested)) {
      return requested;
    }
  }

  if (asset.type === "image") {
    return "webp";
  }

  if (asset.type === "video") {
    return "mp4";
  }

  return normalizeExtension(asset.extension);
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
    .replaceAll("{format}", chooseOutputFormat(asset, settings));

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
  return normalized === "jpg" ? "jpeg" : normalized;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ").trim() || "asset";
}
