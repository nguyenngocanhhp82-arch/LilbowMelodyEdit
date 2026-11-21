import { describe, it, expect } from 'vitest';
import {
  isNoteInScale,
  snapMidiToScale,
  stepNoteInScale,
  detectKey,
  midiToNoteName,
  getPitchClass,
  noteNameToPitchClass,
} from './scaleEngine';

describe('Scale Engine', () => {
  it('correctly maps MIDI notes to Note names and pitch classes', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(71)).toBe('B4');
    expect(midiToNoteName(72)).toBe('C5');
    expect(getPitchClass(60)).toBe(0); // C
    expect(getPitchClass(69)).toBe(9); // A
    expect(noteNameToPitchClass('C')).toBe(0);
    expect(noteNameToPitchClass('G#')).toBe(8);
  });

  describe('isNoteInScale', () => {
    it('accurately tests notes in C Major scale', () => {
      const rootC = 0;
      // C, D, E, F, G, A, B are in C Major
      expect(isNoteInScale(60, rootC, 'major')).toBe(true); // C4
      expect(isNoteInScale(62, rootC, 'major')).toBe(true); // D4
      expect(isNoteInScale(64, rootC, 'major')).toBe(true); // E4
      expect(isNoteInScale(65, rootC, 'major')).toBe(true); // F4
      expect(isNoteInScale(67, rootC, 'major')).toBe(true); // G4
      expect(isNoteInScale(69, rootC, 'major')).toBe(true); // A4
      expect(isNoteInScale(71, rootC, 'major')).toBe(true); // B4

      // C#, D#, F#, G#, A# are NOT in C Major
      expect(isNoteInScale(61, rootC, 'major')).toBe(false); // C#4
      expect(isNoteInScale(63, rootC, 'major')).toBe(false); // D#4
      expect(isNoteInScale(66, rootC, 'major')).toBe(false); // F#4
      expect(isNoteInScale(68, rootC, 'major')).toBe(false); // G#4
      expect(isNoteInScale(70, rootC, 'major')).toBe(false); // A#4
    });

    it('accurately tests notes in A Minor scale', () => {
      const rootA = 9;
      // A Minor natural has the same pitch classes as C Major
      expect(isNoteInScale(69, rootA, 'natural_minor')).toBe(true); // A4
      expect(isNoteInScale(71, rootA, 'natural_minor')).toBe(true); // B4
      expect(isNoteInScale(72, rootA, 'natural_minor')).toBe(true); // C5
      expect(isNoteInScale(70, rootA, 'natural_minor')).toBe(false); // A#4
    });
  });

  describe('snapMidiToScale', () => {
    it('snaps out-of-scale notes to the closest valid in-scale note', () => {
      const rootC = 0;
      // In C Major:
      // 61.2 (slightly sharp C#4) -> should snap to 62 (D4, diff +0.8) or 60 (C4, diff -1.2) -> 62
      const snapUp = snapMidiToScale(61.2, rootC, 'major');
      expect(snapUp.targetMidi).toBe(62);
      expect(snapUp.shiftSemitones).toBeCloseTo(0.8, 2);

      // 60.8 (slightly flat C#4) -> should snap to 60 (C4, diff -0.8)
      const snapDown = snapMidiToScale(60.8, rootC, 'major');
      expect(snapDown.targetMidi).toBe(60);
      expect(snapDown.shiftSemitones).toBeCloseTo(-0.8, 2);

      // F#4 (66) in C Major:
      // Can snap to F4 (65) or G4 (67)
      const snapFSharp = snapMidiToScale(66.1, rootC, 'major');
      expect(snapFSharp.targetMidi).toBe(67); // closer to G4

      // In-scale note: E4 (64.05) with 5 cents detune -> snaps to 64
      const inScaleSnap = snapMidiToScale(64.05, rootC, 'major');
      expect(inScaleSnap.targetMidi).toBe(64);
      expect(inScaleSnap.shiftSemitones).toBeCloseTo(-0.05, 2);
    });

    it('supports floor and ceil snapping modes', () => {
      const rootC = 0;
      // C#4 (61) with ceil -> D4 (62)
      const ceilSnap = snapMidiToScale(61, rootC, 'major', 'ceil');
      expect(ceilSnap.targetMidi).toBe(62);

      // C#4 (61) with floor -> C4 (60)
      const floorSnap = snapMidiToScale(61, rootC, 'major', 'floor');
      expect(floorSnap.targetMidi).toBe(60);
    });
  });

  describe('stepNoteInScale', () => {
    it('steps notes strictly through scale degrees', () => {
      const rootC = 0;
      // C4 (60) -> step +1 -> D4 (62) -> step +1 -> E4 (64) -> step +1 -> F4 (65)
      expect(stepNoteInScale(60, 1, rootC, 'major')).toBe(62);
      expect(stepNoteInScale(62, 1, rootC, 'major')).toBe(64);
      expect(stepNoteInScale(64, 1, rootC, 'major')).toBe(65); // half step between E and F!
      expect(stepNoteInScale(65, 1, rootC, 'major')).toBe(67); // G4

      // Step backwards: F4 (65) -> step -1 -> E4 (64)
      expect(stepNoteInScale(65, -1, rootC, 'major')).toBe(64);
      expect(stepNoteInScale(64, -1, rootC, 'major')).toBe(62);
    });
  });

  describe('detectKey (Krumhansl-Schmuckler)', () => {
    it('accurately identifies C Major from C Major diatonic melodies', () => {
      // Notes from C Major: C4, E4, G4, C5, D4, F4, G4, B4, C5
      const cMajorMelody = [60, 64, 67, 72, 62, 65, 67, 71, 72, 60, 64, 67];
      const result = detectKey(cMajorMelody);
      expect(result.rootName).toBe('C');
      expect(result.scaleType).toBe('major');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('accurately identifies A Minor from A Minor melodies', () => {
      // Notes from A Minor: A3, C4, E4, A4, B4, D4, E4
      const aMinorMelody = [57, 60, 64, 69, 71, 62, 64, 69, 57];
      const result = detectKey(aMinorMelody);
      expect(result.rootName).toBe('A');
      expect(result.scaleType).toBe('natural_minor');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });
});
