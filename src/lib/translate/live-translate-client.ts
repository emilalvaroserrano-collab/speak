import type { TranslateSessionPayload } from "@/lib/translate/translate-types";
import {
  arrayBufferToBase64,
  createCaptureNode,
  downsample,
  floatTo16BitPcm,
  PcmPlayer,
  rms,
  SEND_SAMPLE_RATE,
} from "@/lib/translate/audio";

export type TranslateStatus = "idle" | "connecting" | "live" | "error";

export type TranscriptLine = {
  id: string;
  role: "source" | "translation";
  text: string;
  language?: string;
};

export type LiveTranslateListeners = {
  onStatus: (status: TranslateStatus) => void;
  onError: (message: string) => void;
  onInputLevel: (level: number) => void;
  onTranscripts: (lines: TranscriptLine[]) => void;
};

type GeminiContent = {
  setupComplete?: unknown;
  error?: { message?: string; status?: string; code?: number };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string; languageCode?: string; finished?: boolean };
    outputTranscription?: { text?: string; languageCode?: string; finished?: boolean };
    modelTurn?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
        text?: string;
      }>;
    };
  };
};

function websocketUrl(session: TranslateSessionPayload): string {
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(session.token)}`;
}

function setupMessage(session: TranslateSessionPayload) {
  return {
    setup: {
      model: `models/${session.model}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        translationConfig: {
          targetLanguageCode: session.targetLanguage,
          echoTargetLanguage: true,
        },
      },
    },
  };
}

function humanizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Microphone or screen access is needed to translate.";
  }
  if (lower.includes("unknown name") || lower.includes("invalid json payload")) {
    return "The translator rejected this session. Try starting again.";
  }
  if (message.length > 180) {
    return `${message.slice(0, 177).trim()}…`;
  }
  return message;
}

let transcriptSeq = 0;

function nextId(): string {
  transcriptSeq += 1;
  return `line-${transcriptSeq}`;
}

export class LiveTranslateClient {
  private listeners: LiveTranslateListeners;
  private socket: WebSocket | null = null;
  private player: PcmPlayer | null = null;
  private captureContext: AudioContext | null = null;
  private ready = false;
  private speakerMuted = false;
  private closed = false;
  private sourceBuffer = "";
  private translationBuffer = "";
  private sourceLanguage?: string;
  private translationLanguage?: string;
  private lines: TranscriptLine[] = [];
  private pendingSamples: number[] = [];

  constructor(listeners: LiveTranslateListeners) {
    this.listeners = listeners;
  }

  setSpeakerMuted(muted: boolean) {
    this.speakerMuted = muted;
    this.player?.setMuted(muted);
  }

