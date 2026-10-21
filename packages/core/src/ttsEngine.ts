/**
 * Offline Prosody-Matched WAV RIFF Synthesizer for Transcript Word Overdubbing
 * Zero-DOM pure TypeScript implementation for @astral/core
 */

/**
 * Calculates prosody rate multiplier clamped to [0.65, 1.75] so replacement
 * words fit naturally inside the original word's [start, end] slot.
 */
export function computeProsodyRate(
  replacementText: string,
  slotDurationSec: number
): number {
  const cleanLen = Math.max(1, replacementText.trim().length);
  const estimatedNaturalSec = Math.max(0.18, cleanLen * 0.065);
  const safeSlotSec = Math.max(0.1, slotDurationSec);
  const rawRate = estimatedNaturalSec / safeSlotSec;
  return Number(Math.max(0.65, Math.min(1.75, rawRate)).toFixed(3));
}

/**
 * Synthesizes a 16-bit mono RIFF WAVE byte array with a formant-shaped envelope
 * representing the overdubbed word token for deterministic offline playback & testing.
 */
export function synthesizeOverdubWavBytes(
  replacementText: string,
  slotDurationSec: number,
  sampleRate = 16000
): { wavBytes: Uint8Array; prosodyRate: number; durationSec: number } {
  const prosodyRate = computeProsodyRate(replacementText, slotDurationSec);
  const durationSec = Math.max(0.12, Math.min(5.0, slotDurationSec));
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataByteLen = numSamples * 2; // 16-bit mono
  const buffer = new ArrayBuffer(44 + dataByteLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLen, true);

  let hash = 0;
  for (let i = 0; i < replacementText.length; i++) {
    hash = (hash * 31 + replacementText.charCodeAt(i)) | 0;
  }
  const f0 = 135 + (Math.abs(hash) % 60);

  const fadeSamples = Math.min(Math.floor(numSamples * 0.15), Math.floor(0.015 * sampleRate));

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let env = 1.0;
    if (i < fadeSamples && fadeSamples > 0) {
      env = i / fadeSamples;
    } else if (numSamples - i < fadeSamples && fadeSamples > 0) {
      env = (numSamples - i) / fadeSamples;
    }

    const harmonic =
      0.6 * Math.sin(2 * Math.PI * f0 * t) +
      0.3 * Math.sin(2 * Math.PI * (f0 * 2) * t) +
      0.1 * Math.sin(2 * Math.PI * (f0 * 3) * t);

    const val = Math.max(-1, Math.min(1, harmonic * env * 0.35));
    view.setInt16(44 + i * 2, val < 0 ? val * 0x8000 : val * 0x7fff, true);
  }

  return {
    wavBytes: new Uint8Array(buffer),
    prosodyRate,
    durationSec,
  };
}
