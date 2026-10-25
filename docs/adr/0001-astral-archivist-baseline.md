# ADR 0001: Astral Archivist Desktop Architecture and Platform Baseline

## Status
Accepted

## Context
Softablitz Phase 2 specifies **“The Astral Archivist”** (Problem Statement, pp. 33-36): a desktop recorder and editor for tutorials, walkthroughs, software demonstrations, and anomaly reports.
Phase 1 established `@astral/core` (TypeScript deterministic timeline and cut calculation engine) and `@astral/ui-editor` in a browser-native environment (`apps/webster`).

To satisfy Phase 2 without compromising or destabilizing the Phase 1 web app:
- We extend the workspace with a native Tauri v2 desktop application (`apps/astral-archivist`).
- We preserve `@astral/core` for non-destructive cut/ripple logic and timeline math.
- We establish native filesystem persistence, capture boundaries, and FFmpeg command pipelines.

## Architectural Decisions

### 1. Shell & Platform Strategy
- **Framework:** Tauri v2 with Rust backend and React 18 / TypeScript frontend.
- **Primary OS Target:** Windows 10/11 x64 (MSVC ABI).
- **Cross-Platform:** Rust abstractions keep filesystem paths and shell invocations compatible across Windows, macOS, and Linux.
- **Process Separation:** Frontend React UI communicates exclusively via typed Tauri IPC commands and events (`invoke('command_name', args)`). No direct renderer filesystem access.

### 2. Storage & Vault Layout
- **Location:** Application Data Directory (`app_data_dir() / astral-archivist / vault /`).
- **Structure:**
  - `vault/manifest.json`: Atomic transactional metadata index of all sessions.
  - `vault/recordings/{session_id}/raw.mp4` (or `.webm`): Untouched raw capture artifacts.
  - `vault/recordings/{session_id}/thumb.jpg`: Preview thumbnail.
  - `vault/recordings/{session_id}/session.json`: Capture metadata (resolution, fps, mic, pip coordinates, notes state).
- **Safety Guarantee:** Vault files are strictly immutable; edits and ripple operations generate a separate project file or export artifact.

### 3. Capture Adapter Pipeline
- **Display Source:** Native display/window capture via Tauri webview `getDisplayMedia` with hardware-accelerated streams and desktop window handles.
- **Audio:** Microphone stream captured simultaneously via `getUserMedia` and synchronized into the session.
- **Webcam PIP:** Optional webcam stream overlay rendered and recorded or logged with geometry metadata for non-destructive composition.
- **A3 Speaker Notes (Invisible Grimoire):** Notes operate in a separate standalone desktop window or non-composited overlay that is excluded from the recorded display surface.

### 4. Media Processing & Export Pipeline
- **Tooling:** Native FFmpeg and FFprobe sidecar binaries.
- **Validation:** FFprobe validates stream parameters, codecs, frame rates, and durations before and after operations.
- **Export Flow:** Generates native FFmpeg filtergraphs (derived from `@astral/core` cut ranges and audio chains) to render high-throughput, loss-minimized MP4 output without browser WASM memory limits.

### 5. Transcription & Audio AI Pipeline
- **Transcription Interface:** Pluggable `TranscriptionProvider` returning word-level timestamps (`start`, `end`, `word`, `confidence`).
- **Engine Selection:** Local Whisper engine (or validated local HTTP/ONNX runner) with explicit status/error reporting. No mocked success or fabricated timestamps.
- **AI Replacement (A2):** Local synthesis/TTS engine ducking the original speech interval on the timeline and inserting replacement PCM without altering overall video sync.

## Consequences
- Clean separation between pure timeline math (`@astral/core`) and native OS operations.
- Phase 1 browser app remains 100% operational and undisturbed.
- Complete auditability and reproducibility for B1-B5 and A1-A4 requirement verification.
