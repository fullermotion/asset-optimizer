const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { execFile } = require("node:child_process");
const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { promisify } = require("node:util");
const { Worker } = require("node:worker_threads");
const { losslessCompressPng } = require("@napi-rs/image");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStaticPath = require("ffmpeg-static");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");

const execFileAsync = promisify(execFile);

// Packaged builds unpack the ffmpeg binaries beside app.asar; spawn cannot execute a path inside the archive.
const ffmpegPath = vendoredBinary("ffmpeg") || unpackedAsarPath(ffmpegStaticPath);
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(vendoredBinary("ffprobe") || unpackedAsarPath(ffprobeInstaller.path));

// Every file in a batch is different, so libvips' operation cache would only hold memory and open file handles.
sharp.cache(false);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".tif", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".aif", ".aiff", ".flac", ".m4a", ".aac", ".ogg", ".oga", ".opus"]);
const IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "avif", "jxl", "tiff"]);
// Output format keys mapped to the file extension and codec they produce.
const VIDEO_FORMATS = {
  mp4: { extension: "mp4", codec: "h264" },
  "mp4-hevc": { extension: "mp4", codec: "hevc" },
  "mp4-av1": { extension: "mp4", codec: "av1" },
  webm: { extension: "webm", codec: "vp9" },
  "webm-av1": { extension: "webm", codec: "av1" },
  mov: { extension: "mov", codec: "h264" },
  m4v: { extension: "m4v", codec: "h264" },
  mkv: { extension: "mkv", codec: "h264" }
};
const AUDIO_FORMATS = {
  m4a: { extension: "m4a", codec: "aac" },
  opus: { extension: "opus", codec: "opus" },
  mp3: { extension: "mp3", codec: "mp3" },
  flac: { extension: "flac", codec: "flac" },
  ogg: { extension: "ogg", codec: "opus" },
  wav: { extension: "wav", codec: "copy" },
  aiff: { extension: "aiff", codec: "copy" }
};
const OUTPUT_FORMATS = {
  image: IMAGE_FORMATS,
  video: new Set(Object.keys(VIDEO_FORMATS)),
  audio: new Set(Object.keys(AUDIO_FORMATS))
};
const DEFAULT_FORMATS = { image: "webp", video: "mp4", audio: "m4a" };
const EXTENSION_ALIASES = { jpg: "jpeg", tif: "tiff", aif: "aiff", oga: "ogg", aac: "m4a" };

// Encoder settings per compression effort; slower levels spend encode time on smaller files at the same quality.
const EFFORT_LEVELS = {
  fast: { webp: 2, avif: 2, jxl: 3, png: 4, pngAdaptiveFiltering: false, oxipng: false, x264: "faster", x265: "fast", vp9: 4, svtav1: 8, aom: 8, flac: 5, flacExactRice: false, mp3: 5 },
  balanced: { webp: 4, avif: 4, jxl: 7, png: 7, pngAdaptiveFiltering: true, oxipng: true, x264: "medium", x265: "medium", vp9: 2, svtav1: 6, aom: 6, flac: 8, flacExactRice: false, mp3: 2 },
  max: { webp: 6, avif: 6, jxl: 8, png: 10, pngAdaptiveFiltering: true, oxipng: true, x264: "slow", x265: "slow", vp9: 1, svtav1: 4, aom: 4, flac: 8, flacExactRice: true, mp3: 0 }
};

