# The Astral Archivist (Softablitz Phase 2)
## High-Performance Desktop Recorder, Non-Destructive Video Editor & Speech Intelligence Suite

---

## 1. Executive Summary & Verification Target

**The Astral Archivist** is a native cross-platform desktop application built for developers, educators, and technical teams to record, archive, edit, and export tutorials, software walkthroughs, and anomaly reports with zero cloud compute dependency.

It fulfills the official Softablitz problem statement **“The Astral Archivist”** by integrating:
- **Tauri v2 + Rust Architecture**: High-throughput native desktop performance, secure system commands, direct hardware capability probing, and transactional filesystem management.
- **Deterministic Pure Core (`@astral/core`)**: Zero-DOM mathematical algorithms for piecewise-linear timeline compaction, bijective timestamp inversion, and TF-IDF summarization.
- **Native Media Pipeline**: Single-pass native FFmpeg filtergraphs for loss-minimized timeline slicing, audio ducking, channel muting, and MP4 rendering.

---

## 2. Requirement Traceability Matrix

### Mandatory Features (B1 - B5)

| Requirement ID | Specification | Implementation Architecture | Verification |
|---|---|---|---|
| **B1: Screen/App Recording** | Capture full desktop display or application window with start, pause, resume, and stop controls. | Webview `getDisplayMedia` hardware-accelerated streams + reactive state machine. | Tested across screen, window, and webview sources with duration verification. |
| **B2: Mic & Webcam Overlay** | Record voiceover audio simultaneously and toggle webcam Picture-in-Picture (PIP). | Web Audio context mixer + dynamic webcam PIP canvas with 4-corner anchor selection (`top-left`, `top-right`, `bottom-left`, `bottom-right`). | Audio level metering verified; PIP toggle operates in real-time. |
| **B3: Persistent Vault Library** | Local archive with thumbnails, metadata index, title renaming, and permanent file deletion. | Rust `astral_vault` transactional manifest (`manifest.json` + `recordings/`) with atomic temp-file commit and safe disk unlinking. | Items persist across restarts; confirmed delete frees disk space. |
| **B4: Non-Destructive Editor & Export** | Cut, split, trim, reorder, mute audio per clip, and export playable MP4. | Non-destructive sequence model + Rust native FFmpeg `-filter_complex` concatenation graph. | Splits and trims calculate sub-millisecond slices; exports playable `.mp4`. |
| **B5: Transcription, Captions & Summary** | Generate timestamped transcript tokens, support inline text editing, render preview captions, and produce concise summary. | `transcriptionService` token mapper + interactive word flow + `@astral/core` TF-IDF sentence ranker. | Word-level timestamps, inline edits, live captions, and summary generated. |

### Advanced Features (A1 - A4)

| Requirement ID | Specification | Implementation Architecture | Verification |
|---|---|---|---|
| **A1: Text-Based Ripple Video Editing** | Delete word/sentence tokens to automatically ripple-cut corresponding media intervals. | Bijective piecewise-linear timeline engine (`buildPlaybackSegments`). | Double-clicking words strikes tokens and immediately recalculates contiguous timeline slices. |
| **A2: AI Speech Replacement** | Replace spoken transcript intervals with synthesized voiceover without disrupting visual sync. | Offline prosody-matched WAV RIFF synthesizer (`synthesizeOverdubWavBytes`) with rate normalization (`[0.65x, 1.75x]`). | Generates replacement speech PCM and tags token as `isEdited`. |
| **A3: Invisible Grimoire (Speaker Notes)** | Display speaker notes and teleprompter during recording excluded from final output. | Isolated drawer/window layer excluded from capture surface compositing. | Notes remain visible to the presenter without entering captured video frames. |
| **A4: Audio Enhancement & Suggestions** | Configurable noise suppression DSP and automatic filler/hesitation detection with user confirmation. | Lexical filler pattern matcher (`tagLexicalFillers`) + interactive suggestion banner (`Accept Cuts` / `Dismiss`). | Surfaces fillers ("um", "uh") and prompts user before applying cuts. |

---

## 3. Monorepo Structure

```text
├── apps/
│   ├── astral-archivist/       # Desktop Application (Tauri v2 + React 18 + TypeScript)
│   │   ├── src/                # UI Workspace: Recorder, Vault, Editor, Services
│   │   │   ├── components/     # CaptureConsole, VaultGallery, EditorWorkspace
│   │   │   └── services/       # tauriClient (IPC bridge), transcriptionService
│   │   └── src-tauri/          # Rust Native Backend
│   │       └── src/            # commands.rs, vault.rs, ffmpeg.rs, lib.rs
│   └── webster/                # Phase 1 Browser Editor Application (Preserved)
├── packages/
│   ├── BACKEND-CORE/           # @astral/core: Pure mathematical timeline math & DSP
│   └── UI/                     # @astral/ui-editor: Reusable component library
└── docs/                       # Architecture decisions (ADRs) & specifications
```

---

## 4. Getting Started & Development

### Prerequisites
- **Node.js**: v18+ with `pnpm` (`v12+`)
- **Rust Toolchain**: `rustc` and `cargo` (1.80+ or 1.99+)
- **FFmpeg / FFprobe**: Accessible in system PATH

### Commands
```bash
# Install workspace dependencies
pnpm install

# Run unit tests across pure mathematical engines
pnpm test

# Typecheck workspace TypeScript packages
pnpm typecheck

# Run Astral Archivist desktop in Vite dev mode
pnpm dev:desktop

# Build Astral Archivist production bundle
pnpm build:desktop

# Verify Tauri Rust backend compilation
pnpm tauri info
```

---

## 5. Security & Persistence Guarantees

1. **Transactional Manifest**: Vault index operations write to `manifest.json.tmp` before performing an atomic rename, ensuring zero index corruption if power is interrupted.
2. **Safe Deletion**: Deleting recordings from the vault permanently unlinks media binaries from the filesystem after updating the manifest.
3. **Sandbox Compliance**: Frontend webviews have zero raw shell or unrestricted filesystem access; all operations route through strictly typed Tauri Rust command handlers.
