const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");
const { promisify } = require("node:util");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");

const execFileAsync = promisify(execFile);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".tif", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "avif", "tiff"]);
const VIDEO_FORMATS = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1060,
    minHeight: 720,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#f7f9fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("files:select", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select assets",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images and videos", extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: "Images", extensions: [...IMAGE_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: "Videos", extensions: [...VIDEO_EXTENSIONS].map((ext) => ext.slice(1)) }
    ]
  });

  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("folder:selectOutput", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose output folder",
    properties: ["openDirectory", "createDirectory"]
  });

  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("assets:metadata", async (_event, filePaths) => {
  const assets = [];

  for (const filePath of uniqueExistingPaths(filePaths)) {
    try {
      const asset = await readAssetMetadata(filePath);
      if (asset) {
        assets.push(asset);
      }
    } catch (error) {
      assets.push({
        id: createAssetId(filePath),
        path: filePath,
        name: path.basename(filePath),
        extension: path.extname(filePath).slice(1).toLowerCase(),
        type: "unsupported",
        size: 0,
        status: "error",
        error: error instanceof Error ? error.message : "Could not read asset"
      });
    }
  }

  return assets;
});

ipcMain.handle("assets:optimize", async (event, payload) => {
  const results = [];
  const assets = payload.assets || [];

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    event.sender.send("assets:progress", {
      id: asset.id,
      phase: "running",
      progress: 2,
      message: "Preparing output"
    });

    try {
      const outputPath = await buildOutputPath(asset, payload.settings);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      if (asset.type === "image") {
        await optimizeImage(asset, outputPath, payload.settings);
      } else if (asset.type === "video") {
        await optimizeVideo(asset, outputPath, payload.settings, (progress) => {
          event.sender.send("assets:progress", {
            id: asset.id,
            phase: "running",
            progress,
            message: "Encoding video"
          });
        });
      } else {
        throw new Error("Unsupported file type");
      }

      const outputStat = await fs.stat(outputPath);
      const savings = asset.size > 0 ? Math.round((1 - outputStat.size / asset.size) * 100) : 0;
      const result = {
        id: asset.id,
        status: "done",
        outputPath,
        outputSize: outputStat.size,
        savings
      };

      event.sender.send("assets:progress", {
        id: asset.id,
        phase: "done",
        progress: 100,
        message: savings >= 0 ? `${savings}% smaller` : "Converted"
      });
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization failed";
      event.sender.send("assets:progress", {
        id: asset.id,
        phase: "error",
        progress: 0,
        message
      });
      results.push({ id: asset.id, status: "error", error: message });
    }
  }

  return results;
});

