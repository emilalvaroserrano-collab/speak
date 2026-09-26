import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Switch from "@radix-ui/react-switch";
import { X } from "lucide-react";
import { roomLabel } from "@/lib/rooms";
import { useMeeting } from "@/lib/meeting-store";
import { Button } from "@/components/ui/button";

const SHORTCUTS = [
  ["M", "Mute or unmute"],
  ["V", "Camera on or off"],
  ["C", "Open chat"],
  ["P", "Open participants"],
  ["R", "Raise or lower hand"],
  ["T", "Tile or speaker view"],
  ["S", "Share screen"],
  ["L", "Copy invite link"],
  ["Esc", "Close the panel"],
];

function formatClock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatElapsed(startedAt: number | null, now: number) {
  if (!startedAt) return "00:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function SidePanel({ now }: { now: number }) {
  const panel = useMeeting((state) => state.panel);
  const closePanel = useMeeting((state) => state.closePanel);
  if (!panel) return null;

  const title =
    panel === "chat"
      ? "Chat"
      : panel === "people"
        ? "Participants"
        : panel === "settings"
          ? "Settings"
          : panel === "shortcuts"
            ? "Shortcuts"
            : "Stats";

  return (
    <aside className="panel-in absolute inset-0 z-20 flex min-h-0 flex-col bg-elevated sm:static sm:w-96 sm:border-l sm:border-line">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-base font-medium">{title}</h2>
        <Button size="icon" variant="ghost" aria-label="Close panel" onClick={closePanel}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panel === "chat" && <ChatPanel />}
        {panel === "people" && <PeoplePanel />}
        {panel === "settings" && <SettingsPanel />}
        {panel === "shortcuts" && <ShortcutsPanel />}
        {panel === "stats" && <StatsPanel now={now} />}
      </div>
    </aside>
  );
}

function ChatPanel() {
  const chat = useMeeting((state) => state.chat);
  const sendChat = useMeeting((state) => state.sendChat);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.length]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    sendChat(draft);
    setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {chat.length === 0 ? (
          <p className="text-sm leading-normal text-muted">No messages yet. Say hello to the room.</p>
        ) : (
          chat.map((message) => (
            <article key={message.id}>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{message.from}</span>
                <time
                  className="shrink-0 text-xs tabular-nums text-faint"
                  dateTime={new Date(message.at).toISOString()}
                >
                  {formatClock(message.at)}
                </time>
              </p>
              <p className="mt-1 text-sm leading-normal text-muted">{message.text}</p>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-line p-3">
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the room"
          maxLength={500}
          className="h-11 min-w-0 flex-1 rounded-md border border-strong bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint"
        />
        <Button type="submit" variant="primary">
          Send
        </Button>
      </form>
    </div>
  );
}

function PeoplePanel() {
  const people = useMeeting((state) => state.people);
  const lobby = useMeeting((state) => state.lobby);
  const admit = useMeeting((state) => state.admit);
  const deny = useMeeting((state) => state.deny);
  const muteAll = useMeeting((state) => state.muteAll);
  const locked = useMeeting((state) => state.locked);
  const setLocked = useMeeting((state) => state.setLocked);

  return (
    <div className="scroll-thin h-full overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{people.length} in the room</p>
        <Button variant="secondary" onClick={muteAll}>
          Mute all
        </Button>
      </div>
      <ul className="space-y-2">
        {people.map((person) => (
          <li key={person.id} className="rounded-md bg-subtle px-3 py-2">
            <p className="truncate text-sm font-medium">
              {person.name}
              {person.local ? " (you)" : ""}
            </p>
            <p className="text-xs text-faint">
              {person.moderator ? "Moderator" : person.role || "Guest"}
              {!person.audio ? " · Muted" : ""}
              {person.hand ? " · Hand raised" : ""}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Lobby</p>
          <p className="text-xs text-faint">{locked ? "New guests wait" : "Room is open"}</p>
        </div>
        <Switch.Root
          checked={locked}
          onCheckedChange={setLocked}
          aria-label={locked ? "Unlock room" : "Lock room"}
          className="relative h-6 w-11 rounded-full border border-strong bg-bg data-[state=checked]:bg-accent"
        >
          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-fg transition-transform duration-150 data-[state=checked]:translate-x-5 data-[state=checked]:bg-ink" />
        </Switch.Root>
      </div>

      {lobby.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lobby.map((guest) => (
            <li key={guest.id} className="rounded-md border border-line px-3 py-3">
              <p className="text-sm font-medium">{guest.name}</p>
              <p className="text-xs text-faint">{guest.role || "Guest"} is waiting</p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" onClick={() => admit(guest.id)}>
                  Admit
                </Button>
                <Button variant="ghost" onClick={() => deny(guest.id)}>
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsPanel() {
  const displayName = useMeeting((state) => state.displayName);
  const setDisplayName = useMeeting((state) => state.setDisplayName);
  const mirror = useMeeting((state) => state.mirror);
  const setMirror = useMeeting((state) => state.setMirror);

  return (
    <div className="grid gap-5 px-4 py-4">
      <label htmlFor="settings-name" className="grid gap-2 text-sm font-medium">
        Display name
        <input
          id="settings-name"
          value={displayName}
          maxLength={40}
          onChange={(event) => setDisplayName(event.target.value)}
          className="h-12 rounded-md border border-strong bg-bg px-3 text-base font-normal text-fg outline-none"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Mirror my video</p>
          <p className="text-xs text-faint">Only you see the flipped view</p>
        </div>
        <Switch.Root
          checked={mirror}
          onCheckedChange={setMirror}
          aria-label="Mirror my video"
          className="relative h-6 w-11 rounded-full border border-strong bg-bg data-[state=checked]:bg-accent"
        >
          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-fg transition-transform duration-150 data-[state=checked]:translate-x-5 data-[state=checked]:bg-ink" />
        </Switch.Root>
      </div>
    </div>
  );
}

function ShortcutsPanel() {
  return (
    <ul className="scroll-thin h-full divide-y divide-line overflow-y-auto px-4">
      {SHORTCUTS.map(([key, label]) => (
        <li key={key} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span>{label}</span>
          <kbd className="rounded-sm border border-strong bg-bg px-2 py-1 font-mono text-xs text-muted">{key}</kbd>
        </li>
      ))}
    </ul>
  );
}

function StatsPanel({ now }: { now: number }) {
  const room = useMeeting((state) => state.room);
  const startedAt = useMeeting((state) => state.startedAt);
  const people = useMeeting((state) => state.people);
  const [downlink, setDownlink] = useState(1.6);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const wobble = ((Date.now() / 800) % 5) / 10;
      setDownlink(Number((1.45 + wobble).toFixed(2)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = [
    ["Room", roomLabel(room)],
    ["Duration", formatElapsed(startedAt, now)],
    ["Participants", String(people.length)],
    ["Quality", "Good"],
    ["Downlink", `${downlink.toFixed(2)} Mb/s`],
    ["Packet loss", "0.1%"],
  ];

  return (
    <dl className="divide-y divide-line px-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-3 text-sm">
          <dt className="text-muted">{label}</dt>
          <dd className="font-medium tabular-nums capitalize">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
