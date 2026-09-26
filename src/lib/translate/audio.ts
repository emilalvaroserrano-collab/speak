export const SEND_SAMPLE_RATE = 16000;
export const RECEIVE_SAMPLE_RATE = 24000;

export function downsample(
  input: Float32Array,
  inRate: number,
  outRate: number,
): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcIndex = i * ratio;
    const index = Math.floor(srcIndex);
    const frac = srcIndex - index;
    const a = input[index] ?? 0;
    const b = input[index + 1] ?? a;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

export function floatTo16BitPcm(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

export class PcmPlayer {
  private context: AudioContext;
  private gain: GainNode;
  private nextTime = 0;
  private sampleRate: number;

  constructor(sampleRate = RECEIVE_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.context = new AudioContext({ sampleRate });
    this.gain = this.context.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.context.destination);
  }

  setMuted(muted: boolean) {
    this.gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02);
  }

  async resume() {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  playBase64(base64: string) {
    const pcm = base64ToArrayBuffer(base64);
    const frames = Math.floor(pcm.byteLength / 2);
    if (frames === 0) return;
    const buffer = this.context.createBuffer(1, frames, this.sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(pcm);
    for (let i = 0; i < frames; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 0x8000;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    const startAt = Math.max(this.context.currentTime, this.nextTime);
    source.start(startAt);
    this.nextTime = startAt + buffer.duration;
  }

  flush() {
    this.nextTime = this.context.currentTime;
  }

  async close() {
    this.flush();
    await this.context.close().catch(() => undefined);
  }
}

const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      this.port.postMessage(channel);
    }
    return true;
  }
}
registerProcessor("relay-capture", CaptureProcessor);
`;

export async function createCaptureNode(
  context: AudioContext,
  onFrame: (frame: Float32Array) => void,
): Promise<AudioWorkletNode> {
  const blob = new Blob([WORKLET_SOURCE], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
  } catch {
    // Processor may already be registered on this origin.
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(context, "relay-capture");
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    onFrame(event.data);
  };
  return node;
}
