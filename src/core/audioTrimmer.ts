/**
 * Audio Trimmer & Waveform Utilities
 * Handles region slicing, time trimming, and waveform peak extraction for long audio files.
 */

import { createCompatibleBuffer } from './audioContextHelper';

export interface WaveformPeaks {
  mins: Float32Array;
  maxs: Float32Array;
  length: number;
}

/**
 * Downsamples raw audio samples into min/max peak pairs for high-performance canvas rendering.
 * Even for a 10-minute audio file (26 million samples), this generates ~1000-2000 points instantly.
 */
export function extractWaveformPeaks(
  channelData: Float32Array,
  numBuckets: number = 1000
): WaveformPeaks {
  const buckets = Math.max(100, Math.min(numBuckets, channelData.length));
  const samplesPerBucket = Math.floor(channelData.length / buckets);
  const mins = new Float32Array(buckets);
  const maxs = new Float32Array(buckets);

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(channelData.length, start + samplesPerBucket);
    let min = 1.0;
    let max = -1.0;

    for (let i = start; i < end; i++) {
      const val = channelData[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    mins[b] = min === 1.0 ? 0 : min;
    maxs[b] = max === -1.0 ? 0 : max;
  }

  return { mins, maxs, length: buckets };
}

/**
 * Extract a sub-region from an AudioBuffer given start and end timestamps in seconds.
 */
export function trimAudioBuffer(
  sourceBuffer: AudioBuffer,
  startTimeSec: number,
  endTimeSec: number
): AudioBuffer {
  const sampleRate = sourceBuffer.sampleRate;
  const numChannels = sourceBuffer.numberOfChannels;
  const totalSamples = sourceBuffer.length;

  const startSample = Math.max(0, Math.min(totalSamples, Math.floor(startTimeSec * sampleRate)));
  const endSample = Math.max(startSample + 1, Math.min(totalSamples, Math.floor(endTimeSec * sampleRate)));
  const slicedLength = endSample - startSample;

  const trimmedBuffer = createCompatibleBuffer(numChannels, slicedLength, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const sourceData = sourceBuffer.getChannelData(c);
    const targetData = trimmedBuffer.getChannelData(c);
    targetData.set(sourceData.subarray(startSample, endSample));
  }

  return trimmedBuffer;
}

/**
 * Trims a Float32Array mono channel directly
 */
export function trimFloat32Array(
  samples: Float32Array,
  sampleRate: number,
  startTimeSec: number,
  endTimeSec: number
): Float32Array {
  const startSample = Math.max(0, Math.min(samples.length, Math.floor(startTimeSec * sampleRate)));
  const endSample = Math.max(startSample + 1, Math.min(samples.length, Math.floor(endTimeSec * sampleRate)));
  return samples.slice(startSample, endSample);
}
