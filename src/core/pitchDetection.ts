/**
 * YIN Pitch Detection Algorithm
 * High-accuracy fundamental frequency (F0) estimator optimized for monophonic vocal and musical audio.
 * Ref: De Cheveigné, A., & Kawahara, H. (2002). YIN, a fundamental frequency estimator for speech and music.
 */

export interface PitchFrame {
  time: number; // in seconds
  frequency: number; // in Hz (0 if unvoiced/silent)
  midi: number; // MIDI pitch number (continuous, e.g. 69.2)
  confidence: number; // 0..1 (1 - normalized difference)
  rms: number; // energy amplitude
  isVoiced: boolean;
}

export interface YinConfig {
  sampleRate?: number;
  bufferSize?: number; // frame size (e.g. 2048)
  hopSize?: number; // step size (e.g. 512 = ~11.6ms at 44.1kHz)
  threshold?: number; // YIN threshold (default 0.15)
  minFreq?: number; // Min vocal frequency (e.g. 60Hz)
  maxFreq?: number; // Max vocal frequency (e.g. 1200Hz)
  rmsSilenceThreshold?: number; // Silence floor (default 0.01)
}

/**
 * Perform single-frame YIN pitch detection on a sample buffer
 */
export function detectPitchYinFrame(
  buffer: Float32Array,
  config: YinConfig = {}
): { frequency: number; confidence: number; rms: number } {
  const sampleRate = config.sampleRate ?? 44100;
  const threshold = config.threshold ?? 0.15;
  const minFreq = config.minFreq ?? 65; // ~C2
  const maxFreq = config.maxFreq ?? 1100; // ~C6
  const rmsSilenceThreshold = config.rmsSilenceThreshold ?? 0.01;

  const halfBufferSize = Math.floor(buffer.length / 2);
  const minPeriod = Math.floor(sampleRate / maxFreq);
  const maxPeriod = Math.min(halfBufferSize, Math.floor(sampleRate / minFreq));

  // Step 0: RMS Energy check to quickly reject silence
  let energySum = 0;
  for (let i = 0; i < buffer.length; i++) {
    energySum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(energySum / buffer.length);
  if (rms < rmsSilenceThreshold) {
    return { frequency: 0, confidence: 0, rms };
  }

  // Step 1: Difference Function d_t(tau)
  const diff = new Float32Array(maxPeriod);
  for (let tau = 0; tau < maxPeriod; tau++) {
    let sum = 0;
    for (let j = 0; j < halfBufferSize; j++) {
      const delta = buffer[j] - buffer[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 2: Cumulative Mean Normalized Difference Function
  const cmndf = new Float32Array(maxPeriod);
  cmndf[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau < maxPeriod; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = runningSum === 0 ? 1 : (diff[tau] * tau) / runningSum;
  }

  // Step 3: Absolute Thresholding
  let tauEstimate = -1;
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    if (cmndf[tau] < threshold) {
      // Find local minimum
      while (tau + 1 < maxPeriod && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  // If no minimum under threshold, pick global minimum in range
  if (tauEstimate === -1) {
    let minVal = Infinity;
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (cmndf[tau] < minVal) {
        minVal = cmndf[tau];
        tauEstimate = tau;
      }
    }
    // If the global minimum isn't strong enough, classify as unvoiced
    if (minVal > 0.4) {
      return { frequency: 0, confidence: Math.max(0, 1 - minVal), rms };
    }
  }

  // Step 4: Parabolic Interpolation for sub-sample accuracy
  let betterTau = tauEstimate;
  if (tauEstimate > 0 && tauEstimate < maxPeriod - 1) {
    const s0 = cmndf[tauEstimate - 1];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[tauEstimate + 1];
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denominator) > 1e-6) {
      const delta = (s2 - s0) / denominator;
      betterTau = tauEstimate + delta;
    }
  }

  const frequency = sampleRate / betterTau;
  const confidence = Math.max(0, Math.min(1, 1 - cmndf[tauEstimate]));

  if (frequency < minFreq || frequency > maxFreq) {
    return { frequency: 0, confidence: 0, rms };
  }

  return { frequency, confidence, rms };
}

/**
 * Scan an entire audio buffer and extract continuous pitch contour frames
 */
export function analyzeAudioBuffer(
  audioBuffer: Float32Array,
  config: YinConfig = {}
): PitchFrame[] {
  const sampleRate = config.sampleRate ?? 44100;
  const bufferSize = config.bufferSize ?? 2048;
  const hopSize = config.hopSize ?? 512;
  const frames: PitchFrame[] = [];

  const totalSamples = audioBuffer.length;
  for (let offset = 0; offset + bufferSize <= totalSamples; offset += hopSize) {
    const frameData = audioBuffer.subarray(offset, offset + bufferSize);
    const { frequency, confidence, rms } = detectPitchYinFrame(frameData, {
      ...config,
      sampleRate,
    });

    const time = (offset + bufferSize / 2) / sampleRate;
    const midi = frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : 0;
    const isVoiced = frequency > 0 && confidence >= 0.65;

    frames.push({
      time,
      frequency: isVoiced ? frequency : 0,
      midi: isVoiced ? midi : 0,
      confidence,
      rms,
      isVoiced,
    });
  }

  return frames;
}