  async start(session: TranslateSessionPayload, options: { sourceStream: MediaStream }) {
    this.closed = false;
    this.listeners.onStatus("connecting");
    this.listeners.onError("");

    const sourceStream = options.sourceStream;
    const liveAudio = sourceStream.getAudioTracks().some((track) => track.readyState === "live");
    if (!liveAudio) {
      throw new Error("No live incoming audio track is available to translate.");
    }

    this.player = new PcmPlayer();
    this.player.setMuted(this.speakerMuted);
    await this.player.resume();

    try {
      const captureContext = new AudioContext();
      this.captureContext = captureContext;
      await captureContext.resume();
      const source = captureContext.createMediaStreamSource(sourceStream);
      const capture = await createCaptureNode(captureContext, (frame) => {
        this.handleInputFrame(frame, captureContext.sampleRate);
      });
      const silent = captureContext.createGain();
      silent.gain.value = 0;
      source.connect(capture);
      capture.connect(silent);
      silent.connect(captureContext.destination);

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(websocketUrl(session));
        this.socket = socket;
        const timeout = window.setTimeout(() => {
          reject(new Error("Timed out waiting for the translator."));
        }, 15000);
        socket.onopen = () => {
          socket.send(JSON.stringify(setupMessage(session)));
          window.clearTimeout(timeout);
          resolve();
        };
        socket.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Could not reach the translation service."));
        };
        socket.onclose = (event) => {
          if (!this.closed && event.code !== 1000) {
            this.fail(humanizeError(event.reason || "Translation session closed."));
          }
        };
        socket.onmessage = (event) => {
          void this.handleSocketMessage(event);
        };
      });
    } catch (error) {
      await this.stop("error");
      throw error;
    }
  }

  async stop(nextStatus: TranslateStatus = "idle") {
    this.closed = true;
    this.ready = false;
    try {
      this.socket?.close(1000, "client stop");
    } catch {
      /* ignore */
    }
    this.socket = null;
    this.pendingSamples = [];
    await this.captureContext?.close().catch(() => undefined);
    this.captureContext = null;
    await this.player?.close();
    this.player = null;
    this.listeners.onInputLevel(0);
    this.listeners.onStatus(nextStatus);
  }

  private fail(message: string) {
    this.listeners.onError(message);
    void this.stop("error");
  }

  private handleInputFrame(frame: Float32Array, sampleRate: number) {
    const level = Math.min(1, rms(frame) * 4);
    this.listeners.onInputLevel(level);

    const downsampled = downsample(frame, sampleRate, SEND_SAMPLE_RATE);
    for (let index = 0; index < downsampled.length; index += 1) {
      this.pendingSamples.push(downsampled[index] ?? 0);
    }

    const chunkSamples = Math.floor(SEND_SAMPLE_RATE * 0.1);
    while (this.pendingSamples.length >= chunkSamples) {
      const chunk = new Float32Array(this.pendingSamples.splice(0, chunkSamples));
      if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) continue;

      const pcm = floatTo16BitPcm(chunk);
      this.socket.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: arrayBufferToBase64(pcm),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      }));
    }
  }

  private async handleSocketMessage(event: MessageEvent) {
    let payload: string;
    if (typeof event.data === "string") {
      payload = event.data;
    } else if (event.data instanceof Blob) {
      payload = await event.data.text();
    } else if (event.data instanceof ArrayBuffer) {
      payload = new TextDecoder().decode(event.data);
    } else {
      return;
    }

    let message: GeminiContent;
    try {
      message = JSON.parse(payload) as GeminiContent;
    } catch {
      return;
    }

    if (message.error?.message) {
      this.fail(humanizeError(message.error.message));
      return;
    }

    if (message.setupComplete) {
      this.ready = true;
      this.listeners.onStatus("live");
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.player?.flush();
    }

    if (content.inputTranscription?.text) {
      this.sourceBuffer += content.inputTranscription.text;
      this.sourceLanguage = content.inputTranscription.languageCode ?? this.sourceLanguage;
      this.publishTranscripts(content.inputTranscription.finished === true);
    }

    if (content.outputTranscription?.text) {
      this.translationBuffer += content.outputTranscription.text;
      this.translationLanguage =
        content.outputTranscription.languageCode ?? this.translationLanguage;
      this.publishTranscripts(content.outputTranscription.finished === true);
    }

    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        this.player?.playBase64(part.inlineData.data);
      }
    }

    if (content.turnComplete) {
      this.commitTranscripts();
    }
  }

  private publishTranscripts(finished: boolean) {
    const next = [...this.lines];
    if (this.sourceBuffer) {
      next.push({
        id: "pending-source",
        role: "source",
        text: this.sourceBuffer.trim(),
        language: this.sourceLanguage,
      });
    }
    if (this.translationBuffer) {
      next.push({
        id: "pending-translation",
        role: "translation",
        text: this.translationBuffer.trim(),
        language: this.translationLanguage,
      });
    }
    this.listeners.onTranscripts(next);
    if (finished) this.commitTranscripts();
  }

  private commitTranscripts() {
    if (this.sourceBuffer.trim()) {
      this.lines.push({
        id: nextId(),
        role: "source",
        text: this.sourceBuffer.trim(),
        language: this.sourceLanguage,
      });
    }
    if (this.translationBuffer.trim()) {
      this.lines.push({
        id: nextId(),
        role: "translation",
        text: this.translationBuffer.trim(),
        language: this.translationLanguage,
      });
    }
    this.sourceBuffer = "";
    this.translationBuffer = "";
    this.listeners.onTranscripts(this.lines);
  }
}
