/**
 * Scale and Key Engine
 * Manages musical scales, note quantization, scale snapping, and key detection.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = typeof NOTE_NAMES[number];

export type ScaleType =
  | 'chromatic'
  | 'major'
  | 'natural_minor'
  | 'harmonic_minor'
  | 'melodic_minor'
  | 'pentatonic_major'
  | 'pentatonic_minor'
  | 'blues'
  | 'dorian'
  | 'mixolydian';

export interface ScaleDefinition {
  name: string;
  type: ScaleType;
  intervals: number[]; // semitone offsets from root [0, 2, 4, ...]
}

export const SCALES: Record<ScaleType, ScaleDefinition> = {
  chromatic: {
    name: 'Chromatic',
    type: 'chromatic',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  major: {
    name: 'Major (Ionian)',
    type: 'major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  natural_minor: {
    name: 'Natural Minor (Aeolian)',
    type: 'natural_minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  harmonic_minor: {
    name: 'Harmonic Minor',
    type: 'harmonic_minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  melodic_minor: {
    name: 'Melodic Minor',
    type: 'melodic_minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
  },
  pentatonic_major: {
    name: 'Major Pentatonic',
    type: 'pentatonic_major',
    intervals: [0, 2, 4, 7, 9],
  },
  pentatonic_minor: {
    name: 'Minor Pentatonic',
    type: 'pentatonic_minor',
    intervals: [0, 3, 5, 7, 10],
  },
  blues: {
    name: 'Blues',
    type: 'blues',
    intervals: [0, 3, 5, 6, 7, 10],
  },
  dorian: {
    name: 'Dorian',
    type: 'dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  mixolydian: {
    name: 'Mixolydian',
    type: 'mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
};

/** Get pitch class (0..11) from MIDI note */
export function getPitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** Get Note Name and Octave from MIDI note (e.g. 60 -> "C4") */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const pitchClass = getPitchClass(rounded);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

/** Convert note name (e.g. "C" or "C4") to pitch class or MIDI */
export function noteNameToPitchClass(name: string): number {
  const cleanName = name.replace(/[0-9-]/g, '').toUpperCase();
  const idx = NOTE_NAMES.indexOf(cleanName as NoteName);
  return idx >= 0 ? idx : 0;
}

/**
 * Checks whether a MIDI note belongs to a given Scale
 */
export function isNoteInScale(midi: number, rootPitchClass: number, scaleType: ScaleType): boolean {
  if (scaleType === 'chromatic') return true;
  const intervals = SCALES[scaleType].intervals;
  const pc = getPitchClass(midi);
  const relativeInterval = (pc - rootPitchClass + 12) % 12;
  return intervals.includes(relativeInterval);
}

/**
 * Quantize/Snap a MIDI note to the nearest valid note in the selected Scale.
 * Supports continuous MIDI pitch values (e.g., 61.3 cents) and returns exact target MIDI note.
 */
export function snapMidiToScale(
  midi: number,
  rootPitchClass: number,
  scaleType: ScaleType,
  mode: 'closest' | 'floor' | 'ceil' = 'closest'
): { targetMidi: number; shiftSemitones: number; shiftCents: number } {
  if (scaleType === 'chromatic') {
    const targetMidi = Math.round(midi);
    const shiftSemitones = targetMidi - midi;
    return {
      targetMidi,
      shiftSemitones,
      shiftCents: shiftSemitones * 100,
    };
  }

  const intervals = SCALES[scaleType].intervals;
  // Check candidate MIDI notes within +/- 6 semitones
  const baseRounded = Math.round(midi);
  let bestMidi = baseRounded;
  let minDiff = Infinity;

  // Search in a window of candidate semitones
  for (let offset = -12; offset <= 12; offset++) {
    const candidate = baseRounded + offset;
    const pc = getPitchClass(candidate);
    const rel = (pc - rootPitchClass + 12) % 12;

    if (intervals.includes(rel)) {
      const diff = candidate - midi;

      if (mode === 'floor' && diff > 0.001) continue;
      if (mode === 'ceil' && diff < -0.001) continue;

      if (Math.abs(diff) < minDiff) {
        minDiff = Math.abs(diff);
        bestMidi = candidate;
      }
    }
  }

  const shiftSemitones = bestMidi - midi;
  return {
    targetMidi: bestMidi,
    shiftSemitones,
    shiftCents: shiftSemitones * 100,
  };
}

/**
 * Step a note up or down strictly within the scale.
 * If current note is in scale, moves to next/prev degree.
 * If current note is outside scale, snaps to next/prev in scale.
 */
export function stepNoteInScale(
  currentMidi: number,
  steps: number, // +1 for next scale degree, -1 for previous scale degree
  rootPitchClass: number,
  scaleType: ScaleType
): number {
  if (steps === 0) return currentMidi;
  const direction = steps > 0 ? 1 : -1;
  const numSteps = Math.abs(steps);
  let note = Math.round(currentMidi);

  for (let s = 0; s < numSteps; s++) {
    do {
      note += direction;
    } while (!isNoteInScale(note, rootPitchClass, scaleType));
  }
  return note;
}

/**
 * Krumhansl-Schmuckler Key-Finding Algorithm
 * Standard perceptual weights for Major and Minor keys.
 */
const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Detect most probable Key (Root + Scale) from a set of detected MIDI notes or pitch classes.
 */
export function detectKey(pitchClassesOrMidis: number[]): {
  rootPitchClass: number;
  rootName: NoteName;
  scaleType: 'major' | 'natural_minor';
  confidence: number;
} {
  // Build 12-dimensional pitch class histogram
  const histogram = new Array(12).fill(0);
  for (const val of pitchClassesOrMidis) {
    const pc = getPitchClass(val);
    histogram[pc] += 1;
  }

  let bestCorr = -Infinity;
  let bestRoot = 0;
  let bestType: 'major' | 'natural_minor' = 'major';

  for (let root = 0; root < 12; root++) {
    // Rotate profile to root
    const majorRotated = new Array(12);
    const minorRotated = new Array(12);
    for (let i = 0; i < 12; i++) {
      majorRotated[(i + root) % 12] = KS_MAJOR_PROFILE[i];
      minorRotated[(i + root) % 12] = KS_MINOR_PROFILE[i];
    }

    const corrMajor = pearsonCorrelation(histogram, majorRotated);
    if (corrMajor > bestCorr) {
      bestCorr = corrMajor;
      bestRoot = root;
      bestType = 'major';
    }

    const corrMinor = pearsonCorrelation(histogram, minorRotated);
    if (corrMinor > bestCorr) {
      bestCorr = corrMinor;
      bestRoot = root;
      bestType = 'natural_minor';
    }
  }

  return {
    rootPitchClass: bestRoot,
    rootName: NOTE_NAMES[bestRoot],
    scaleType: bestType,
    confidence: Math.max(0, Math.min(1, (bestCorr + 1) / 2)),
  };
}
