import { createFileRoute } from "@tanstack/react-router";
import { TRANSLATION_LANGUAGES } from "@/lib/translation-languages";

export const Route = createFileRoute("/api/translation-languages")({
  server: {
    handlers: {
      GET: async () => Response.json(TRANSLATION_LANGUAGES),
    },
  },
});
