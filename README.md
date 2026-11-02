# Asset Optimizer

Asset Optimizer is a desktop app for optimizing, converting, and batch-renaming image, video, and audio assets. It is built with Electron, React, Vite, Sharp, FFmpeg, oxipng, libjxl, Font Awesome icons, and the Inter typeface.

Copyright (c) 2026 Fullermotion LLC.  
Website: https://www.fullermotion.com

## Features

- Optimize images, videos, and audio with adjustable quality and compression effort settings.
- Convert to modern formats: WebP, AVIF, JPEG XL, H.265/HEVC, AV1, VP9, Opus, and FLAC alongside JPEG, PNG, H.264, AAC, and MP3.
- Keep the wide-gamut colour of iPhone (Display P3) and Adobe RGB photos instead of clipping them to sRGB.
- Review original asset dimensions before processing.
- Resize manually by maximum width and height, or scale assets by percentage from 1% to 100%.
- Batch rename files with pattern tokens, prefix/suffix fields, find-and-replace, padding, case options, and slugified filenames.
- Drag and drop files into a clean desktop interface.
- Choose a custom output folder or create optimized files beside the source assets.
- Switch between light and dark mode.
- Package for macOS, Windows, and Linux through Electron Builder.

## Supported Assets

Image input support includes JPG, JPEG, PNG, WebP, AVIF, TIFF, HEIC, and HEIF.

Video input support includes MP4, MOV, M4V, WebM, MKV, and AVI.

Audio input support includes MP3, WAV, AIFF, FLAC, M4A, AAC, OGG, and Opus.

Output support depends on the selected source type and target format. HEIC and HEIF input on macOS uses the system image tooling as a fallback before optimization.

## Encoders

- JPEG uses mozjpeg, with full 4:4:4 chroma at quality 90 and above.
- PNG below quality 90 is palette-quantised with libimagequant; at 90 and above it stays lossless with adaptive row filtering. Both then go through oxipng (via `@napi-rs/image`) at Balanced and Maximum effort.
- WebP uses sharp YUV chroma subsampling. AVIF uses libaom's perceptual `iq` tuning and 10-bit encoding by default. Quality 100 switches both to lossless.
- JPEG XL uses libjxl's WebAssembly build (`@jsquash/jxl`) in a worker thread. It encodes 8-bit sRGB, so wide-gamut sources are converted to sRGB for this format only.
- Photos with a wide-gamut ICC profile keep that profile in every other output format when "Keep wide-gamut colour" is on.
- Video quality maps to a CRF calibrated per codec so the same slider position gives similar visual quality in H.264, HEVC, VP9, and AV1.
- FFmpeg comes from `ffmpeg-static`, pinned to an exact version because its minor releases can change the downloaded binary.
- On Apple Silicon, `npm install` also runs `scripts/fetch-ffmpeg.mjs`, which downloads FFmpeg and FFprobe 9.0.2 from [Martin Riedl's build server](https://ffmpeg.martin-riedl.de) into `vendor/`, verifies their SHA-256 checksums, and bundles them with the macOS build. Their SVT-AV1 uses ARM SIMD, unlike the `ffmpeg-static` arm64 binary. If the download fails, the app falls back to `ffmpeg-static`.
- AV1 uses SVT-AV1 when ffmpeg includes it and falls back to libaom. The app marks AV1 as slow when SVT-AV1 lacks SIMD support.
- AAC uses Apple's AudioToolbox encoder on macOS, then libfdk_aac when available, then ffmpeg's built-in encoder.
- Compression effort (Fast, Balanced, Maximum) trades encode time for smaller files across every encoder.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- macOS, Windows, or Linux for development.
- macOS is required to build a macOS DMG locally.

## Getting Started

```bash
npm install
npm run dev
```

The development command starts Vite and launches Electron.

## Build Commands

```bash
npm run build
```

Builds the React/Vite renderer into `dist/`.

```bash
npm run package
```

Creates an unpacked desktop app in `release/`.

```bash
npm run dist
```

Creates distributable desktop builds in `release/`, including a macOS DMG when run on macOS.

## macOS Installer

After running `npm run dist` on an Apple Silicon Mac, the DMG is expected at:

```text
release/Asset Optimizer-0.1.0-arm64.dmg
```

If no valid Apple Developer ID certificate is installed, Electron Builder may skip code signing. The app can still be packaged for local testing, but unsigned builds may trigger macOS Gatekeeper warnings when shared.

## Usage Notes

Asset Optimizer writes converted or optimized files to the selected output folder, or to an optimized folder beside each source asset when no output folder is selected. Always confirm your settings before processing important files.

For safest results:

- Keep backups of original assets.
- Test new presets on duplicate files first.
- Review output files before deleting originals.
- Do not use the app as the only copy-management step in a critical workflow.

## Legal Disclaimer

Asset Optimizer is provided "as is" and "as available" without warranties of any kind, whether express, implied, statutory, or otherwise, including but not limited to warranties of merchantability, fitness for a particular purpose, title, non-infringement, performance, reliability, availability, accuracy, or data integrity.

Use this software entirely at your own risk. You are solely responsible for selecting files, choosing settings, verifying outputs, maintaining backups, and determining whether the software is appropriate for your use case. Media optimization, conversion, renaming, metadata handling, compression, and file system operations can produce unexpected results, including quality loss, metadata loss, incompatible files, naming conflicts, overwritten files, corrupted outputs, workflow disruption, or data loss.

To the maximum extent permitted by law, Fullermotion LLC and its owners, members, managers, employees, contractors, contributors, affiliates, successors, and assigns shall not be liable for any direct, indirect, incidental, consequential, special, exemplary, punitive, or other damages, losses, costs, claims, liabilities, or expenses arising from or related to the software, its installation, use, misuse, inability to use, distribution, outputs, or performance, even if advised of the possibility of such damages.

You agree to defend, indemnify, and hold harmless Fullermotion LLC and its owners, members, managers, employees, contractors, contributors, affiliates, successors, and assigns from and against any claims, damages, liabilities, losses, judgments, settlements, costs, and expenses, including reasonable attorneys' fees, arising out of or related to your use, misuse, modification, distribution, installation, operation, configuration, or reliance on this software or any files produced by it.

Nothing in this README creates a service agreement, support obligation, maintenance obligation, professional advice relationship, warranty, guarantee, or representation that the software is suitable for any specific purpose. Some jurisdictions do not allow certain warranty exclusions or liability limitations, so some of the above may not apply to you.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