const CPU_COUNT = os.availableParallelism();
// libvips and most audio encoders leave cores idle on a single file, so keep a few in flight at once.
const FILE_CONCURRENCY = clamp(Math.floor(CPU_COUNT / 2), 1, 4);
const METADATA_CONCURRENCY = clamp(CPU_COUNT, 2, 8);

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
      { name: "Images, videos, and audio", extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: "Images", extensions: [...IMAGE_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: "Videos", extensions: [...VIDEO_EXTENSIONS].map((ext) => ext.slice(1)) },
      { name: "Audio", extensions: [...AUDIO_EXTENSIONS].map((ext) => ext.slice(1)) }
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

ipcMain.handle("app:capabilities", async () => {
  const encoders = await availableEncoders();
  const encoder = av1Encoder(encoders);
  return { av1Encoder: encoder, av1Accelerated: encoder === "libsvtav1" && (await svtAv1HasSimd()) };
});

ipcMain.handle("assets:metadata", async (_event, filePaths) => {
  return mapWithConcurrency(uniqueExistingPaths(filePaths), METADATA_CONCURRENCY, async (filePath) => {
    try {
      return await readAssetMetadata(filePath);
    } catch (error) {
      return {
        id: createAssetId(filePath),
        path: filePath,
        name: path.basename(filePath),
        extension: path.extname(filePath).slice(1).toLowerCase(),
        type: "unsupported",
        size: 0,
        status: "error",
        error: error instanceof Error ? error.message : "Could not read asset"
      };
    }
  });
});

ipcMain.handle("assets:optimize", async (event, payload) => {
  const assets = payload.assets || [];
  const settings = payload.settings;
  const reservedPaths = new Set();
  const sendProgress = (update) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send("assets:progress", update);
    }
  };

  const optimizeAsset = async (asset) => {
    sendProgress({
      id: asset.id,
      phase: "running",
      progress: 2,
      message: "Preparing output"
    });

    try {
      const format = chooseOutputFormat(asset, settings);
      const outputPath = await buildOutputPath(asset, settings, format, reservedPaths);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const onProgress = (progress) => {
        sendProgress({
          id: asset.id,
          phase: "running",
          progress,
          message: asset.type === "audio" ? "Encoding audio" : "Encoding video"
        });
      };

      if (asset.type === "image") {
        await optimizeImage(asset, outputPath, format, settings);
      } else if (asset.type === "video") {
        await optimizeVideo(asset, outputPath, format, settings, onProgress);
      } else if (asset.type === "audio") {
        await optimizeAudio(asset, outputPath, format, settings, onProgress);
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

      sendProgress({
        id: asset.id,
        phase: "done",
        progress: 100,
        message: savings >= 0 ? `${savings}% smaller` : "Converted"
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Optimization failed";
      sendProgress({
        id: asset.id,
        phase: "error",
        progress: 0,
        message
      });
      return { id: asset.id, status: "error", error: message };
    }
  };

  // ffmpeg already spreads one video encode across every core, so videos run one at a time beside the other lanes.
  const [imageResults, audioResults, videoResults] = await Promise.all([
    mapWithConcurrency(assets.filter((asset) => asset.type !== "video" && asset.type !== "audio"), FILE_CONCURRENCY, optimizeAsset),
    mapWithConcurrency(assets.filter((asset) => asset.type === "audio"), FILE_CONCURRENCY, optimizeAsset),
    mapWithConcurrency(assets.filter((asset) => asset.type === "video"), 1, optimizeAsset)
  ]);

  return [...imageResults, ...audioResults, ...videoResults];
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
      // Queue thumbnails are drawn at 72px, so render them at 2x for Retina displays.
      const thumbnail = await sharp(imageInput.path)
        .rotate()
        .resize({ width: 144, height: 144, fit: "cover" })
        .webp({ quality: 72 })
        .toBuffer();

      // autoOrient swaps width and height for EXIF-rotated photos, matching the pixels the optimizer writes.
      return {
        ...base,
        type: "image",
        width: metadata.autoOrient?.width || metadata.width || null,
        height: metadata.autoOrient?.height || metadata.height || null,
        wideGamut: isWideGamutProfile(metadata.icc),
        duration: null,
        thumbnail: `data:image/webp;base64,${thumbnail.toString("base64")}`
      };
    } finally {
      await imageInput.cleanup();
    }
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    const metadata = await probeMedia(filePath);
    const stream = metadata.streams.find((candidate) => candidate.codec_type === "video") || {};
    const audioStream = metadata.streams.find((candidate) => candidate.codec_type === "audio") || {};
    return {
      ...base,
      type: "video",
      width: stream.width || null,
      height: stream.height || null,
      duration: metadata.format.duration || null,
      channels: audioStream.channels || null,
      thumbnail: null
    };
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    const metadata = await probeMedia(filePath);
    const stream = metadata.streams.find((candidate) => candidate.codec_type === "audio");
    if (!stream) {
      throw new Error("No audio stream found");
    }

    return {
      ...base,
      type: "audio",
      width: null,
      height: null,
      duration: metadata.format.duration || null,
      sampleRate: Number(stream.sample_rate) || null,
      channels: stream.channels || null,
      bitrate: Number(stream.bit_rate) || Number(metadata.format.bit_rate) || null,
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

function probeMedia(filePath) {
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

async function optimizeImage(asset, outputPath, format, settings) {
  const quality = clamp(settings.quality ?? 80, 1, 100);
  const effort = effortLevel(settings);
  const imageInput = await prepareImageInput(asset.path);
  let pipeline = sharp(imageInput.path).rotate();

  try {
    const { icc } = await sharp(imageInput.path).metadata();
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

    // sharp converts to sRGB by default, clipping the saturated colours of iPhone (Display P3) and Adobe RGB photos.
    // Keep the source profile untouched instead: converting to P3 clips through sRGB on 10-bit output. The JPEG XL
    // encoder only accepts sRGB, so it keeps the default.
    if (settings.wideGamut !== false && format !== "jxl" && isWideGamutProfile(icc)) {
      pipeline = pipeline.keepIccProfile();
    }

    if (format === "jxl") {
      await fs.writeFile(outputPath, await encodeJxl(pipeline, quality, effort));
    } else if (format === "png") {
      await fs.writeFile(outputPath, await optimizePng(await encodeImage(pipeline, format, quality, effort, settings).toBuffer(), effort));
    } else {
      await encodeImage(pipeline, format, quality, effort, settings).toFile(outputPath);
    }
  } finally {
    await imageInput.cleanup();
  }
}

function encodeImage(pipeline, format, quality, effort, settings) {
  const lossless = quality >= 100;

  if (format === "jpeg") {
    // mozjpeg adds trellis quantisation and progressive scan optimisation; keep full chroma at high quality.
    return pipeline.jpeg({ quality, mozjpeg: true, chromaSubsampling: quality >= 90 ? "4:4:4" : "4:2:0" });
  }

  if (format === "png") {
    // Below 90, quantise to a palette like pngquant; otherwise stay lossless and choose the best filter per row.
    return quality < 90
      ? pipeline.png({ palette: true, quality, effort: effort.png, compressionLevel: 9 })
      : pipeline.png({ compressionLevel: 9, adaptiveFiltering: effort.pngAdaptiveFiltering });
  }

  if (format === "webp") {
    // Sharp YUV conversion keeps colour edges crisp that plain 4:2:0 subsampling smears.
    return pipeline.webp({ quality, lossless, effort: effort.webp, smartSubsample: true });
  }

  if (format === "avif") {
    // libaom's "iq" tune targets perceptual still-image quality, and 10-bit removes banding in gradients and wide-gamut colour.
    return lossless
      ? pipeline.avif({ lossless, effort: effort.avif })
      : pipeline.avif({ quality, effort: effort.avif, tune: "iq", bitdepth: settings.avif10Bit === false ? 8 : 10 });
  }

  if (format === "tiff") {
    return pipeline.tiff({ compression: "deflate", predictor: "horizontal" });
  }

  throw new Error(`Unsupported image output format: ${format}`);
}

async function optimizePng(png, effort) {
  if (!effort.oxipng) {
    return png;
  }

  // oxipng retries row filters, colour-type reductions and deflate settings losslessly, keeping the colour profile.
  const optimized = await losslessCompressPng(png);
  return optimized.length < png.length ? optimized : png;
}

async function encodeJxl(pipeline, quality, effort) {
  const { data, info } = await pipeline.toColourspace("srgb").ensureAlpha().raw({ depth: "uchar" }).toBuffer({ resolveWithObject: true });
  const options = quality >= 100 ? { lossless: true, effort: effort.jxl } : { quality, effort: effort.jxl };
  const wasmModule = await jxlEncoderModule();

  // libjxl's WebAssembly encoder runs synchronously for seconds, so it gets its own thread to keep the app responsive.
  return new Promise((resolve, reject) => {
    const worker = new Worker(unpackedAsarPath(path.join(__dirname, "jxl-worker.mjs")), {
      workerData: { wasmModule, data, width: info.width, height: info.height, options }
    });
    worker.once("message", (output) => {
      resolve(Buffer.from(output));
      worker.terminate();
    });
    worker.once("error", reject);
    worker.once("exit", (code) => reject(new Error(`JPEG XL encoder stopped with code ${code}`)));
  });
}

let jxlModulePromise;

function jxlEncoderModule() {
  jxlModulePromise ??= fs
    .readFile(path.join(__dirname, "..", "node_modules", "@jsquash", "jxl", "codec", "enc", "jxl_enc.wasm"))
    .then((bytes) => WebAssembly.compile(bytes));
  return jxlModulePromise;
}

function isWideGamutProfile(icc) {
  // Read the profile's red primary (rXYZ tag). sRGB's sits at X = 0.436; Display P3, Adobe RGB and Rec. 2020 are all redder.
  if (!icc || icc.length < 132) {
    return false;
  }

  const tagCount = icc.readUInt32BE(128);
  for (let index = 0; index < tagCount && 144 + index * 12 <= icc.length; index += 1) {
    const entry = 132 + index * 12;
    if (icc.toString("latin1", entry, entry + 4) === "rXYZ") {
      const offset = icc.readUInt32BE(entry + 4);
      return offset + 12 <= icc.length && icc.readInt32BE(offset + 8) / 65536 > 0.46;
    }
  }

  return false;
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

  // Uncompressed TIFF is lossless like PNG but sips writes it about three times faster.
  const tempDir = await fs.mkdtemp(path.join(app.getPath("temp"), "asset-optimizer-heic-"));
  const outputPath = path.join(tempDir, `${path.parse(inputPath).name}.tiff`);

  try {
    await execFileAsync("/usr/bin/sips", ["-s", "format", "tiff", inputPath, "--out", outputPath], {
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

async function optimizeVideo(asset, outputPath, format, settings, onProgress) {
  const { extension, codec } = VIDEO_FORMATS[format];
  const encoders = await availableEncoders();
  const quality = clamp(settings.videoQuality ?? settings.quality ?? 72, 1, 100);
  const options = videoEncoderOptions(codec, quality, effortLevel(settings), encoders);

  if (settings.stripAudio) {
    options.push("-an");
  } else {
    options.push(...audioEncoderOptions(extension === "webm" ? "opus" : "aac", settings, asset.channels, encoders));
  }

  if (extension === "mp4" || extension === "mov" || extension === "m4v") {
    options.push("-movflags +faststart");
  }

  if (!settings.preserveMetadata) {
    options.push("-map_metadata -1");
  }

  await runFfmpeg(asset.path, outputPath, options, videoScaleFilter(settings), onProgress);
}

function videoEncoderOptions(codec, quality, effort, encoders) {
  // The quality slider maps to an x264 CRF; other codecs use the CRF that lands at similar visual quality.
  const h264Crf = clamp(Math.round(36 - quality * 0.23), 12, 35);

  if (codec === "hevc") {
    // hvc1 tagging is required for QuickTime and Safari to play HEVC in MP4.
    return ["-c:v libx265", `-preset ${effort.x265}`, `-crf ${h264Crf + 3}`, "-pix_fmt yuv420p", "-tag:v hvc1", "-x265-params log-level=error"];
  }

  if (codec === "vp9") {
    // -b:v 0 selects true constant-quality mode, and row-mt lets libvpx use every core.
    return ["-c:v libvpx-vp9", "-b:v 0", `-crf ${Math.round(h264Crf * 1.35)}`, "-deadline good", `-cpu-used ${effort.vp9}`, "-row-mt 1", "-pix_fmt yuv420p"];
  }

  if (codec === "av1") {
    const encoder = av1Encoder(encoders);
    const crf = clamp(Math.round(h264Crf * 1.45), 1, 63);
    if (encoder === "libsvtav1") {
      return ["-c:v libsvtav1", `-preset ${effort.svtav1}`, `-crf ${crf}`, "-pix_fmt yuv420p"];
    }

    if (encoder === "libaom-av1") {
      return ["-c:v libaom-av1", "-b:v 0", `-crf ${crf}`, `-cpu-used ${effort.aom}`, "-row-mt 1", "-tiles 2x2", "-pix_fmt yuv420p"];
    }

    throw new Error("The bundled ffmpeg has no AV1 encoder");
  }

  // yuv420p keeps 10-bit and 4:2:2 sources playable in browsers and QuickTime.
  return ["-c:v libx264", `-preset ${effort.x264}`, `-crf ${h264Crf}`, "-pix_fmt yuv420p"];
}

function videoScaleFilter(settings) {
  if (settings.resizeMode === "percentage" && settings.resizePercent < 100) {
    const scale = clamp(Number(settings.resizePercent) || 100, 1, 100) / 100;
    return `scale=max(2\\,trunc(iw*${scale}/2)*2):max(2\\,trunc(ih*${scale}/2)*2)`;
  }

  if (settings.resizeMode !== "percentage" && (settings.maxWidth || settings.maxHeight)) {
    const width = numberOrUndefined(settings.maxWidth);
    const height = numberOrUndefined(settings.maxHeight);
    // Cap the box at the source size so a maximum never upscales, and keep dimensions even for 4:2:0.
    const boxWidth = width ? `min(iw\\,${width})` : "iw";
    const boxHeight = height ? `min(ih\\,${height})` : "ih";
    return `scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  }

  return null;
}

async function optimizeAudio(asset, outputPath, format, settings, onProgress) {
  const { extension, codec } = AUDIO_FORMATS[format];
  // Drop embedded cover art: Ogg and Opus cannot carry it, and it is often larger than the audio savings.
  const options = ["-vn"];

  if (codec === "copy") {
    options.push("-c:a copy");
  } else {
    options.push(...audioEncoderOptions(codec, settings, asset.channels, await availableEncoders()));
    // MP3 and AAC top out at 48 kHz, and higher rates only spend bits on inaudible frequencies.
    if (codec !== "flac" && asset.sampleRate > 48000) {
      options.push("-ar 48000");
    }
  }

  if (extension === "m4a") {
    options.push("-movflags +faststart");
  }

  if (!settings.preserveMetadata) {
    options.push("-map_metadata -1");
  }

  await runFfmpeg(asset.path, outputPath, options, null, onProgress);
}

function audioEncoderOptions(codec, settings, channels, encoders) {
  const quality = clamp(settings.audioQuality ?? 72, 1, 100);
  const effort = effortLevel(settings);
  // Bitrates below are for stereo: mono needs about 60% for the same quality, surround scales per channel pair.
  const channelScale = channels === 1 ? 0.6 : Math.max(1, (channels || 2) / 2);
  const bitrate = (stereoKbps) => `-b:a ${Math.round(stereoKbps * channelScale)}k`;

  if (codec === "opus") {
    return ["-c:a libopus", bitrate(clamp(quality * 1.6, 24, 192)), "-vbr on", "-compression_level 10"];
  }

  if (codec === "aac") {
    const encoder = aacEncoder(encoders);
    const aacBitrate = bitrate(clamp(quality * 2.56, 48, 256));
    return encoder === "aac_at" ? ["-c:a aac_at", "-aac_at_mode cvbr", aacBitrate] : [`-c:a ${encoder}`, aacBitrate];
  }

  if (codec === "mp3") {
    // LAME VBR presets: V0 is best, V9 is smallest.
    return ["-c:a libmp3lame", `-q:a ${clamp(Math.round((100 - quality) / 11), 0, 9)}`, `-compression_level ${effort.mp3}`];
  }

  if (codec === "flac") {
    return ["-c:a flac", `-compression_level ${effort.flac}`, ...(effort.flacExactRice ? ["-exact_rice_parameters 1"] : [])];
  }

  throw new Error(`Unsupported audio codec: ${codec}`);
}

function runFfmpeg(inputPath, outputPath, outputOptions, videoFilter, onProgress) {
  return new Promise((resolve, reject) => {
    let lastProgress = 0;
    const command = ffmpeg(inputPath)
      .output(outputPath)
      .outputOptions(outputOptions)
      .on("progress", (progress) => {
        // ffmpeg reports about twice a second; only forward whole-percent changes to the renderer.
        const percent = clamp(Math.round(progress.percent || 8), 5, 98);
        if (percent !== lastProgress) {
          lastProgress = percent;
          onProgress(percent);
        }
      })
      .on("end", resolve)
      .on("error", reject);

    if (videoFilter) {
      command.videoFilters(videoFilter);
    }

    command.run();
  });
}

let encodersPromise;

function availableEncoders() {
  encodersPromise ??= execFileAsync(ffmpegPath, ["-hide_banner", "-encoders"], { windowsHide: true })
    .then(({ stdout }) => new Set([...stdout.matchAll(/^\s*[VAS][A-Z.]{5}\s+(\S+)/gm)].map((match) => match[1])))
    .catch(() => new Set());
  return encodersPromise;
}

function svtAv1HasSimd() {
  // Some SVT-AV1 builds (ffmpeg-static on Apple Silicon) fall back to plain C, which is many times slower.
  return execFileAsync(ffmpegPath, ["-hide_banner", "-f", "lavfi", "-i", "color=s=64x64:d=0.04", "-c:v", "libsvtav1", "-f", "null", "-"], { windowsHide: true })
    .then(({ stderr }) => !/asm level selected\s*:\s*up to c\b/.test(stderr))
    .catch(() => false);
}

function av1Encoder(encoders) {
  // SVT-AV1 is many times faster than libaom at similar efficiency, so prefer it whenever ffmpeg has it.
  return ["libsvtav1", "libaom-av1"].find((encoder) => encoders.has(encoder)) || null;
}

function aacEncoder(encoders) {
  // Apple's AudioToolbox and Fraunhofer FDK both beat ffmpeg's native AAC encoder at the same bitrate.
  return ["aac_at", "libfdk_aac"].find((encoder) => encoders.has(encoder)) || "aac";
}

function effortLevel(settings) {
  return EFFORT_LEVELS[settings.effort] || EFFORT_LEVELS.balanced;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildOutputPath(asset, settings, format, reservedPaths) {
  const sourceDir = path.dirname(asset.path);
  const defaultOutputDir = path.join(sourceDir, "optimized");
  const outputDir = settings.outputDir || defaultOutputDir;
  const renamed = applyRename(asset, settings);
  const baseName = sanitizeFileName(renamed || path.parse(asset.name).name);
  const candidate = path.join(outputDir, `${baseName}.${outputExtension(format)}`);
  return uniqueOutputPath(candidate, reservedPaths);
}

function chooseOutputFormat(asset, settings) {
  const formats = OUTPUT_FORMATS[asset.type];
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

  return DEFAULT_FORMATS[asset.type];
}

function outputExtension(format) {
  return VIDEO_FORMATS[format]?.extension || AUDIO_FORMATS[format]?.extension || format;
}

function applyRename(asset, settings) {
  const rename = settings.rename || {};
  const parsed = path.parse(asset.name);
  let name = rename.pattern || "{name}";
  name = name
    .replaceAll("{name}", parsed.name)
    .replaceAll("{index}", String(asset.batchIndex ?? 1).padStart(rename.padding ?? 2, "0"))
    .replaceAll("{date}", new Date().toISOString().slice(0, 10))
    .replaceAll("{width}", asset.width ? String(asset.width) : "")
    .replaceAll("{height}", asset.height ? String(asset.height) : "")
    .replaceAll("{format}", outputExtension(chooseOutputFormat(asset, settings)));

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

async function uniqueOutputPath(candidate, reservedPaths) {
  const parsed = path.parse(candidate);
  let current = candidate;
  let count = 1;

  // Batch items run concurrently, so claim a name before awaiting the disk check.
  while (!claimPath(current, reservedPaths) || (await exists(current))) {
    current = path.join(parsed.dir, `${parsed.name}-${count}${parsed.ext}`);
    count += 1;
  }

  return current;
}

function claimPath(filePath, reservedPaths) {
  // macOS and Windows filesystems treat names that differ only by case as the same file.
  const key = process.platform === "linux" ? filePath : filePath.toLowerCase();
  if (reservedPaths.has(key)) {
    return false;
  }

  reservedPaths.add(key);
  return true;
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
  return EXTENSION_ALIASES[normalized] || normalized;
}

function vendoredBinary(name) {
  // scripts/fetch-ffmpeg.mjs installs an Apple Silicon build whose SVT-AV1 uses ARM SIMD; ffmpeg-static's does not.
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    return null;
  }

  const directory = app.isPackaged ? path.join(process.resourcesPath, "ffmpeg") : path.join(__dirname, "..", "vendor", "ffmpeg", "darwin-arm64");
  const binaryPath = path.join(directory, name);
  return existsSync(binaryPath) ? binaryPath : null;
}

function unpackedAsarPath(filePath) {
  return filePath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
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
