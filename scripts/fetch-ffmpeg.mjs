// Downloads a pinned, checksum-verified ffmpeg and ffprobe build for Apple Silicon into vendor/.
// ffmpeg-static's arm64 binary ships SVT-AV1 without ARM SIMD, which makes AV1 encoding many times slower.
// Other platforms keep using ffmpeg-static. Builds come from https://ffmpeg.martin-riedl.de (GPLv3).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "9.0.2";
const BASE_URL = "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2";
const BINARIES = {
  ffmpeg: "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924",
  ffprobe: "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6"
};

const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vendor", "ffmpeg", "darwin-arm64");
const stampPath = path.join(outputDir, "VERSION");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  process.exit(0);
}

const installed = existsSync(stampPath) && (await fs.readFile(stampPath, "utf8")).trim() === RELEASE;
if (installed && Object.keys(BINARIES).every((name) => existsSync(path.join(outputDir, name)))) {
  process.exit(0);
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "asset-optimizer-ffmpeg-"));

try {
  await fs.mkdir(outputDir, { recursive: true });

  for (const [name, expectedSha256] of Object.entries(BINARIES)) {
    const response = await fetch(`${BASE_URL}/${name}.zip`);
    if (!response.ok) {
      throw new Error(`${name}.zip download failed with HTTP ${response.status}`);
    }

    const archive = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(archive).digest("hex");
    if (sha256 !== expectedSha256) {
      throw new Error(`${name}.zip checksum mismatch: expected ${expectedSha256}, got ${sha256}`);
    }

    const archivePath = path.join(tempDir, `${name}.zip`);
    await fs.writeFile(archivePath, archive);
    execFileSync("/usr/bin/ditto", ["-x", "-k", archivePath, tempDir]);

    const binaryPath = path.join(outputDir, name);
    await fs.copyFile(path.join(tempDir, name), binaryPath);
    await fs.chmod(binaryPath, 0o755);
  }

  await fs.writeFile(stampPath, `${RELEASE}\n`);
  console.log(`Installed ffmpeg ${RELEASE} for Apple Silicon in ${path.relative(process.cwd(), outputDir)}`);
} catch (error) {
  // The app falls back to ffmpeg-static, so an offline install still works.
  console.warn(`Could not install the Apple Silicon ffmpeg build: ${error.message}. Falling back to ffmpeg-static.`);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