ipcMain.handle("files:reveal", async (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

function uniqueExistingPaths(filePaths) {
  return [...new Set((filePaths || []).filter(Boolean))];
}

function createAssetId(filePath) {
  return `${filePath}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

async function readAssetMetadata(filePath) {
  const stat = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const base = {
    id: createAssetId(filePath),
    path: filePath,
    name: path.basename(filePath),
    extension: extension.slice(1),
    size: stat.size,
    status: "ready"
  };

  if (IMAGE_EXTENSIONS.has(extension)) {
    const imageInput = await prepareImageInput(filePath);
    try {
      const metadata = await sharp(imageInput.path).metadata();
      const thumbnail = await sharp(imageInput.path)
        .rotate()
        .resize({ width: 120, height: 80, fit: "cover" })
        .webp({ quality: 72 })
        .toBuffer();

      return {
        ...base,
        type: "image",
        width: metadata.width || null,
        height: metadata.height || null,
        duration: null,
        thumbnail: `data:image/webp;base64,${thumbnail.toString("base64")}`
      };
    } finally {
      await imageInput.cleanup();
    }
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    const metadata = await probeVideo(filePath);
    const stream = metadata.streams.find((candidate) => candidate.codec_type === "video") || {};
    return {
      ...base,
      type: "video",
      width: stream.width || null,
      height: stream.height || null,
      duration: metadata.format.duration || null,
      thumbnail: null
    };
  }

  return {
    ...base,
    type: "unsupported",
    status: "error",
    error: "Unsupported file type"
  };
}

function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(error);
      } else {
        resolve(metadata);
      }
    });
  });
}

async function optimizeImage(asset, outputPath, settings) {
  const inputPath = asset.path;
  const format = path.extname(outputPath).slice(1).toLowerCase();
  const quality = clamp(settings.quality ?? 80, 1, 100);
  const imageInput = await prepareImageInput(inputPath);
  let pipeline = sharp(imageInput.path).rotate();

  try {
    const percentageResize = resizeDimensionsForPercentage(asset, settings);
    if (percentageResize.width || percentageResize.height) {
      pipeline = pipeline.resize({
        width: percentageResize.width,
        height: percentageResize.height,
        fit: "inside",
        withoutEnlargement: true
      });
    } else if (settings.resizeMode !== "percentage" && (settings.maxWidth || settings.maxHeight)) {
      pipeline = pipeline.resize({
        width: numberOrUndefined(settings.maxWidth),
        height: numberOrUndefined(settings.maxHeight),
        fit: "inside",
        withoutEnlargement: true
      });
    }

    if (settings.preserveMetadata) {
      pipeline = pipeline.keepMetadata();
    }

    if (format === "jpg" || format === "jpeg") {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === "png") {
      pipeline = pipeline.png({ quality, compressionLevel: 9, palette: quality < 90 });
    } else if (format === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (format === "avif") {
      pipeline = pipeline.avif({ quality });
    } else if (format === "tiff" || format === "tif") {
      pipeline = pipeline.tiff({ quality });
    } else {
      throw new Error(`Unsupported image output format: ${format}`);
    }

    await pipeline.toFile(outputPath);
  } finally {
    await imageInput.cleanup();
  }
}

async function prepareImageInput(inputPath) {
  const extension = path.extname(inputPath).toLowerCase();
  if (!isHeicExtension(extension)) {
    return {
      path: inputPath,
      cleanup: async () => undefined
    };
  }

  if (process.platform !== "darwin") {
    return {
      path: inputPath,
      cleanup: async () => undefined
    };
  }

  const tempDir = await fs.mkdtemp(path.join(app.getPath("temp"), "asset-optimizer-heic-"));
  const outputPath = path.join(tempDir, `${path.parse(inputPath).name}.png`);

  try {
    await execFileAsync("/usr/bin/sips", ["-s", "format", "png", inputPath, "--out", outputPath], {
      windowsHide: true
    });
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "macOS could not decode the HEIC file";
    throw new Error(`HEIC decode failed: ${message}`);
  }

  return {
    path: outputPath,
    cleanup: async () => fs.rm(tempDir, { recursive: true, force: true })
  };
}

function isHeicExtension(extension) {
  return extension === ".heic" || extension === ".heif";
}

function optimizeVideo(asset, outputPath, settings, onProgress) {
  const inputPath = asset.path;
  const format = path.extname(outputPath).slice(1).toLowerCase();
  const quality = clamp(settings.videoQuality ?? settings.quality ?? 72, 1, 100);
  const crf = Math.round(36 - quality * 0.23);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath)
      .output(outputPath)
      .outputOptions(["-preset medium", `-crf ${clamp(crf, 12, 35)}`])
      .on("progress", (progress) => {
        onProgress(clamp(Math.round(progress.percent || 8), 5, 98));
      })
      .on("end", resolve)
      .on("error", reject);

    if (format === "mp4" || format === "mov" || format === "m4v") {
      command = command.videoCodec("libx264");
      command.outputOptions("-movflags +faststart");
      if (settings.stripAudio) {
        command = command.noAudio();
      } else {
        command = command.audioCodec("aac");
      }
    } else if (format === "webm") {
      command = command.videoCodec("libvpx-vp9");
      if (settings.stripAudio) {
        command = command.noAudio();
      } else {
        command = command.audioCodec("libopus");
      }
    } else if (!VIDEO_FORMATS.has(format)) {
      reject(new Error(`Unsupported video output format: ${format}`));
      return;
    }

    if (settings.resizeMode === "percentage" && settings.resizePercent < 100) {
      const scale = clamp(Number(settings.resizePercent) || 100, 1, 100) / 100;
      command = command.videoFilters(`scale=max(2\\,trunc(iw*${scale}/2)*2):max(2\\,trunc(ih*${scale}/2)*2)`);
    } else if (settings.resizeMode !== "percentage" && (settings.maxWidth || settings.maxHeight)) {
      const width = numberOrUndefined(settings.maxWidth) || -2;
      const height = numberOrUndefined(settings.maxHeight) || -2;
      command = command.videoFilters(`scale=${width}:${height}:force_original_aspect_ratio=decrease`);
    }

    command.run();
  });
}

async function buildOutputPath(asset, settings) {
  const sourceDir = path.dirname(asset.path);
  const defaultOutputDir = path.join(sourceDir, "optimized");
  const outputDir = settings.outputDir || defaultOutputDir;
  const desiredFormat = chooseOutputFormat(asset, settings);
  const renamed = applyRename(asset, settings.rename);
  const baseName = sanitizeFileName(renamed || path.parse(asset.name).name);
  const candidate = path.join(outputDir, `${baseName}.${desiredFormat}`);
  return uniqueOutputPath(candidate);
}

function chooseOutputFormat(asset, settings) {
  const requested = settings.outputFormat && settings.outputFormat !== "auto" && settings.outputFormat !== "original"
    ? normalizeExtension(settings.outputFormat)
    : null;

  if (settings.outputFormat && settings.outputFormat !== "auto" && settings.outputFormat !== "original") {
    if (asset.type === "image" && IMAGE_FORMATS.has(requested)) {
      return requested;
    }

    if (asset.type === "video" && VIDEO_FORMATS.has(requested)) {
      return requested;
    }
  }

  if (settings.outputFormat === "original") {
    const original = normalizeExtension(asset.extension);
    if (asset.type === "image" && IMAGE_FORMATS.has(original)) {
      return original;
    }

    if (asset.type === "video" && VIDEO_FORMATS.has(original)) {
      return original;
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

function applyRename(asset, rename = {}) {
  const parsed = path.parse(asset.name);
  let name = rename.pattern || "{name}";
  name = name
    .replaceAll("{name}", parsed.name)
    .replaceAll("{index}", String(asset.batchIndex ?? 1).padStart(rename.padding ?? 2, "0"))
    .replaceAll("{date}", new Date().toISOString().slice(0, 10))
    .replaceAll("{width}", asset.width ? String(asset.width) : "")
    .replaceAll("{height}", asset.height ? String(asset.height) : "")
    .replaceAll("{format}", chooseOutputFormat(asset, { outputFormat: rename.format || "auto" }));

  if (rename.find) {
    name = name.replaceAll(rename.find, rename.replace || "");
  }

  if (rename.prefix) {
    name = `${rename.prefix}${name}`;
  }

  if (rename.suffix) {
    name = `${name}${rename.suffix}`;
  }

  if (rename.caseMode === "lower") {
    name = name.toLowerCase();
  } else if (rename.caseMode === "upper") {
    name = name.toUpperCase();
  }

  if (rename.slugify) {
    name = slugify(name);
  }

  return name;
}

async function uniqueOutputPath(candidate) {
  const parsed = path.parse(candidate);
  let current = candidate;
  let count = 1;

  while (await exists(current)) {
    current = path.join(parsed.dir, `${parsed.name}-${count}${parsed.ext}`);
    count += 1;
  }

  return current;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeExtension(extension) {
  const normalized = String(extension || "").replace(/^\./, "").toLowerCase();
  return normalized === "jpg" ? "jpeg" : normalized;
}

function sanitizeFileName(name) {
  return String(name || "asset")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "asset";
}

function slugify(name) {
  return sanitizeFileName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function resizeDimensionsForPercentage(asset, settings) {
  if (settings.resizeMode !== "percentage") {
    return {};
  }

  const percent = clamp(Number(settings.resizePercent) || 100, 1, 100);
  if (percent >= 100) {
    return {};
  }

  return {
    width: asset.width ? Math.max(1, Math.round(asset.width * (percent / 100))) : undefined,
    height: asset.height ? Math.max(1, Math.round(asset.height * (percent / 100))) : undefined
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
