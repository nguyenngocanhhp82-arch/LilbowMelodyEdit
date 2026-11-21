import { describe, it, expect } from 'vitest';
import { detectPitchYinFrame, analyzeAudioBuffer } from './pitchDetection';
import { segmentNotes } from './noteSegmenter';
import {
  generateSineTone,
  generateSyntheticVocal,
  generateArpeggio,
  calculateCentDifference,
} from '../test/audioTestUtils';

describe('Pitch Detection (YIN) & Note Segmentation', () => {
  const sampleRate = 44100;

  it('detects pure A4 (440 Hz) with sub-cent precision', () => {
    const tone = generateSineTone(440, 0.1, { sampleRate, amplitude: 0.8 });
    const result = detectPitchYinFrame(tone, { sampleRate });

    expect(result.frequency).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.95);
    // Verify difference is within 5 cents (human perception threshold is ~10-15 cents)
    const centDiff = Math.abs(calculateCentDifference(result.frequency, 440));
    expect(centDiff).toBeLessThan(5);
  });

  it('detects vocal-like signal with harmonics and vibrato accurately', () => {
    const targetFreq = 261.63; // C4
    const vocal = generateSyntheticVocal(targetFreq, 0.3, 5, 25, { sampleRate });
    const frames = analyzeAudioBuffer(vocal, { sampleRate, bufferSize: 2048, hopSize: 512 });

    const voicedFrames = frames.filter((f) => f.isVoiced);
    expect(voicedFrames.length).toBeGreaterThan(5);

    // Compute average detected frequency across steady portion
    const avgFreq = voicedFrames.reduce((acc, f) => acc + f.frequency, 0) / voicedFrames.length;
    const centDiff = Math.abs(calculateCentDifference(avgFreq, targetFreq));
    expect(centDiff).toBeLessThan(10);
  });

  it('correctly segments an arpeggio sequence into discrete Note Blobs', () => {
    // Generate C4, E4, G4 arpeggio (MIDI 60, 64, 67)
    const { buffer } = generateArpeggio([60, 64, 67], 0.25, 0.08, { sampleRate });
    const frames = analyzeAudioBuffer(buffer, { sampleRate, bufferSize: 1024, hopSize: 256 });
    const notes = segmentNotes(frames);

    expect(notes.length).toBe(3);

    // First note should be near C4 (60)
    expect(notes[0].roundedMidi).toBe(60);
    expect(Math.abs(notes[0].originalMidi - 60)).toBeLessThan(0.3);

    // Second note should be near E4 (64)
    expect(notes[1].roundedMidi).toBe(64);
    expect(Math.abs(notes[1].originalMidi - 64)).toBeLessThan(0.3);

    // Third note should be near G4 (67)
    expect(notes[2].roundedMidi).toBe(67);
    expect(Math.abs(notes[2].originalMidi - 67)).toBeLessThan(0.3);

    // Durations should be roughly 0.25s
    expect(notes[0].duration).toBeGreaterThan(0.15);
    expect(notes[0].duration).toBeLessThan(0.35);
  });

  it('rejects silent audio frames cleanly without false positives', () => {
    const silence = new Float32Array(2048); // all zeros
    const result = detectPitchYinFrame(silence, { sampleRate });
    expect(result.frequency).toBe(0);
    expect(result.confidence).toBe(0);
  });
});
