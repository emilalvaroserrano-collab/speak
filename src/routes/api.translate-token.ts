import { GoogleGenAI, Modality } from "@google/genai";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TRANSLATION_LANGUAGE_CODES } from "@/lib/translation-languages";

const MODEL = "gemini-3.5-live-translate-preview";
const requestSchema = z.object({
  targetLanguageCode: z.string().refine((code) => TRANSLATION_LANGUAGE_CODES.has(code)),
});

export const Route = createFileRoute("/api/translate-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "Live translation is not configured yet." },
            { status: 503 },
          );
        }

        try {
          const body = requestSchema.parse(await request.json());
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: { apiVersion: "v1alpha" },
          });
          const now = Date.now();
          const token = await ai.authTokens.create({
            config: {
              uses: 1,
              expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
              // Match the working reference app: the setup window must cover
              // token fetch + socket open + setup round-trip on slow networks.
              newSessionExpireTime: new Date(now + 12 * 60 * 1000).toISOString(),
              liveConnectConstraints: {
                model: MODEL,
                config: {
                  responseModalities: [Modality.AUDIO],
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                  translationConfig: {
                    targetLanguageCode: body.targetLanguageCode,
                    // Must match the setup message sent by the browser client
                    // exactly — locked fields that differ reject the handshake.
                    echoTargetLanguage: true,
                  },
                },
              },
            },
          });

          if (!token.name) {
            return Response.json(
              { error: "Translation could not start. Please try again." },
              { status: 502 },
            );
          }

          return Response.json({ token: token.name, model: MODEL });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json({ error: "Choose a supported language." }, { status: 400 });
          }
          return Response.json(
            { error: "Translation could not start. Please try again." },
            { status: 502 },
          );
        }
      },
    },
  },
});
