import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveTranslateClient,
  type TranscriptLine,
} from "@/lib/translate/live-translate-client";

export type TranslationStatus = "idle" | "connecting" | "listening" | "playing" | "error";

export type TranslationState = {
  status: TranslationStatus;
  sourceText: string;
  translatedText: string;
  error: string | null;
};

const INITIAL_STATE: TranslationState = {
  status: "idle",
  sourceText: "",
  translatedText: "",
  error: null,
};

function lastLineText(lines: TranscriptLine[], role: "source" | "translation"): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.role === role && line.text) return line.text;
  }
  return "";
}

/**
 * Live translation for the React meeting UI, driven by the same
 * LiveTranslateClient engine as the working reference app: ephemeral token
 * over the Constrained WebSocket endpoint, AudioWorklet capture, PCM
 * playback, and buffered transcripts.
 *
 * Meeting semantics: the incoming remote stream is the translation source
 * and the local microphone is always muted — your own voice is never
 * translated.
 */
export function useLiveTranslation(stream: MediaStream | null, enabled: boolean, targetLanguageCode: string) {
  const [state, setState] = useState<TranslationState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);
  const clientRef = useRef<LiveTranslateClient | null>(null);
  const playingTimer = useRef<number | null>(null);

  const restart = useCallback(() => {
    if (playingTimer.current !== null) {
      window.clearTimeout(playingTimer.current);
      playingTimer.current = null;
    }
    void clientRef.current?.stop("idle");
    clientRef.current = null;
    setState(INITIAL_STATE);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !stream) return;
    const sourceStream = stream;
    const language = targetLanguageCode;
    let cancelled = false;

    function markPlaying() {
      setState((current) => (current.status === "playing" ? current : { ...current, status: "playing" }));
      if (playingTimer.current !== null) window.clearTimeout(playingTimer.current);
      playingTimer.current = window.setTimeout(() => {
        playingTimer.current = null;
        if (!cancelled) {
          setState((current) => (current.status === "playing" ? { ...current, status: "listening" } : current));
        }
      }, 3000);
    }

    async function start() {
      setState({ ...INITIAL_STATE, status: "connecting" });
      try {
        const response = await fetch("/api/translate-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetLanguageCode: language }),
        });
        const payload = (await response.json()) as { token?: string; model?: string; error?: string };
        if (!response.ok || !payload.token || !payload.model) {
          throw new Error(payload.error ?? "Translation could not start.");
        }
        if (cancelled) return;

        const client = new LiveTranslateClient({
          onStatus: (status) => {
            if (cancelled) return;
            if (status === "live") {
              setState((current) => ({ ...current, status: "listening", error: null }));
            } else if (status === "connecting") {
              setState((current) => ({ ...current, status: "connecting" }));
            } else if (status === "idle") {
              setState((current) => ({ ...current, status: "idle" }));
            }
          },
          onError: (message) => {
            if (cancelled) return;
            setState((current) => ({
              ...current,
              status: "error",
              error: message || "Translation connection failed.",
            }));
          },
          onInputLevel: () => {},
          onTranscripts: (lines) => {
            if (cancelled) return;
            const sourceText = lastLineText(lines, "source");
            const translatedText = lastLineText(lines, "translation");
            setState((current) => ({
              ...current,
              sourceText: sourceText || current.sourceText,
              translatedText: translatedText || current.translatedText,
            }));
            if (translatedText) markPlaying();
          },
        });
        clientRef.current = client;
        // Meeting rule: never translate the local microphone.
        client.setMicMuted(true);
        await client.start(
          {
            mode: "token",
            token: payload.token,
            model: payload.model,
            targetLanguage: language,
          },
          { displayStream: sourceStream },
        );
      } catch (error) {
        if (cancelled) return;
        clientRef.current = null;
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: error instanceof Error ? error.message : "Translation could not start.",
        });
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (playingTimer.current !== null) {
        window.clearTimeout(playingTimer.current);
        playingTimer.current = null;
      }
      const client = clientRef.current;
      clientRef.current = null;
      void client?.stop("idle");
    };
  }, [attempt, enabled, stream, targetLanguageCode]);

  return { state, restart };
}
