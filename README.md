# Asset Optimizer

Asset Optimizer is a desktop app for optimizing, converting, and batch-renaming image and video assets. It is built with Electron, React, Vite, Sharp, FFmpeg, Font Awesome icons, and the Inter typeface.

Copyright (c) 2026 Fullermotion LLC.  
Website: https://www.fullermotion.com

## Features

- Optimize images and videos with adjustable quality settings.
- Convert images and videos to common output formats.
- Batch rename files with pattern tokens, prefix/suffix fields, find-and-replace, padding, case options, and slugified filenames.
- Drag and drop files into a clean desktop interface.
- Choose a custom output folder or create optimized files beside the source assets.
- Switch between light and dark mode.
- Package for macOS, Windows, and Linux through Electron Builder.

## Supported Assets

Image input support includes JPG, JPEG, PNG, WebP, AVIF, TIFF, HEIC, and HEIF.

Video input support includes MP4, MOV, M4V, WebM, MKV, and AVI.

Output support depends on the selected source type and target format. HEIC and HEIF input on macOS uses the system image tooling as a fallback before optimization.

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
