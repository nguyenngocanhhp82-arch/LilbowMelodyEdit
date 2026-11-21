import { describe, it, expect } from 'vitest';
import {
  freqToMidi,
  midiToFreq,
  calculateCentDifference,
  generateSineTone,
  generateSyntheticVocal,
  generateArpeggio,
  encodeWAV,
} from './audioTestUtils';

describe('Audio Test Utilities', () => {
  it('correctly converts between Frequency and MIDI notes', () => {
    // A4 is exactly 440 Hz -> MIDI 69
    expect(freqToMidi(440)).toBeCloseTo(69, 5);
    expect(midiToFreq(69)).toBeCloseTo(440, 5);

    // C4 is ~261.6256 Hz -> MIDI 60
    expect(freqToMidi(261.6256)).toBeCloseTo(60, 2);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 2);

    // One octave up (A5 880Hz) -> MIDI 81
    expect(freqToMidi(880)).toBeCloseTo(81, 5);
  });

  it('calculates cent differences accurately', () => {
    // One semitone (100 cents) ratio is 2^(1/12)
    const semitoneRatio = Math.pow(2, 1 / 12);
    expect(calculateCentDifference(440 * semitoneRatio, 440)).toBeCloseTo(100, 2);
    // One octave (1200 cents)
    expect(calculateCentDifference(880, 440)).toBeCloseTo(1200, 2);
  });

  it('generates sine tone with expected length and bounds', () => {
    const sampleRate = 44100;
    const duration = 0.5;
    const buffer = generateSineTone(440, duration, { sampleRate, amplitude: 0.8 });

    expect(buffer.length).toBe(Math.floor(sampleRate * duration));
    for (let i = 0; i < buffer.length; i++) {
      expect(Math.abs(buffer[i])).toBeLessThanOrEqual(0.80001);
    }
  });

  it('generates synthetic vocal with harmonics and smooth envelope', () => {
    const sampleRate = 44100;
    const duration = 0.2;
    const buffer = generateSyntheticVocal(440, duration, 5, 20, { sampleRate });

    expect(buffer.length).toBe(Math.floor(sampleRate * duration));
    // Check fade in (attack)
    expect(Math.abs(buffer[0])).toBeLessThan(0.01);
  });

  it('generates arpeggios with specified note durations and intervals', () => {
    const notes = [60, 64, 67, 72]; // C4, E4, G4, C5 (C Major)
    const { buffer, expectedNotes } = generateArpeggio(notes, 0.2, 0.05);

    expect(expectedNotes.length).toBe(4);
    expect(expectedNotes[0].midi).toBe(60);
    expect(expectedNotes[3].midi).toBe(72);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('encodes valid 16-bit PCM WAV header', () => {
    const samples = generateSineTone(440, 0.1, { sampleRate: 44100 });
    const wavBuffer = encodeWAV(samples, 44100);
    const view = new DataView(wavBuffer);

    // Check RIFF
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe('RIFF');

    // Check WAVE
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe('WAVE');

    // Check Sample Rate at offset 24
    expect(view.getUint32(24, true)).toBe(44100);
    // Check Bits per sample at offset 34
    expect(view.getUint16(34, true)).toBe(16);
  });
});
