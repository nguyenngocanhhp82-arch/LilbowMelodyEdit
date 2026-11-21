import { PitchFrame } from './pitchDetection';

export interface NoteBlob {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  duration: number; // in seconds
  originalMidi: number; // detected continuous pitch (e.g. 60.2)
  roundedMidi: number; // closest whole semitone (e.g. 60)
  targetMidi: number; // user-adjusted or snapped pitch
  pitchShiftSemitones: number; // targetMidi - originalMidi
  confidence: number;
  pitchContour: { time: number; midi: number; centOffset: number }[];
  vibratoDepth: number; // peak-to-peak cents
  isSelected?: boolean;
}

export interface SegmentationOptions {
  minNoteDurationSec?: number; // Minimum note length to avoid transients (e.g. 0.08s)
  maxPitchJumpSemitones?: number; // Jump threshold to split notes (e.g. 1.2 semitones)
  maxSilenceGapSec?: number; // Max silence gap before splitting note (e.g. 0.06s)
}

/**
 * Segments continuous pitch frames into musical NoteBlobs (Melodyne-style)
 */
export function segmentNotes(
  frames: PitchFrame[],
  options: SegmentationOptions = {}
): NoteBlob[] {
  const minNoteDuration = options.minNoteDurationSec ?? 0.08;
  const maxPitchJump = options.maxPitchJumpSemitones ?? 1.2;
  const maxSilenceGap = options.maxSilenceGapSec ?? 0.06;

  const notes: NoteBlob[] = [];
  let currentFrames: PitchFrame[] = [];
  let silenceDuration = 0;
  let lastVoicedTime = 0;

  function finalizeCurrentNote() {
    if (currentFrames.length === 0) return;

    const startTime = currentFrames[0].time;
    const endTime = currentFrames[currentFrames.length - 1].time;
    const duration = endTime - startTime;

    if (duration >= minNoteDuration) {
      // Calculate weighted average pitch by confidence
      let weightedMidiSum = 0;
      let totalWeight = 0;
      let totalConfidence = 0;

      for (const f of currentFrames) {
        const weight = f.confidence * f.rms;
        weightedMidiSum += f.midi * weight;
        totalWeight += weight;
        totalConfidence += f.confidence;
      }

      const originalMidi = totalWeight > 0 ? weightedMidiSum / totalWeight : currentFrames[0].midi;
      const roundedMidi = Math.round(originalMidi);

      // Extract pitch contour and calculate vibrato depth
      let minMidi = Infinity;
      let maxMidi = -Infinity;
      const pitchContour = currentFrames.map((f) => {
        if (f.midi < minMidi) minMidi = f.midi;
        if (f.midi > maxMidi) maxMidi = f.midi;
        return {
          time: f.time,
          midi: f.midi,
          centOffset: (f.midi - originalMidi) * 100,
        };
      });

      const vibratoDepth = Math.max(0, (maxMidi - minMidi) * 100);

      notes.push({
        id: `note_${notes.length}_${Math.round(startTime * 1000)}`,
        startTime,
        endTime,
        duration,
        originalMidi,
        roundedMidi,
        targetMidi: roundedMidi,
        pitchShiftSemitones: roundedMidi - originalMidi,
        confidence: totalConfidence / currentFrames.length,
        pitchContour,
        vibratoDepth,
        isSelected: false,
      });
    }

    currentFrames = [];
    silenceDuration = 0;
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    if (!frame.isVoiced) {
      if (currentFrames.length > 0) {
        silenceDuration += (frame.time - (lastVoicedTime || frame.time));
        lastVoicedTime = frame.time;
        if (silenceDuration > maxSilenceGap) {
          finalizeCurrentNote();
        }
      }
      continue;
    }

    // Frame is voiced
    silenceDuration = 0;
    lastVoicedTime = frame.time;

    if (currentFrames.length === 0) {
      currentFrames.push(frame);
    } else {
      const prevFrame = currentFrames[currentFrames.length - 1];
      const pitchJump = Math.abs(frame.midi - prevFrame.midi);

      // If pitch changes suddenly (e.g. singing next note in melody without silence)
      if (pitchJump > maxPitchJump) {
        finalizeCurrentNote();
      }
      currentFrames.push(frame);
    }
  }

  finalizeCurrentNote();
  return notes;
}
