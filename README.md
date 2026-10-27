# 🌌 THE ASTRAL ARCHIVIST
### Celestial Recording Studio & Offline Non-Linear Video Editor

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🔮 Overview

**The Astral Archivist** is an ultra-modern, local-first multimedia creation suite designed for content creators, researchers, and digital storytellers. It unifies a high-performance **Celestial Screen & Webcam Recording Studio**, an **Encrypted Archive Library**, and a **Desktop-Grade Multi-Track Video Editor** with local AI transcription—all running 100% offline with zero cloud latency and total data sovereignty.

```
                              ┌──────────────────────────────────────────────┐
                              │            THE ASTRAL ARCHIVIST              │
                              │           Tauri v2 Desktop App               │
                              └──────────────────────┬───────────────────────┘
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────────────┐
               │                                     │                                     │
               ▼                                     ▼                                     ▼
 ┌───────────────────────────┐         ┌───────────────────────────┐         ┌───────────────────────────┐
 │       STUDIO SUITE        │         │      ARCHIVE LIBRARY      │         │     SCARLET NLE EDITOR    │
 ├───────────────────────────┤         ├───────────────────────────┤         ├───────────────────────────┤
 │ • Multi-source recorder   │         │ • High-density cards      │         │ • 5-Track virtual timeline│
 │ • Sacred camera mandala   │         │ • Dynamic thumbnails      │         │ • Video, Audio, Titles,   │
 │ • System + Mic audio mix  │         │ • Inline video player     │         │   Stickers & Filter tracks│
 │ • Invisible Grimoire      │         │ • One-click editor import │         │ • On-device Whisper AI    │
 │   teleprompter window     │         │ • Renaming & vault delete │         │ • Client-side FFmpeg WASM │
 └───────────────────────────┘         └───────────────────────────┘         └───────────────────────────┘
```

---

## ✨ Key Features

### 🎙️ 1. Studio Recording Suite
- **Flexible Capture Modes**: Screen + Camera composite, Screen only, or high-fidelity Voice-only recording.
- **Astral Camera Mandala**: Movable, resizable circular webcam overlay with animated celestial borders.
- **Grimoire Teleprompter**: A dedicated, floating transparent note-taking and script prompter with OS window capture exclusion (`WDA_EXCLUDEFROMCAPTURE`), keeping your notes invisible in recordings.
- **Multi-Source Audio Routing**: Synchronous hardware mixing of system display audio and microphone tracks.

### 🏛️ 2. Vault Archive Library
- **Visual Archive Grid**: Instant access to all recorded takes and voice notes with generated frame thumbnails.
- **Full Player Modal**: In-app playback with scrubber, duration stamps, and audio waveform indicators.
- **One-Click Timeline Transfer**: Open any saved take directly in the multi-track editor with automatic timeline synchronization.
- **Atomic Operations**: Rename, filter by media type (Video / Audio), or delete recordings from the local database.

### ✂️ 3. Scarlet Multi-Track NLE Editor
- **5-Track Non-Destructive Editing Engine**:
  - `Track 1`: **Effects & Filters** (Cyberpunk Neon, Vintage Film, Monochrome Noir, Cinematic Warmth, VHS Glitch)
  - `Track 2`: **Stickers & Overlays** (Subscribe badge, Glowing arrows, Fire, Astral runes)
  - `Track 3`: **Titles & Subtitles** (Cinematic serif, Neon bold, Minimal lower-thirds)
  - `Track 4`: **Composite Video** (Multi-clip timeline with ripple compaction, razor splits, and transitions)
  - `Track 5`: **Audio & Voiceover** (Individual track gain, mute/lock controls, background music layering)
- **Drag-and-Drop Workflow**:
  - Drag clips, filters, stickers, and transitions directly into target tracks or onto video clips.
  - Interactive edge-trimming with yellow hover handles to adjust clip durations seamlessly.
- **Project Persistence**:
  - Full project state preservation across tab switches.
  - Project management bar with project naming, `+ New`, `💾 Save`, and `📂 Open` actions backed by local storage and JSON export.
- **High-Precision Video Preview**:
  - Dual monitor mode (Source Clip vs. Master Timeline).
  - 60 FPS playhead scrubbing with millisecond-level timecode displays (`00:00:00:000`).
  - Interactive zoom control (`Ctrl + Wheel` or zoom slider) for precise cutting.
