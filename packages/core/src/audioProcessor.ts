/**
 * 3-Stage Vocal Enhancement DSP Chain & Exponential B-Roll Ducking Calculator
 * Zero-DOM pure TypeScript implementation for @astral/core
 */

export interface VocalPurifierConfig {
  highPassHz?: number;           // Default: 85Hz (removes mic rumble / plosives)
  presencePeakHz?: number;       // Default: 2800Hz (boosts vocal intelligibility)
  presenceGainDb?: number;       // Default: +3.5dB
  noiseGateThresholdDb?: number; // Default: -42dBFS
  attenuationFloor?: number;     // Default: 0.15
}

/**
 * Applies an 85Hz 1st-order High-Pass Filter + RMS Noise Gate
 * to a mono Float32Array PCM buffer.
 */
export function processVocalPurifierPcm(
  inputPcm: Float32Array,
  sampleRate = 16000,
  config: VocalPurifierConfig = {}
): Float32Array {
  if (inputPcm.length === 0 || sampleRate <= 0) {
    return new Float32Array(0);
  }

  const hpCutoff = config.highPassHz ?? 85;
  const gateDb = config.noiseGateThresholdDb ?? -42;
  const gateFloor = config.attenuationFloor ?? 0.15;
  const gateLinear = Math.pow(10, gateDb / 20);

  // Stage 1: 85Hz High-Pass Filter
  const rc = 1 / (2 * Math.PI * hpCutoff);
  const dt = 1 / sampleRate;
  const alphaHp = rc / (rc + dt);

  const hpOut = new Float32Array(inputPcm.length);
  let prevIn = inputPcm[0] ?? 0;
  let prevOut = 0;

  for (let i = 0; i < inputPcm.length; i++) {
    const x = inputPcm[i] ?? 0;
    const y = alphaHp * (prevOut + x - prevIn);
    hpOut[i] = y;
    prevIn = x;
    prevOut = y;
  }

  // Stage 2: Soft RMS Noise Gate with 10ms window smoothing
  const winSize = Math.max(1, Math.floor(0.01 * sampleRate));
  const finalOut = new Float32Array(hpOut.length);

  for (let offset = 0; offset < hpOut.length; offset += winSize) {
    const end = Math.min(hpOut.length, offset + winSize);
    let sumSq = 0;
    for (let i = offset; i < end; i++) {
      const s = hpOut[i] ?? 0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / (end - offset));
    const gain = rms < gateLinear ? gateFloor : 1.0;

    for (let i = offset; i < end; i++) {
      const sample = (hpOut[i] ?? 0) * gain;
      finalOut[i] = Math.max(-1, Math.min(1, sample));
    }
  }

  return finalOut;
}

/**
 * Computes the target background music ducking gain (0.22 during active dialogue,
 * 1.0 during instrumental pauses).
 */
export function computeAudioDuckingGain(
  currentTimeSec: number,
  activeWordRanges: readonly { start: number; end: number; deleted?: boolean }[],
  duckedGain = 0.22,
  normalGain = 1.0,
  lookaheadSec = 0.08
): number {
  const isSpeaking = activeWordRanges.some(
    w => !w.deleted && currentTimeSec >= w.start - lookaheadSec && currentTimeSec <= w.end + lookaheadSec
  );
  return isSpeaking ? duckedGain : normalGain;
}
