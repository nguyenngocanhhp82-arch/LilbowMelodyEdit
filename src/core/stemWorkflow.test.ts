import { describe, it, expect } from 'vitest';
import '../test/audioContextMock';
import { extractWaveformPeaks, trimAudioBuffer, trimFloat32Array } from './audioTrimmer';
import { separateStems } from './stemSeparator';
import { mergeStems, exportAudioBufferToWav } from './stemMerger';
import { generateSineTone, generateSyntheticVocal } from '../test/audioTestUtils';
import { MockAudioBuffer } from '../test/audioContextMock';

describe('Stem Pre-processing & Workflow Engine', () => {
  const sampleRate = 44100;

  it('extracts waveform min/max peaks accurately for fast canvas rendering', () => {
    const tone = generateSineTone(440, 0.5, { sampleRate, amplitude: 0.8 });
    const peaks = extractWaveformPeaks(tone, 100);

    expect(peaks.length).toBe(100);
    expect(peaks.maxs.length).toBe(100);
    expect(peaks.mins.length).toBe(100);

    // Max peak should be near +0.8, Min peak near -0.8
    const maxVal = Math.max(...peaks.maxs);
    const minVal = Math.min(...peaks.mins);
    expect(maxVal).toBeCloseTo(0.8, 1);
    expect(minVal).toBeCloseTo(-0.8, 1);
  });

  it('trims Float32Array accurately to exact time bounds', () => {
    const samples = generateSineTone(440, 2.0, { sampleRate });
    // Trim from 0.5s to 1.5s (1.0s total)
    const trimmed = trimFloat32Array(samples, sampleRate, 0.5, 1.5);
    expect(trimmed.length).toBe(sampleRate * 1.0);
  });

  it('trims an AudioBuffer to requested timestamps', () => {
    const mockBuf = new MockAudioBuffer(2, sampleRate * 3, sampleRate);
    const trimmed = trimAudioBuffer(mockBuf as unknown as AudioBuffer, 1.0, 2.5);

    expect(trimmed.numberOfChannels).toBe(2);
    expect(trimmed.length).toBe(Math.floor(sampleRate * 1.5));
  });

  it('separates an audio mix into complementary Vocal and Instrumental stems', async () => {
    // Generate a 1-second stereo mix: Vocal in center, stereo synth in side
    const duration = 1.0;
    const length = Math.floor(sampleRate * duration);
    const mockMix = new MockAudioBuffer(2, length, sampleRate);

    const vocalSignal = generateSyntheticVocal(440, duration, 0, 0, { sampleRate, amplitude: 0.7 });
    const synthSide = generateSineTone(1000, duration, { sampleRate, amplitude: 0.3 });

    const left = mockMix.getChannelData(0);
    const right = mockMix.getChannelData(1);

    for (let i = 0; i < length; i++) {
      left[i] = vocalSignal[i] + synthSide[i]; // L = Center Vocal + Side Synth
      right[i] = vocalSignal[i] - synthSide[i]; // R = Center Vocal - Side Synth
    }

    const stems = await separateStems(mockMix as unknown as AudioBuffer);

    expect(stems.vocal).toBeDefined();
    expect(stems.instrumental).toBeDefined();
    expect(stems.vocal.length).toBe(length);
    expect(stems.instrumental.length).toBe(length);

    // Verify perfect reconstruction property: Vocal + Instrumental === Original Mix
    const vocalDataL = stems.vocal.getChannelData(0);
    const instDataL = stems.instrumental.getChannelData(0);

    for (let i = 0; i < 500; i++) {
      const reconstructed = vocalDataL[i] + instDataL[i];
      expect(reconstructed).toBeCloseTo(left[i], 4);
    }
  });

  it('merges edited vocal stem back into instrumental with soft-limiting protection', () => {
    const duration = 1.0;
    const length = Math.floor(sampleRate * duration);

    const instBuf = new MockAudioBuffer(2, length, sampleRate);
    const vocalBuf = new MockAudioBuffer(1, length, sampleRate);

    // Fill with signals that would exceed 1.0 without limiter
    instBuf.getChannelData(0).fill(0.7);
    instBuf.getChannelData(1).fill(0.7);
    vocalBuf.getChannelData(0).fill(0.7);

    const merged = mergeStems(instBuf as unknown as AudioBuffer, vocalBuf as unknown as AudioBuffer, {
      vocalGain: 1.0,
      instrumentalGain: 1.0,
      offsetSec: 0,
    });

    expect(merged.length).toBe(length);
    const mergedL = merged.getChannelData(0);
    for (let i = 0; i < 100; i++) {
      // Soft clipper should keep all values <= 1.0
      expect(Math.abs(mergedL[i])).toBeLessThanOrEqual(1.0);
    }
  });

  it('exports merged AudioBuffer to a valid WAV Blob', () => {
    const buf = new MockAudioBuffer(2, sampleRate * 0.5, sampleRate);
    const wavBlob = exportAudioBufferToWav(buf as unknown as AudioBuffer);

    expect(wavBlob).toBeDefined();
    expect(wavBlob.type).toBe('audio/wav');
    expect(wavBlob.size).toBeGreaterThan(44);
  });
});