- **On-Device Whisper AI & Auto-Clean**:
  - Local speech-to-text powered by ONNX / WebGPU Transformers.
  - Text-based transcript editing: deleting words in transcript automatically slices corresponding video frames.

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Desktop Shell** | [Tauri v2](https://tauri.app/) (Rust) | Native Windows/macOS/Linux windowing, OS IPC, low memory footprint |
| **Frontend Framework** | [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/) | High-performance component rendering and lightning-fast HMR |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) | Decoupled reactive stores for Recorder, Vault, Timeline, and Editor |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) | Curated dark-mode aesthetic with custom astral glassmorphic tokens |
| **Icons** | [Lucide React](https://lucide.dev/) | Clean, consistent vector iconography |
| **AI Inference** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | WebGPU-accelerated local Whisper transcription |
| **Video Processing** | [@ffmpeg/ffmpeg](https://ffmpegwasm.netlify.app/) WebAssembly | Client-side format transcoding, filtergraphs, and container packaging |

---

## 📁 Repository Structure

```
.
├── src/
│   ├── assets/               # Celestial backgrounds, logos, and camera mandalas
│   ├── components/
│   │   ├── grimoire/         # Notes & teleprompter window
│   │   ├── library/          # Vault archive library view & thumbnail cache
│   │   ├── recorder/         # Recording deck, source selectors, webcam overlay
│   │   ├── timeline/         # Studio playback scrubber
│   │   ├── transcript/       # Voice note transcribe reader
│   │   └── vault/            # Video playback modal
│   ├── editor/
│   │   ├── ScarletEditorApp.tsx  # Central NLE Video Editor application
│   │   ├── editorBridge.ts       # Cross-tab state sharing & project loader
│   │   ├── core/                 # Timeline mathematical engine, DSP & filtergraphs
│   │   ├── export/               # FFmpeg WASM exporter pipeline
│   │   ├── services/             # Offline Whisper AI speech recognition
│   │   └── ui/
│   │       ├── common/           # Scarlet UI buttons and icons
│   │       ├── layout/           # Activity dock, sub-nav sidebar, status footer
│   │       ├── modals/           # Export modal, capture dialog, fault bar
│   │       ├── player/           # Dual-screen video preview monitor
│   │       ├── timeline/         # MultiTrackTimeline with drag & trim handles
│   │       └── workspace/        # Media drawer, effects, stickers, titles
│   ├── store/                # Zustand stores (useRecorderStore, useVaultStore, useTimelineStore)
│   ├── types/                # IPC interfaces, EDL models, and recording metadata
│   ├── utils/                # Media utilities, canvas composite engine, audio mixer
│   ├── App.tsx               # Main window layout & tab coordinator
│   └── main.tsx              # React DOM entry point
├── src-tauri/
│   ├── src/
│   │   ├── commands/         # Rust IPC commands (capture, vault, media, ai)
│   │   ├── engine/           # Screen recording, FFmpeg probe, native Whisper
│   │   └── utils/            # Vault storage & filesystem helpers
│   ├── Cargo.toml            # Rust backend dependencies
│   └── tauri.conf.json       # Tauri window and capability configuration
├── public/                   # Static icons and assets
├── package.json              # NPM dependencies and scripts
└── tsconfig.json             # TypeScript compiler configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0+ or v20.0+
- **Rust**: `rustc` and `cargo` (latest stable toolchain)
- **OS Dependencies** (Windows: C++ Build Tools; Linux: WebKit2GTK / libappindicator)

### Installation
```bash
# Clone the repository
git clone https://github.com/aksjc2023-code/astral-archivist.git
cd astral-archivist

# Install frontend dependencies
npm install
```

### Development
```bash
# Launch the full desktop application (Vite dev server + Tauri native shell)
npm run tauri dev
```

### Production Build
```bash
# Type check and build Vite frontend
npm run build

# Compile native release binary with Tauri
npm run tauri build
```

---

## 🛡️ Security & Privacy
- **Zero Cloud Leakage**: All recordings, transcripts, and video edits remain strictly on your local disk.
- **Affinity Privacy**: The Grimoire teleprompter leverages Windows native API `WDA_EXCLUDEFROMCAPTURE` to keep private notes out of screen captures.
- **Non-Destructive EDL**: Cuts, trims, and edits modify an in-memory Edit Decision List (EDL) without destroying the original source recordings.

---

## 📜 License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
