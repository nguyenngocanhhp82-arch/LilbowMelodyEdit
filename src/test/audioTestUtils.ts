/**
 * Audio Test Utilities
 * Generates synthetic deterministic audio signals for testing DSP, Pitch Detection,
 * Scale Snapping, and Pitch Shifting without external audio file dependencies.
 */

export interface TestSignalConfig {
  sampleRate?: number;
  amplitude?: number;
}

/** Convert frequency in Hz to MIDI note number (A4 440Hz = 69) */
export function freqToMidi(freq: number): number {
  if (freq <= 0) return 0;
  return 69 + 12 * Math.log2(freq / 440);
}

/** Convert MIDI note number to frequency in Hz */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Calculate the difference in cents between two frequencies */
export function calculateCentDifference(f1: number, f2: number): number {
  if (f1 <= 0 || f2 <= 0) return 0;
  return 1200 * Math.log2(f1 / f2);
}

/** Generate a clean sine tone buffer (Float32Array) */
export function generateSineTone(
  freqHz: number,
  durationSec: number,
  config: TestSignalConfig = {}
): Float32Array {
  const sampleRate = config.sampleRate ?? 44100;
  const amplitude = config.amplitude ?? 0.8;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);
  const angularFreq = 2 * Math.PI * freqHz;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    buffer[i] = amplitude * Math.sin(angularFreq * t);
  }
  return buffer;
}

/**
 * Generate a synthetic vocal-like signal with harmonics and natural vibrato
 * Harmonic decay simulates human vocal cord resonance.
 */
export function generateSyntheticVocal(
  fundamentalFreq: number,
  durationSec: number,
  vibratoFreq: number = 5.0, // typical 5Hz vibrato
  vibratoDepthCents: number = 30, // 30 cents vibrato depth
  config: TestSignalConfig = {}
): Float32Array {
  const sampleRate = config.sampleRate ?? 44100;
  const amplitude = config.amplitude ?? 0.7;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const buffer = new Float32Array(totalSamples);

  // Harmonics weights (fundamental + overtones simulating vocal tract)
  const harmonics = [1.0, 0.5, 0.3, 0.15, 0.08, 0.04];
  let phase = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Envelope: 20ms attack, 20ms release to avoid clicks
    let env = 1.0;
    const attackSamples = 0.02 * sampleRate;
    const releaseSamples = 0.02 * sampleRate;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i > totalSamples - releaseSamples) {
      env = (totalSamples - i) / releaseSamples;
    }

    // Vibrato: modulate instantaneous frequency
    const vibratoRatio = Math.pow(2, (vibratoDepthCents * Math.sin(2 * Math.PI * vibratoFreq * t)) / 1200);
    const currentF0 = fundamentalFreq * vibratoRatio;

    phase += (2 * Math.PI * currentF0) / sampleRate;

    let sampleVal = 0;
    for (let h = 0; h < harmonics.length; h++) {
      sampleVal += harmonics[h] * Math.sin((h + 1) * phase);
    }

    buffer[i] = amplitude * env * (sampleVal / 1.8);
  }

  return buffer;
}

/**
 * Generate an arpeggio sequence of distinct notes with silent gaps
 * Useful for testing note segmentation & multi-note detection.
 */
export function generateArpeggio(
  midiNotes: number[],
  noteDurationSec: number = 0.4,
  gapDurationSec: number = 0.05,
  config: TestSignalConfig = {}
): { buffer: Float32Array; expectedNotes: Array<{ midi: number; start: number; end: number }> } {
  const sampleRate = config.sampleRate ?? 44100;
  const noteSamples = Math.floor(noteDurationSec * sampleRate);
  const gapSamples = Math.floor(gapDurationSec * sampleRate);
  const totalSamples = midiNotes.length * (noteSamples + gapSamples);
  const buffer = new Float32Array(totalSamples);
  const expectedNotes: Array<{ midi: number; start: number; end: number }> = [];

  let currentSample = 0;
  for (const midi of midiNotes) {
    const freq = midiToFreq(midi);
    const noteBuffer = generateSyntheticVocal(freq, noteDurationSec, 0, 0, config);
    const startSec = currentSample / sampleRate;

    buffer.set(noteBuffer, currentSample);
    currentSample += noteSamples;
    const endSec = currentSample / sampleRate;

    expectedNotes.push({ midi, start: startSec, end: endSec });
    currentSample += gapSamples; // leave silence
  }

  return { buffer, expectedNotes };
}

/**
 * Encode a Float32Array audio buffer to 16-bit PCM WAV (ArrayBuffer)
 */
export function encodeWAV(samples: Float32Array, sampleRate: number = 44100): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count: 1 (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
