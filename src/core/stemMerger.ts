/**
 * Stem Merger & Master Re-Mix Engine
 * Replaces the edited vocal stem back into the instrumental backing track
 * at exact time offsets, applies soft-clipping/mastering limiter, and exports final song.
 */

import { createCompatibleBuffer } from './audioContextHelper';

export interface MergeOptions {
  vocalGain?: number; // e.g. 1.0 (0dB)
  instrumentalGain?: number; // e.g. 1.0 (0dB)
  offsetSec?: number; // timestamp where trimmed vocal starts in the master track
}

/**
 * Soft clipper / analog-style saturation to prevent digital clipping above 0dBFS
 */
function softClip(sample: number): number {
  if (sample > 1.0) {
    return 1.0 - Math.exp(-sample);
  } else if (sample < -1.0) {
    return -1.0 + Math.exp(sample);
  }
  return sample;
}

/**
 * Merge edited vocal stem back into the instrumental track.
 * Supports partial region replacement with smooth boundary crossfade.
 */
export function mergeStems(
  instrumentalBuffer: AudioBuffer,
  editedVocalBuffer: AudioBuffer,
  options: MergeOptions = {}
): AudioBuffer {
  const sampleRate = instrumentalBuffer.sampleRate;
  const numChannels = instrumentalBuffer.numberOfChannels;
  const masterLength = instrumentalBuffer.length;

  const vocalGain = options.vocalGain ?? 1.0;
  const instGain = options.instrumentalGain ?? 1.0;
  const offsetSec = options.offsetSec ?? 0;
  const startSample = Math.max(0, Math.floor(offsetSec * sampleRate));

  const mergedBuffer = createCompatibleBuffer(numChannels, masterLength, sampleRate);

  const crossfadeLen = Math.floor(0.01 * sampleRate); // 10ms crossfade at edges

  for (let c = 0; c < numChannels; c++) {
    const instData = instrumentalBuffer.getChannelData(c);
    const vocalChan = Math.min(c, editedVocalBuffer.numberOfChannels - 1);
    const vocalData = editedVocalBuffer.getChannelData(vocalChan);
    const mergedData = mergedBuffer.getChannelData(c);

    // Copy instrumental with gain
    for (let i = 0; i < masterLength; i++) {
      mergedData[i] = instData[i] * instGain;
    }

    // Add edited vocal at the target offset with edge crossfades
    const vocalLength = editedVocalBuffer.length;
    for (let i = 0; i < vocalLength; i++) {
      const targetIdx = startSample + i;
      if (targetIdx >= masterLength) break;

      let edgeWeight = 1.0;
      if (i < crossfadeLen) {
        edgeWeight = i / crossfadeLen;
      } else if (i > vocalLength - crossfadeLen) {
        edgeWeight = (vocalLength - i) / crossfadeLen;
      }

      const vocalSample = vocalData[i] * vocalGain * edgeWeight;
      const combined = mergedData[targetIdx] + vocalSample;

      // Apply soft limiting
      mergedData[targetIdx] = softClip(combined);
    }
  }

  return mergedBuffer;
}

/**
 * Export any AudioBuffer (Mono or Stereo) to a 16-bit WAV Blob
 */
export function exportAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  // Interleave channels if stereo
  let samples: Float32Array;
  if (numChannels === 1) {
    samples = buffer.getChannelData(0);
  } else {
    // Interleave L, R, L, R...
    samples = new Float32Array(length * 2);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      samples[i * 2] = left[i];
      samples[i * 2 + 1] = right[i];
    }
  }

  // 16-bit PCM WAV encoder
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
