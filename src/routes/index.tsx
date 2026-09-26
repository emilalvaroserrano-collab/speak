import { createFileRoute } from "@tanstack/react-router";
import { WelcomePage } from "@/components/orbit/welcome";

export const Route = createFileRoute("/")({
  component: WelcomePage,
  head: () => ({
    meta: [
      { title: "Orbit Meeting" },
      {
        name: "description",
        content: "Secure, high-quality meetings. Start a room in the browser — no account.",
      },
    ],
  }),
});
