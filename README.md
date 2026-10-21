# ScarletCut: The Scarlet Rewrite (Webster 2026 // Problem Statement #09)
## Comprehensive Technical Dossier, Architecture Specification & AntiGravity Runbook

---

## 1. Executive Summary & Architecture Overview

**ScarletCut** (`astral-scarlet-monorepo`) is a 100% browser-native, text-driven non-linear video editing (NLE) environment. It couples local on-device machine learning transcription (WebGPU / ONNX Whisper) with sub-millisecond timeline ripple compaction, automated acoustic/lexical filler pruning, and client-side FFmpeg WebAssembly rendering—with **zero server-side dependencies or cloud compute costs**.

```
                           ┌────────────────────────────────────────────────────────┐
                           │               Browser Runtime Sandbox                  │
                           └──────────────────────────┬─────────────────────────────┘
                                                      │
         ┌────────────────────────────────────────────┼────────────────────────────────────────────┐
         │                                            │                                            │
         ▼                                            ▼                                            ▼
┌────────────────────────┐               ┌────────────────────────┐               ┌────────────────────────┐
│     @astral/core       │               │   @astral/ui-editor    │               │      apps/webster      │
│  (Pure TypeScript NLE) │               │   (React Componentry)  │               │    (Vite Application)  │
├────────────────────────┤               ├────────────────────────┤               ├────────────────────────┤
│ • Bijective Timeline   │               │ • Video Preview Monitor│               │ • WebGPU Whisper Engine│
│   Mapping Φ(τ)         │               │ • Multi-Track Timeline │               │ • FFmpeg WASM Exporter │
│ • Filler Purge Engine  │               │ • Transcript Word Flow │               │ • COOP / COEP Headers  │
│ • Vocal Purifier DSP   │               │ • Tools & Effects Rack │               │ • MEMFS Heap Watcher   │
│ • WAV RIFF Synthesizer │               │ • Fault Recovery Bar   │               │ • Media Ingestion Pipe │
│ • TF-IDF Summarizer    │               │ • Export Dialog        │               │ • Local Blob Lifecycle │
└────────────────────────┘               └────────────────────────┘               └────────────────────────┘
```

### 1.1 Monorepo Structure

- **`packages/core`**: Zero-DOM pure TypeScript library (`lib: ["ES2022"]`). Contains mathematical models for bijective virtual timeline mapping, acoustic coalescing, lexical filler detection, 85Hz vocal DSP, offline RIFF/WAV overdub synthesis, TF-IDF summarization, and FFmpeg filtergraph construction.
- **`packages/ui-editor`**: Reusable React 18 component library styled with high-density dark-mode aesthetics. Contains the interactive transcript viewer, multi-track timeline, dual-screen video preview monitor, tools drawer, and fault recovery bars.
- **`apps/webster`**: Vite-powered client single-page application. Integrates WebGPU `@huggingface/transformers` Whisper inference, single-pass `@ffmpeg/ffmpeg` WebAssembly compilation, media container duration/dimension probing, and MEMFS garbage collection.

---

## 2. Mathematical Formalization of Timeline Slicing & Subtitle Mapping

### 2.1 Coalescing Equivalence Relation
Given an ordered sequence of transcribed word tokens $T = \langle t_1, t_2, \dots, t_n \rangle$ where each token is a tuple $t_i = (s_i, e_i, d_i)$ with source start time $s_i$, source end time $e_i$ ($0 \le s_i < e_i \le s_{i+1}$), and deletion flag $d_i \in \{0, 1\}$:

The active subset of kept tokens is defined as:
$$K = \{ t_i \in T \mid d_i = 0 \}$$

Two consecutive kept tokens $t_{i_r}, t_{i_{r+1}} \in K$ coalesce into the same contiguous playback segment $S_k = [a_k, b_k]$ if and only if:
1. No intervening tokens were deleted: $i_{r+1} - i_r = 1$
2. The acoustic boundary gap does not exceed the merge threshold:
$$s_{i_{r+1}} - e_{i_r} \le \epsilon_{\text{merge}} \quad (\epsilon_{\text{merge}} = 0.085\text{ s})$$

Any segment whose duration is shorter than the minimum hardware decoder slice limit is discarded to prevent decoding pipeline stalls:
$$\Delta(S_k) = b_k - a_k \ge \Delta_{\min} \quad (\Delta_{\min} = 0.030\text{ s})$$

### 2.2 Bijective Piecewise-Linear Virtual Timeline Mapping $\Phi(\tau)$
Let $\mathcal{S} = \langle S_1, S_2, \dots, S_m \rangle$ be the coalesced, non-deleted playback segments where $S_k = [a_k, b_k]$ in source seconds.

The virtual timeline is defined over $[0, V_{\text{total}}]$ where:
$$v_1^{\text{start}} = 0$$
$$v_k^{\text{start}} = \sum_{j=1}^{k-1} (b_j - a_j) \quad \text{for } k > 1$$
$$v_k^{\text{end}} = v_k^{\text{start}} + (b_k - a_k)$$
$$V_{\text{total}} = v_m^{\text{end}}$$

The forward mapping $\Phi: \bigcup_{k=1}^m [a_k, b_k] \to [0, V_{\text{total}}]$ projects source media timestamp $\tau$ onto virtual playback time:
$$\Phi(\tau) = v_k^{\text{start}} + (\tau - a_k) \quad \text{for } \tau \in [a_k, b_k)$$

The inverse mapping $\Phi^{-1}: [0, V_{\text{total}}] \to \bigcup_{k=1}^m [a_k, b_k]$ determines the source media seek position:
$$\Phi^{-1}(v) = a_k + (v - v_k^{\text{start}}) \quad \text{for } v \in [v_k^{\text{start}}, v_k^{\text{end}})$$

