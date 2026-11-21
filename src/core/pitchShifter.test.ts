import { describe, it, expect } from 'vitest';
import { pitchShiftBuffer, applyNotesPitchShift } from './pitchShifter';
import { detectPitchYinFrame } from './pitchDetection';
import { generateSineTone, midiToFreq, calculateCentDifference } from '../test/audioTestUtils';
import { NoteBlob } from './noteSegmenter';

describe('Pitch Shifter Engine', () => {
  const sampleRate = 44100;

  it('preserves buffer length when pitch shifting', () => {
    const input = generateSineTone(440, 0.4, { sampleRate });
    const shiftedUp = pitchShiftBuffer(input, 3, { sampleRate });
    const shiftedDown = pitchShiftBuffer(input, -3, { sampleRate });

    expect(shiftedUp.length).toBe(input.length);
    expect(shiftedDown.length).toBe(input.length);
  });

  it('preserves exact signal when shift is 0 semitones', () => {
    const input = generateSineTone(440, 0.2, { sampleRate });
    const unchanged = pitchShiftBuffer(input, 0, { sampleRate });

    expect(unchanged.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(unchanged[i]).toBe(input[i]);
    }
  });

  it('shifts A4 (440 Hz) up by +2 semitones to B4 (~493.88 Hz)', () => {
    const input = generateSineTone(440, 0.5, { sampleRate });
    const shifted = pitchShiftBuffer(input, 2, { sampleRate });

    // Detect pitch of shifted signal in the middle
    const frameSize = 2048;
    const midPoint = Math.floor(shifted.length / 2);
    const frame = shifted.subarray(midPoint, midPoint + frameSize);
    const detected = detectPitchYinFrame(frame, { sampleRate });

    const expectedFreq = midiToFreq(69 + 2); // B4: ~493.88 Hz
    expect(detected.frequency).toBeGreaterThan(0);

    const centDiff = Math.abs(calculateCentDifference(detected.frequency, expectedFreq));
    expect(centDiff).toBeLessThan(25); // Close match
  });

  it('shifts A4 (440 Hz) down by -2 semitones to G4 (~392.00 Hz)', () => {
    const input = generateSineTone(440, 0.5, { sampleRate });
    const shifted = pitchShiftBuffer(input, -2, { sampleRate });

    const frameSize = 2048;
    const midPoint = Math.floor(shifted.length / 2);
    const frame = shifted.subarray(midPoint, midPoint + frameSize);
    const detected = detectPitchYinFrame(frame, { sampleRate });

    const expectedFreq = midiToFreq(69 - 2); // G4: ~392.00 Hz
    expect(detected.frequency).toBeGreaterThan(0);

    const centDiff = Math.abs(calculateCentDifference(detected.frequency, expectedFreq));
    expect(centDiff).toBeLessThan(25);
  });

  it('applies pitch shifts selectively per NoteBlob with applyNotesPitchShift', () => {
    const duration = 1.0;
    const input = generateSineTone(440, duration, { sampleRate }); // 1 second A4
    const note: NoteBlob = {
      id: 'note_test',
      startTime: 0.2,
      endTime: 0.7,
      duration: 0.5,
      originalMidi: 69,
      roundedMidi: 69,
      targetMidi: 71, // Shift +2 semitones
      pitchShiftSemitones: 2,
      confidence: 0.99,
      pitchContour: [],
      vibratoDepth: 0,
    };

    const output = applyNotesPitchShift(input, [note], sampleRate);
    expect(output.length).toBe(input.length);

    // Before note (0.05s) should be untouched A4 (440 Hz)
    const beforeFrame = output.subarray(Math.floor(0.05 * sampleRate), Math.floor(0.05 * sampleRate) + 2048);
    const detectedBefore = detectPitchYinFrame(beforeFrame, { sampleRate });
    expect(Math.abs(calculateCentDifference(detectedBefore.frequency, 440))).toBeLessThan(10);

    // Inside note (0.45s) should be shifted B4 (~493.88 Hz)
    const insideFrame = output.subarray(Math.floor(0.45 * sampleRate), Math.floor(0.45 * sampleRate) + 2048);
    const detectedInside = detectPitchYinFrame(insideFrame, { sampleRate });
    expect(Math.abs(calculateCentDifference(detectedInside.frequency, 493.88))).toBeLessThan(25);
  });
});
