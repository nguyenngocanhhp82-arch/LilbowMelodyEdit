/**
 * Browser Stem Separator Engine
 * Isolates Vocal stem and Instrumental (Backing track) from a full stereo or mono mix.
 * Guaranteed complementary reconstruction: Vocal + Instrumental === Original Mix.
 */

import { createCompatibleBuffer } from './audioContextHelper';

export interface SeparatedStems {
  vocal: AudioBuffer;
  instrumental: AudioBuffer;
  duration: number;
  sampleRate: number;
}

export interface StemProgressCallback {
  (progress: number, stage: string): void;
}

/**
 * 2nd-order IIR Biquad Bandpass filter for Vocal Formant isolation (120 Hz - 7500 Hz)
 */
class BiquadFilter {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: 'bandpass' | 'highpass' | 'lowpass', freq: number, q: number, sampleRate: number) {
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);

    let a0 = 1;
    if (type === 'bandpass') {
      this.b0 = alpha;
      this.b1 = 0;
      this.b2 = -alpha;
      a0 = 1 + alpha;
      this.a1 = -2 * cosw0;
      this.a2 = 1 - alpha;
    } else if (type === 'highpass') {
      this.b0 = (1 + cosw0) / 2;
      this.b1 = -(1 + cosw0);
      this.b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha;
      this.a1 = -2 * cosw0;
      this.a2 = 1 - alpha;
    } else if (type === 'lowpass') {
      this.b0 = (1 - cosw0) / 2;
      this.b1 = 1 - cosw0;
      this.b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha;
      this.a1 = -2 * cosw0;
      this.a2 = 1 - alpha;
    }

    this.b0 /= a0;
    this.b1 /= a0;
    this.b2 /= a0;
    this.a1 /= a0;
    this.a2 /= a0;
  }

  process(sample: number): number {
    const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/**
 * Separate full audio mix into Vocal and Instrumental stems.
 */
export async function separateStems(
  sourceBuffer: AudioBuffer,
  onProgress?: StemProgressCallback
): Promise<SeparatedStems> {
  const sampleRate = sourceBuffer.sampleRate;
  const length = sourceBuffer.length;
  const numChannels = sourceBuffer.numberOfChannels;

  const vocalBuffer = createCompatibleBuffer(numChannels, length, sampleRate);
  const instrumentalBuffer = createCompatibleBuffer(numChannels, length, sampleRate);

  const leftChannel = sourceBuffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? sourceBuffer.getChannelData(1) : leftChannel;

  const vocalL = vocalBuffer.getChannelData(0);
  const vocalR = numChannels > 1 ? vocalBuffer.getChannelData(1) : vocalL;

  const instL = instrumentalBuffer.getChannelData(0);
  const instR = numChannels > 1 ? instrumentalBuffer.getChannelData(1) : instL;

  onProgress?.(10, 'Phân tích trường âm thanh stereo & Mid/Side...');

  // Filters to isolate vocal presence band (human voice formant 120Hz to 7500Hz)
  const hpFilterL = new BiquadFilter('highpass', 120, 0.707, sampleRate);
  const lpFilterL = new BiquadFilter('lowpass', 7500, 0.707, sampleRate);
  const hpFilterR = new BiquadFilter('highpass', 120, 0.707, sampleRate);
  const lpFilterR = new BiquadFilter('lowpass', 7500, 0.707, sampleRate);

  const chunkSize = 32768;
  const totalChunks = Math.ceil(length / chunkSize);

  for (let c = 0; c < totalChunks; c++) {
    const start = c * chunkSize;
    const end = Math.min(length, start + chunkSize);

    for (let i = start; i < end; i++) {
      const l = leftChannel[i];
      const r = rightChannel[i];

      // Mid / Side decomposition
      const mid = 0.5 * (l + r);
      const side = 0.5 * (l - r);

      // Center-Channel Extraction:
      // Lead vocal is predominantly centered (high mid energy relative to side)
      const sideMag = Math.abs(side);
      const midMag = Math.abs(mid);

      // Center weighting factor (0 = pure wide stereo, 1 = dead center vocal)
      let centerWeight = midMag > 1e-4 ? Math.max(0, 1 - (1.6 * sideMag) / midMag) : 0;
      centerWeight = Math.min(1, Math.max(0, centerWeight));

      // Extract raw vocal component
      let rawVocal = mid * centerWeight;

      // Filter vocal to voice formant band (120Hz - 7.5kHz)
      const vocalFilteredL = lpFilterL.process(hpFilterL.process(rawVocal));
      const vocalFilteredR = lpFilterR.process(hpFilterR.process(rawVocal));

      // Ensure vocal doesn't exceed original channel energy
      const boundedVocalL = Math.sign(vocalFilteredL) * Math.min(Math.abs(vocalFilteredL), Math.abs(l));
      const boundedVocalR = Math.sign(vocalFilteredR) * Math.min(Math.abs(vocalFilteredR), Math.abs(r));

      vocalL[i] = boundedVocalL;
      if (numChannels > 1) {
        vocalR[i] = boundedVocalR;
      }

      // Instrumental is exact subtraction: Instrumental = Mix - Vocal
      instL[i] = l - boundedVocalL;
      if (numChannels > 1) {
        instR[i] = r - boundedVocalR;
      }
    }

    if (c % 10 === 0 || c === totalChunks - 1) {
      const progress = 10 + Math.round((c / totalChunks) * 85);
      onProgress?.(progress, `Đang tách Vocal & Instrumental (${progress}%)...`);
    }
  }

  onProgress?.(100, 'Tách Stem hoàn tất!');

  return {
    vocal: vocalBuffer,
    instrumental: instrumentalBuffer,
    duration: sourceBuffer.duration,
    sampleRate,
  };
}
