import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { loadRecent, rememberRoom, roomLabel, slugify, type RecentRoom } from "@/lib/rooms";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/orbit/mark";
import { Mic, PhoneOff, Video } from "lucide-react";
import { Eq, initials } from "@/components/orbit/tile";

const PREVIEW = [
  { name: "Maya Chen", speaking: true },
  { name: "Leo Okonkwo", speaking: false },
  { name: "Priya Shah", speaking: false },
  { name: "You", speaking: false },
];

export function WelcomePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState<RecentRoom[] | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  function start(raw: string) {
    const slug = slugify(raw);
    setRecent(rememberRoom(slug));
    void navigate({ to: "/meet/$room", params: { room: slug } });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    start(draft);
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex h-16 items-center justify-between border-b border-line px-5">
        <Wordmark />
        <p className="hidden text-sm text-muted sm:block">No account required</p>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-16">
        <section>
          <p className="text-sm font-medium text-muted">Video meetings</p>
          <h1 className="mt-2 max-w-xl text-3xl font-medium tracking-tight text-fg sm:text-4xl">
            Secure, high-quality meetings
          </h1>
          <p className="mt-3 max-w-lg text-base leading-normal text-muted">
            Start a room, share the name, and meet in the browser. No account and no install. You moderate what you start.
          </p>

          <form onSubmit={onSubmit} className="mt-8 rounded-card border border-line bg-elevated p-4">
            <label htmlFor="meeting-name" className="text-sm font-medium text-fg">
              Meeting name
            </label>
            <input
              id="meeting-name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="design-review"
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-md border border-strong bg-bg px-3 text-base text-fg outline-none placeholder:text-faint"
            />
            <Button type="submit" variant="primary" size="lg" className="mt-3 w-full">
              Start meeting
            </Button>
            <p className="mt-3 text-sm text-faint">
              Leave it blank and a name is chosen for you. You are the only moderator.
            </p>
          </form>

          <section className="mt-8" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="text-sm font-medium text-muted">
              Recent
            </h2>
            {recent === null ? (
              <p className="mt-3 text-sm text-faint">Loading recent rooms</p>
            ) : recent.length === 0 ? (
              <p className="mt-3 max-w-md text-sm leading-normal text-muted">
                No recent rooms yet. Start one and it stays on this device.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {recent.map((room) => (
                  <li key={room.slug} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium capitalize">{roomLabel(room.slug)}</p>
                      <p className="truncate text-sm text-faint">{room.slug}</p>
                    </div>
                    <Button variant="secondary" onClick={() => start(room.slug)}>
                      Join
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        <section className="hidden lg:block" aria-hidden="true">
          <div className="rounded-card border border-line bg-elevated p-3">
            <div className="mb-3 flex items-center justify-between px-1 text-sm text-muted">
              <span>design-review</span>
              <span className="tabular-nums">12:04</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PREVIEW.map((person) => (
                <div
                  key={person.name}
                  className={`relative flex h-36 items-center justify-center rounded-lg border-2 bg-subtle ${person.speaking ? "border-accent" : "border-transparent"}`}
                >
                  <span className="text-2xl font-medium">
                    {initials(person.name === "You" ? "Alex Morgan" : person.name)}
                  </span>
                  {person.speaking && (
                    <span className="absolute right-2 top-2 rounded-sm bg-bg/80 px-1.5 py-1">
                      <Eq />
                    </span>
                  )}
                  <span className="absolute inset-x-2 bottom-2 truncate rounded-sm bg-bg/80 px-2 py-1 text-sm">
                    {person.name}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-2 text-fg">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-subtle">
                <Mic className="size-4" />
              </span>
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-subtle">
                <Video className="size-4" />
              </span>
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-danger text-danger-fg">
                <PhoneOff className="size-4" />
              </span>
            </div>
          </div>
        </section>
      </main>

      <section className="mx-auto grid w-full max-w-6xl gap-px bg-line px-5 pb-16 sm:grid-cols-3">
        {[
          ["No account", "Join with a display name. The room name is the invite."],
          ["You run the room", "Mute everyone, hold guests in the lobby, or end it when you're done."],
          ["Familiar controls", "Mic, camera, screen share, chat, raise hand, and tile view."],
        ].map(([title, copy]) => (
          <div key={title} className="bg-bg py-5 sm:px-4">
            <h2 className="text-sm font-medium text-fg">{title}</h2>
            <p className="mt-1 text-sm leading-normal text-muted">{copy}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
