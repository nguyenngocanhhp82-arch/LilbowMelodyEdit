/**
 * Audio Pitch Shifter Engine
 * High-performance granular / WSOLA-based time-domain pitch shifter.
 * Changes pitch (in semitones) while preserving original timing and duration.
 */

import { NoteBlob } from './noteSegmenter';

export interface PitchShifterOptions {
  sampleRate?: number;
  grainSize?: number; // e.g. 2048 samples (~46ms at 44.1kHz)
}

/**
 * High-quality linear / cubic interpolation resampler
 */
function resample(input: Float32Array, ratio: number): Float32Array {
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;

    // Linear interpolation
    output[i] = (1 - frac) * input[i0] + frac * input[i1];
  }
  return output;
}

/**
 * Creates a Hann window of specified size
 */
function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * Pitch shift an audio segment by a specific number of semitones
 * without altering duration.
 *
 * Algorithm:
 * 1. Calculate pitch scale factor: pitchFactor = 2^(semitones / 12)
 * 2. If semitones === 0, returns identical copy.
 * 3. WSOLA (Waveform Similarity Overlap-Add) grain synthesis.
 */
export function pitchShiftBuffer(
  input: Float32Array,
  shiftSemitones: number,
  options: PitchShifterOptions = {}
): Float32Array {
  if (Math.abs(shiftSemitones) < 0.01 || input.length === 0) {
    return new Float32Array(input);
  }

  const pitchRatio = Math.pow(2, shiftSemitones / 12);
  const grainSize = options.grainSize ?? 2048;
  const hopOut = Math.floor(grainSize / 4);

  const window = createHannWindow(grainSize);
  const output = new Float32Array(input.length);
  const normWeight = new Float32Array(input.length);

  // Time-stretch with WSOLA then resample
  // Alternatively: resample to change pitch, then time-stretch back to original duration
  const resampled = resample(input, pitchRatio);
  const resampledLength = resampled.length;

  // Stretch resampled back to input.length
  let inPos = 0;
  let outPos = 0;
  const stretchHopOut = hopOut;
  const stretchHopIn = Math.floor(hopOut * (resampledLength / input.length));

  while (outPos + grainSize < output.length && inPos + grainSize < resampledLength) {
    // Cross-correlation search for best zero-crossing / similarity match
    let bestOffset = 0;
    let maxCorr = -Infinity;
    const searchRange = Math.min(32, Math.floor(grainSize / 8));

    if (outPos > 0) {
      for (let offset = -searchRange; offset <= searchRange; offset++) {
        const candidateIn = inPos + offset;
        if (candidateIn < 0 || candidateIn + grainSize >= resampledLength) continue;

        let corr = 0;
        for (let k = 0; k < 64; k += 4) {
          corr += output[outPos + k] * resampled[candidateIn + k];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestOffset = offset;
        }
      }
    }

    const actualIn = inPos + bestOffset;
    for (let i = 0; i < grainSize; i++) {
      if (outPos + i < output.length && actualIn + i < resampledLength) {
        const w = window[i];
        output[outPos + i] += resampled[actualIn + i] * w;
        normWeight[outPos + i] += w;
      }
    }

    outPos += stretchHopOut;
    inPos += stretchHopIn;
  }

  // Normalize by overlapping window weight to avoid amplitude modulation
  for (let i = 0; i < output.length; i++) {
    if (normWeight[i] > 1e-4) {
      output[i] /= normWeight[i];
    } else if (i < input.length) {
      output[i] = input[i]; // Fallback if weight is zero
    }
  }

  return output;
}

/**
 * Apply selective pitch shifts across multiple Note Blobs on a complete audio buffer.
 * Performs smooth cross-fading at note boundaries to avoid clicks.
 */
export function applyNotesPitchShift(
  originalBuffer: Float32Array,
  notes: NoteBlob[],
  sampleRate: number = 44100
): Float32Array {
  const result = new Float32Array(originalBuffer);
  const crossfadeSamples = Math.floor(0.015 * sampleRate); // 15ms smooth crossfade

  for (const note of notes) {
    if (Math.abs(note.pitchShiftSemitones) < 0.01) {
      continue;
    }

    const startSample = Math.max(0, Math.floor(note.startTime * sampleRate));
    const endSample = Math.min(originalBuffer.length, Math.floor(note.endTime * sampleRate));
    const noteLength = endSample - startSample;

    if (noteLength <= 0) continue;

    // Extract slice with padding for natural decay
    const pad = Math.floor(0.05 * sampleRate); // 50ms padding
    const sliceStart = Math.max(0, startSample - pad);
    const sliceEnd = Math.min(originalBuffer.length, endSample + pad);
    const rawSlice = originalBuffer.subarray(sliceStart, sliceEnd);

    // Pitch shift this note slice
    const shiftedSlice = pitchShiftBuffer(rawSlice, note.pitchShiftSemitones, { sampleRate });

    // Blend into result with crossfades
    const noteOffsetInSlice = startSample - sliceStart;

    for (let i = 0; i < noteLength; i++) {
      const targetIdx = startSample + i;
      const sourceIdx = noteOffsetInSlice + i;

      if (sourceIdx >= shiftedSlice.length) break;

      let blend = 1.0;
      // Fade in at note start
      if (i < crossfadeSamples) {
        blend = i / crossfadeSamples;
      }
      // Fade out at note end
      else if (i > noteLength - crossfadeSamples) {
        blend = (noteLength - i) / crossfadeSamples;
      }

      result[targetIdx] = blend * shiftedSlice[sourceIdx] + (1 - blend) * originalBuffer[targetIdx];
    }
  }

  return result;
}