By evaluating token intervals through $\Phi(\tau)$ inside `generateAssSubtitleScript()`, dialogue subtitles remain synchronized with video across arbitrarily many ripple cuts.

---

## 3. Self-Healing Edge-Case Failure Modes

| Failure Mode | Mechanism | Self-Healing Remediation |
| :--- | :--- | :--- |
| **1. Decoder Pipeline Stall / Black Frame** | Media decoders choke when seeking to deleted regions or encountering sub-30ms cuts. | Clamps intervals via $\Delta_{\min} = 0.030\text{s}$ guard and performs binary search leaps (`getNextValidTime`) across cut boundaries in $O(\log m)$. |
| **2. MEMFS Heap Exhaustion** | 32-bit WebAssembly linear memory caps at 2GB, causing out-of-memory crashes on large video export. | Imposes strict 750MB pre-flight check, executes deterministic descriptor unlinking (`ffmpeg.deleteFile()`) inside `finally` blocks, and detaches ArrayBuffer clones. |
| **3. WebGPU Hardware Context Loss** | Mobile/integrated GPUs drop WebGPU device contexts during heavy compute or backgrounding. | Detects context errors and transparently falls back to multi-threaded SIMD ONNX Runtime WebAssembly CPU execution. |

---

## 4. Key Feature Implementation Matrix

- **Text-Driven Non-Linear Editor**: Real-time interactive word token editing. Selecting text and pressing `Backspace` performs sub-millisecond ripple cuts without re-encoding video during editing.
- **Automated Filler & Pause Pruning**: Detects lexical fillers (`um`, `uh`, `like`, `you know`), discourse markers, and silent pauses (>0.5s) with 120ms acoustic padding to preserve natural cadence.
- **Offline Prosody-Matched TTS Overdub**: Synthesizes 16-bit RIFF/WAV audio buffers in-memory with prosody rate clamping ($r \in [0.65, 1.75]$) to replace transcribed words.
- **Vocal Purifier DSP**: 85Hz High-Pass Filter + 2.8kHz Peaking EQ + RMS soft noise gate implemented with zero DOM dependencies.
- **Local TF-IDF Summarizer**: Client-side extractive summarizer that scores sentences based on normalized term and document frequency.
- **Client-Side WASM Rendering**: Single-pass FFmpeg filter_complex generation supporting stream-copy fast-path (`-c copy`), ASS subtitle burn-in, and resolution/aspect ratio scaling (16:9, 9:16, 1:1, 4:5, 21:9, 4:3).
- **Zero-Trust Cross-Origin Isolation**: Vite configured with `COOP: same-origin` and `COEP: credentialless` to unlock high-performance `SharedArrayBuffer` threading without third-party asset blocking.

---

## 5. Technology Stack & Tool Disclosure

- **Runtime & Build**: Node.js 20+, pnpm 9+, Vite 6, TypeScript 5.7 (strict mode with `noImplicitAny`, `noUncheckedIndexedAccess`).
- **Core ML / AI**: `@huggingface/transformers` (Whisper-tiny.en ONNX WebGPU + WASM SIMD fallback).
- **Media Transcoding**: `@ffmpeg/ffmpeg` 0.12.6 and `@ffmpeg/core` 0.12.6 (WebAssembly).
- **UI Framework**: React 18, Lucide React icons, JetBrains Mono & Inter typography, HTML5 Canvas / Web Audio API.

---

## 6. Verification & Runbook

### 6.1 Runbook Commands

```bash
# 1. Install all dependencies across workspace
pnpm install

# 2. Run pure TypeScript unit test suite (21 tests across 3 packages)
pnpm test

# 3. Perform strict type-checking across packages and apps
pnpm typecheck

# 4. Compile Webster production bundle
pnpm build

# 5. Launch development server with cross-origin isolation
pnpm dev
```

### 6.2 Unit Test Suite Output

```text
✔ 1. Extended punctuation stripping handles ellipses, em-dashes, and smart quotes
✔ 2. Hard fillers vs discourse markers and multi-word phrase matching
✔ 3. Pause tokens inject 120ms acoustic breathing room and enforce strict mediaId
✔ 4. Purge options protect discourse markers by default and compute exact savings
✔ 5. Resample PCM with anti-aliasing preserves 440Hz tone and rejects invalid sample rates
✔ 6. Timestamp monotonicity alignment rejects empty chunks and clamps out-of-order timestamps
✔ 7. Device-aware Whisper runner factory and GPU-error specific fallback
✔ 8. decodeAndResampleTo16kHzMono invokes audio context factories and decodes buffer
✔ 1. formatAssTimestamp converts seconds to H:MM:SS.cs standard ASS format
✔ 2. generateAssSubtitleScript filters deleted & pause tokens and maps virtual timestamps across cuts
✔ 3. generateConcatDemuxerList generates valid ffconcat manifest with inpoints and outpoints
✔ 4. generateFfmpegFilterComplex builds single-pass concat graph across multiple cuts and scale filters
✔ 5. Vocal purifier DSP, WAV RIFF TTS overdubbing, and TF-IDF summarizer operate deterministically
✔ 1. Unsorted input and zero/negative length tokens normalization
✔ 2. Micro-gap coalescing (<= 85ms merges, > 85ms splits)
✔ 3. Deleted first, middle, and last tokens with ripple virtual mapping
✔ 4. 30ms hardware decoder fault guard discards micro-blips
✔ 5. Binary search leap across cut intervals and boundary epsilon
✔ 6. Bijective mapping invertibility between source and virtual domains
✔ 7. Domain validators accept valid data and throw on invalid data
✔ 8. Asset-scoped ripple segments isolates cuts per media asset
ℹ tests 21
ℹ suites 0
ℹ pass 21
ℹ fail 0
```
