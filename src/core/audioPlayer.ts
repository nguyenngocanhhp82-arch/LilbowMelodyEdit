/**
 * Web Audio Player & Export Manager
 * Handles playback of original and pitch-corrected audio with playhead tracking and WAV export.
 */

import { encodeWAV } from '../test/audioTestUtils';
import { NoteBlob } from './noteSegmenter';
import { applyNotesPitchShift } from './pitchShifter';
import { getAudioContextClass } from './audioContextHelper';
import { mergeStems, exportAudioBufferToWav } from './stemMerger';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private originalBuffer: AudioBuffer | null = null;
  private processedBuffer: AudioBuffer | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;

  private startTime: number = 0; // AudioContext time when playback started
  private pauseOffset: number = 0; // Offset in seconds
  private isPlaying: boolean = false;
  private isWet: boolean = true; // true = play pitch shifted, false = dry original

  private instrumentalBuffer: AudioBuffer | null = null;
  private vocalOffsetSec: number = 0;
  private instSourceNode: AudioBufferSourceNode | null = null;
  private isPlayingMerged: boolean = false;

  // Cycle Loop state
  private isLooping: boolean = false;
  private loopStartSec: number = 0;
  private loopEndSec: number = 0;

  private onPlayheadCallbacks: Set<(currentTime: number) => void> = new Set();
  private animFrameId: number | null = null;

  constructor() {}

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = getAudioContextClass();
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Load audio file or raw buffer into the engine
   */
  async loadAudio(fileOrBuffer: File | ArrayBuffer | AudioBuffer): Promise<AudioBuffer> {
    const ctx = this.initContext();
    this.stop();

    if (fileOrBuffer instanceof AudioBuffer) {
      this.originalBuffer = fileOrBuffer;
    } else {
      let arrayBuffer: ArrayBuffer;
      if (fileOrBuffer instanceof File) {
        arrayBuffer = await fileOrBuffer.arrayBuffer();
      } else {
        arrayBuffer = fileOrBuffer;
      }
      this.originalBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    }

    // Initialize processed buffer with a clone
    this.processedBuffer = this.cloneBuffer(this.originalBuffer);
    this.pauseOffset = 0;
    return this.originalBuffer;
  }

  /**
   * Create an AudioBuffer from Float32Array mono samples
   */
  createBufferFromFloat32(samples: Float32Array, sampleRate: number = 44100): AudioBuffer {
    const ctx = this.initContext();
    const audioBuf = ctx.createBuffer(1, samples.length, sampleRate);
    audioBuf.getChannelData(0).set(samples);
    this.originalBuffer = audioBuf;
    this.processedBuffer = this.cloneBuffer(audioBuf);
    this.pauseOffset = 0;
    return audioBuf;
  }

  private cloneBuffer(src: AudioBuffer): AudioBuffer {
    const ctx = this.initContext();
    const clone = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) {
      clone.getChannelData(c).set(src.getChannelData(c));
    }
    return clone;
  }

  getChannelData(): Float32Array | null {
    if (!this.originalBuffer) return null;
    return this.originalBuffer.getChannelData(0);
  }

  getSampleRate(): number {
    return this.originalBuffer?.sampleRate ?? 44100;
  }

  getDuration(): number {
    return this.originalBuffer?.duration ?? 0;
  }

  /**
   * Re-render pitch-corrected buffer based on updated NoteBlobs
   */
  updatePitchEdits(notes: NoteBlob[]): void {
    if (!this.originalBuffer) return;

    const rawData = this.originalBuffer.getChannelData(0);
    const sampleRate = this.originalBuffer.sampleRate;

    // Apply pitch shifting
    const shiftedSamples = applyNotesPitchShift(rawData, notes, sampleRate);

    // Update processed buffer
    const ctx = this.initContext();
    const newBuf = ctx.createBuffer(1, shiftedSamples.length, sampleRate);
    newBuf.getChannelData(0).set(shiftedSamples);
    this.processedBuffer = newBuf;

    // If currently playing, seamlessly hot-swap source
    if (this.isPlaying && this.isWet) {
      const currentPos = this.getCurrentTime();
      this.stopSourceOnly();
      this.startSourceAt(currentPos);
    }
  }

  play(): void {
    if (this.isPlaying || !this.originalBuffer) return;
    this.initContext();
    this.isPlaying = true;
    this.startSourceAt(this.pauseOffset);
    this.startPlayheadTracking();
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this.isPlaying = false;
    this.stopSourceOnly();
    this.stopPlayheadTracking();
  }

  stop(): void {
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.stopSourceOnly();
    this.stopPlayheadTracking();
    this.notifyPlayhead(0);
  }

  seek(timeInSec: number): void {
    const duration = this.getDuration();
    const clamped = Math.max(0, Math.min(timeInSec, duration));
    this.pauseOffset = clamped;

    if (this.isPlaying) {
      this.stopSourceOnly();
      this.startSourceAt(clamped);
    } else {
      this.notifyPlayhead(clamped);
    }
  }

  setWetDry(isWet: boolean): void {
    if (this.isWet === isWet) return;
    this.isWet = isWet;
    if (this.isPlaying) {
      const pos = this.getCurrentTime();
      this.stopSourceOnly();
      this.startSourceAt(pos);
    }
  }

  getIsPlayingMerged(): boolean {
    return this.isPlayingMerged;
  }

  getIsWet(): boolean {
    return this.isWet;
  }

  getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) {
      return this.pauseOffset;
    }
    const elapsed = this.ctx.currentTime - this.startTime;
    const rawPos = this.pauseOffset + elapsed;

    // If loop is active, wrap around within loop boundaries
    if (this.isLooping && this.loopEndSec > this.loopStartSec) {
      const loopDuration = this.loopEndSec - this.loopStartSec;
      if (rawPos < this.loopStartSec) {
        return rawPos;
      }
      const posInLoop = ((rawPos - this.loopStartSec) % loopDuration + loopDuration) % loopDuration;
      return this.loopStartSec + posInLoop;
    }

    const duration = this.getDuration();
    if (duration > 0 && rawPos >= duration) {
      this.stop();
      return 0;
    }
    return rawPos;
  }

  setLoop(enabled: boolean, startSec?: number, endSec?: number): void {
    this.isLooping = enabled;
    if (startSec !== undefined) this.loopStartSec = Math.max(0, startSec);
    if (endSec !== undefined) this.loopEndSec = Math.max(this.loopStartSec + 0.1, endSec);

    // If currently playing, smoothly apply loop or restart within loop
    if (this.isPlaying) {
      const currentPos = this.getCurrentTime();
      this.stopSourceOnly();
      if (this.isPlayingMerged) {
        this.playWithBeat();
      } else {
        const targetPos =
          enabled && (currentPos < this.loopStartSec || currentPos >= this.loopEndSec)
            ? this.loopStartSec
            : currentPos;
        this.startSourceAt(targetPos);
      }
    }
  }

  getIsLooping(): boolean {
    return this.isLooping;
  }

  getLoopRange(): { start: number; end: number } {
    return { start: this.loopStartSec, end: this.loopEndSec };
  }

  private startSourceAt(offsetSec: number): void {
    if (!this.ctx) return;
    const bufToPlay = (this.isWet ? this.processedBuffer : this.originalBuffer) || this.originalBuffer;
    if (!bufToPlay) return;

    // Check if loop is enabled
    let actualOffset = offsetSec;
    if (this.isLooping && this.loopEndSec > this.loopStartSec) {
      if (actualOffset < this.loopStartSec || actualOffset >= this.loopEndSec) {
        actualOffset = this.loopStartSec;
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = bufToPlay;

    if (this.isLooping && this.loopEndSec > this.loopStartSec) {
      source.loop = true;
      source.loopStart = this.loopStartSec;
      source.loopEnd = this.loopEndSec;
    }

    source.connect(this.ctx.destination);

    source.onended = () => {
      if (!this.isLooping && this.isPlaying && this.getCurrentTime() >= this.getDuration() - 0.05) {
        this.stop();
      }
    };

    this.startTime = this.ctx.currentTime;
    this.pauseOffset = actualOffset;
    source.start(0, actualOffset);
    this.currentSourceNode = source;
  }

  private stopSourceOnly(): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.currentSourceNode = null;
    }
    if (this.instSourceNode) {
      try {
        this.instSourceNode.stop();
        this.instSourceNode.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.instSourceNode = null;
    }
    this.isPlayingMerged = false;
  }

  private startPlayheadTracking(): void {
    const loop = () => {
      if (this.isPlaying) {
        const t = this.getCurrentTime();
        this.notifyPlayhead(t);
        this.animFrameId = requestAnimationFrame(loop);
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopPlayheadTracking(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  onPlayhead(callback: (t: number) => void): () => void {
    this.onPlayheadCallbacks.add(callback);
    return () => this.onPlayheadCallbacks.delete(callback);
  }

  private notifyPlayhead(t: number): void {
    for (const cb of this.onPlayheadCallbacks) {
      cb(t);
    }
  }

  setInstrumentalTrack(buffer: AudioBuffer | null, offsetSec: number = 0): void {
    this.instrumentalBuffer = buffer;
    this.vocalOffsetSec = offsetSec;
  }

  getInstrumentalTrack(): AudioBuffer | null {
    return this.instrumentalBuffer;
  }

  getVocalOffsetSec(): number {
    return this.vocalOffsetSec;
  }

  playWithBeat(vocalVol: number = 1.0, instVol: number = 1.0): void {
    if (!this.instrumentalBuffer || !this.processedBuffer) {
      this.play();
      return;
    }
    const ctx = this.initContext();
    this.stop();

    // Setup master merged playback
    const vocalGainNode = ctx.createGain();
    vocalGainNode.gain.value = vocalVol;
    vocalGainNode.connect(ctx.destination);

    const instGainNode = ctx.createGain();
    instGainNode.gain.value = instVol;
    instGainNode.connect(ctx.destination);

    const instSource = ctx.createBufferSource();
    instSource.buffer = this.instrumentalBuffer;

    const vocalSource = ctx.createBufferSource();
    vocalSource.buffer = this.processedBuffer;

    if (this.isLooping && this.loopEndSec > this.loopStartSec) {
      instSource.loop = true;
      instSource.loopStart = this.loopStartSec;
      instSource.loopEnd = this.loopEndSec;

      vocalSource.loop = true;
      vocalSource.loopStart = this.loopStartSec;
      vocalSource.loopEnd = this.loopEndSec;
    }

    instSource.connect(instGainNode);
    vocalSource.connect(vocalGainNode);

    const now = ctx.currentTime;
    const offset = this.isLooping && this.loopEndSec > this.loopStartSec ? this.loopStartSec : 0;
    instSource.start(now, offset);
    vocalSource.start(now, offset + this.vocalOffsetSec);

    this.currentSourceNode = vocalSource;
    this.instSourceNode = instSource;
    this.isPlaying = true;
    this.isPlayingMerged = true;
    this.startTime = now;
    this.pauseOffset = offset;

    instSource.onended = () => {
      if (!this.isLooping) {
        this.stop();
      }
    };

    this.startPlayheadTracking();
  }

  stopMerged(): void {
    if (this.instSourceNode) {
      try {
        this.instSourceNode.stop();
        this.instSourceNode.disconnect();
      } catch {
        // ignore
      }
      this.instSourceNode = null;
    }
    this.isPlayingMerged = false;
    this.stop();
  }

  exportEditedStemWav(): Blob | null {
    return this.exportWav();
  }

  exportFullMergedMixWav(vocalVol: number = 1.0, instVol: number = 1.0): Blob | null {
    if (!this.instrumentalBuffer || !this.processedBuffer) {
      return this.exportWav();
    }
    const merged = mergeStems(this.instrumentalBuffer, this.processedBuffer, {
      vocalGain: vocalVol,
      instrumentalGain: instVol,
      offsetSec: this.vocalOffsetSec,
    });
    return exportAudioBufferToWav(merged);
  }

  /**
   * Export the pitch-corrected audio to a downloadable WAV Blob
   */
  exportWav(): Blob | null {
    if (!this.processedBuffer) return null;
    const channelData = this.processedBuffer.getChannelData(0);
    const wavArrayBuf = encodeWAV(channelData, this.processedBuffer.sampleRate);
    return new Blob([wavArrayBuf], { type: 'audio/wav' });
  }
}

export const audioEngine = new AudioEngine();
