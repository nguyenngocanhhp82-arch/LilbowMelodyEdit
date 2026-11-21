/**
 * Safe AudioContext accessor supporting both Browser and Node/Testing environments
 */

export function getAudioContextClass(): typeof AudioContext {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return w.AudioContext || w.webkitAudioContext || (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext;
  }
  return (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext;
}

export function createCompatibleBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number
): AudioBuffer {
  const AudioCtxClass = getAudioContextClass();
  const ctx = new AudioCtxClass();
  return ctx.createBuffer(numberOfChannels, length, sampleRate);
}
