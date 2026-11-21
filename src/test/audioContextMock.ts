/**
 * Mock AudioContext & AudioBuffer for Node.js / Vitest unit tests
 */

export class MockAudioBuffer {
  readonly length: number;
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  private channelData: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channelData = [];
    for (let i = 0; i < numberOfChannels; i++) {
      this.channelData.push(new Float32Array(length));
    }
  }

  getChannelData(channel: number): Float32Array {
    return (this.channelData[channel] || this.channelData[0]) as unknown as Float32Array;
  }

  copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset?: number): void {
    const src = this.getChannelData(channelNumber);
    const offset = bufferOffset || 0;
    destination.set(src.subarray(offset, offset + destination.length));
  }

  copyToChannel(source: Float32Array, channelNumber: number, bufferOffset?: number): void {
    const dest = this.getChannelData(channelNumber);
    const offset = bufferOffset || 0;
    dest.set(source, offset);
  }
}

export class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  state = 'running';

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate) as unknown as AudioBuffer;
  }

  decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve(new MockAudioBuffer(2, 44100, 44100) as unknown as AudioBuffer);
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }
}

// Polyfill global window and AudioContext if running in Node
if (typeof window === 'undefined' || !(window as unknown as { AudioContext?: unknown }).AudioContext) {
  const globalObj = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  (globalObj as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
  if (typeof window !== 'undefined') {
    (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
  }
}
