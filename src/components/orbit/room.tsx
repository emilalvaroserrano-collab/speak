import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as Popover from "@radix-ui/react-popover";
import {
  ChartNoAxesColumn,
  Ellipsis,
  Hand,
  Keyboard,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  RectangleHorizontal,
  ScreenShare,
  Settings,
  SignalHigh,
  Smile,
  Star,
  ThumbsDown,
  ThumbsUp,
  Users,
  Video,
  VideoOff,
  Copy,
} from "lucide-react";
import { roomLabel } from "@/lib/rooms";
import { useMeeting, type Reaction } from "@/lib/meeting-store";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/orbit/mark";
import { StreamVideo, type LocalMedia } from "@/components/orbit/media";
import { useRoomPresence } from "@/components/orbit/director";
import { Tile } from "@/components/orbit/tile";
import { SidePanel } from "@/components/orbit/panels";
import { cn } from "@/lib/cn";

const REACTIONS: { id: Reaction; label: string; icon: typeof ThumbsUp }[] = [
  { id: "yes", label: "Yes", icon: ThumbsUp },
  { id: "no", label: "No", icon: ThumbsDown },
  { id: "here", label: "Here", icon: Hand },
  { id: "noted", label: "Noted", icon: Star },
];

function elapsedLabel(startedAt: number | null, now: number) {
  if (!startedAt) return "00:00";
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function Room({ room, media }: { room: string; media: LocalMedia }) {
  const navigate = useNavigate();
  const joined = useMeeting((state) => state.joined);
  const people = useMeeting((state) => state.people);
  const layout = useMeeting((state) => state.layout);
  const panel = useMeeting((state) => state.panel);
  const recording = useMeeting((state) => state.recording);
  const locked = useMeeting((state) => state.locked);
  const unread = useMeeting((state) => state.unread);
  const toast = useMeeting((state) => state.toast);
  const startedAt = useMeeting((state) => state.startedAt);
  const dominantId = useMeeting((state) => state.dominantId);
  const mirror = useMeeting((state) => state.mirror);
  const wantAudio = useMeeting((state) => state.wantAudio);
  const wantVideo = useMeeting((state) => state.wantVideo);
  const toggleAudio = useMeeting((state) => state.toggleAudio);
  const toggleVideo = useMeeting((state) => state.toggleVideo);
  const toggleHand = useMeeting((state) => state.toggleHand);
  const setSharing = useMeeting((state) => state.setSharing);
  const setLayout = useMeeting((state) => state.setLayout);
  const togglePanel = useMeeting((state) => state.togglePanel);
  const closePanel = useMeeting((state) => state.closePanel);
  const setRecording = useMeeting((state) => state.setRecording);
  const setLocked = useMeeting((state) => state.setLocked);
  const showToast = useMeeting((state) => state.showToast);
  const clearToast = useMeeting((state) => state.clearToast);
  const react = useMeeting((state) => state.react);
  const muteAll = useMeeting((state) => state.muteAll);
  const leave = useMeeting((state) => state.leave);
  const pushChat = useMeeting((state) => state.pushChat);

  const [now, setNow] = useState(() => Date.now());
  const [shareStream, setShareStream] = useState<MediaStream | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const handNoted = useRef(false);
  const localHand = people.find((person) => person.local)?.hand ?? false;

  useRoomPresence(joined);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(), 2600);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  useEffect(() => {
    return () => {
      shareStream?.getTracks().forEach((track) => track.stop());
    };
  }, [shareStream]);

  useEffect(() => {
    if (!localHand || handNoted.current) return;
    if (!people.some((person) => person.id === "maya")) return;
    handNoted.current = true;
    pushChat({
      fromId: "maya",
      from: "Maya Chen",
      text: "I see your hand — go ahead.",
    });
  }, [localHand, people, pushChat]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "escape") {
        closePanel();
        setConfirmEnd(false);
        return;
      }
      const map: Record<string, () => void> = {
        m: toggleAudio,
        v: toggleVideo,
        c: () => togglePanel("chat"),
        p: () => togglePanel("people"),
        r: toggleHand,
        t: () => setLayout(useMeeting.getState().layout === "tile" ? "speaker" : "tile"),
        s: () => void toggleShare(),
        l: () => void copyInvite(),
      };
      const action = map[key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function exit() {
    shareStream?.getTracks().forEach((track) => track.stop());
    setShareStream(null);
    setSharing(false);
    leave();
    void navigate({ to: "/" });
  }

  async function copyInvite() {
    const url = `${window.location.origin}/meet/${room}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Invite link copied");
    } catch {
      showToast(`Share this room: ${room}`);
    }
  }

  async function toggleShare() {
    if (shareStream) {
      shareStream.getTracks().forEach((track) => track.stop());
      setShareStream(null);
      setSharing(false);
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast("Screen share isn't available here");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setShareStream(stream);
      setSharing(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setShareStream(null);
        setSharing(false);
      });
    } catch {
      showToast("Screen share was cancelled");
    }
  }

  const sharing = Boolean(shareStream);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <h1 className="sr-only">{roomLabel(room)} meeting</h1>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <Link
          to="/"
          aria-label="Leave and go home"
          className="inline-flex items-center gap-2"
          onClick={() => {
            shareStream?.getTracks().forEach((track) => track.stop());
            leave();
          }}
        >
          <Mark />
          <span className="hidden text-sm font-medium sm:inline">Orbit</span>
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium capitalize">{roomLabel(room)}</p>
        <div className="flex items-center justify-end gap-2">
          {recording && <span className="text-xs font-medium text-danger">Recording</span>}
          {locked && <Lock className="size-4 text-muted" aria-label="Room locked" />}
          <span className="text-sm tabular-nums text-muted">{elapsedLabel(startedAt, now)}</span>
          <Button size="icon" variant="ghost" aria-label="Copy invite link" onClick={() => void copyInvite()}>
            <Copy className="size-4" />
          </Button>
          <SignalHigh className="size-4 text-live" aria-label="Connection good" />
        </div>
      </header>

      {toast && (
        <p
          role="status"
          className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-strong bg-elevated px-3 py-1.5 text-sm shadow-panel"
        >
          {toast}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className={cn("min-w-0 flex-1 p-3", panel && "hidden sm:block")}>
          <Stage
            layout={sharing ? "speaker" : layout}
            people={people}
            dominantId={dominantId}
            stream={media.stream}
            shareStream={shareStream}
            mirror={mirror}
          />
        </div>
        <SidePanel now={now} />
      </div>

      <div className="dock flex shrink-0 items-center justify-center gap-2 px-3 pt-1">
        <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-card border border-line bg-elevated p-1.5">
          <ToolButton
            label={wantAudio ? "Mute microphone" : "Unmute microphone"}
            pressed={wantAudio}
            danger={!wantAudio}
            onClick={toggleAudio}
          >
            {wantAudio ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </ToolButton>
          <ToolButton
            label={wantVideo ? "Turn camera off" : "Turn camera on"}
            pressed={wantVideo}
            danger={!wantVideo}
            onClick={toggleVideo}
          >
            {wantVideo ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </ToolButton>
          <ToolButton label={sharing ? "Stop sharing" : "Share screen"} pressed={sharing} onClick={() => void toggleShare()}>
            <ScreenShare className="size-5" />
          </ToolButton>
          <ToolButton label={localHand ? "Lower hand" : "Raise hand"} pressed={localHand} onClick={toggleHand}>
            <Hand className="size-5" />
          </ToolButton>

          <Popover.Root>
            <Popover.Trigger asChild>
              <ToolButton label="Reactions">
                <Smile className="size-5" />
              </ToolButton>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                sideOffset={12}
                className="z-40 flex gap-1 rounded-lg border border-line bg-elevated p-1.5 shadow-panel"
              >
                {REACTIONS.map((item) => (
                  <Popover.Close asChild key={item.id}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={item.label}
                      onClick={() => react("local", item.id)}
                    >
                      <item.icon className="size-4" />
                    </Button>
                  </Popover.Close>
                ))}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <ToolButton label="Chat" pressed={panel === "chat"} onClick={() => togglePanel("chat")}>
            <MessageSquare className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-medium text-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </ToolButton>
          <ToolButton label="Participants" pressed={panel === "people"} onClick={() => togglePanel("people")}>
            <Users className="size-5" />
          </ToolButton>
          <ToolButton
            label={layout === "tile" ? "Speaker view" : "Tile view"}
            pressed={layout === "speaker"}
            onClick={() => setLayout(layout === "tile" ? "speaker" : "tile")}
          >
            {layout === "tile" ? <RectangleHorizontal className="size-5" /> : <LayoutGrid className="size-5" />}
          </ToolButton>

          <Popover.Root>
            <Popover.Trigger asChild>
              <ToolButton label="More">
                <Ellipsis className="size-5" />
              </ToolButton>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                align="end"
                sideOffset={12}
                className="z-40 w-56 rounded-lg border border-line bg-elevated p-1 shadow-panel"
              >
                <MenuItem icon={Settings} label="Settings" onClick={() => togglePanel("settings")} />
                <MenuItem icon={Keyboard} label="Shortcuts" onClick={() => togglePanel("shortcuts")} />
                <MenuItem icon={ChartNoAxesColumn} label="Stats" onClick={() => togglePanel("stats")} />
                <MenuItem
                  icon={Lock}
                  label={locked ? "Unlock room" : "Lock room"}
                  onClick={() => {
                    setLocked(!locked);
                    showToast(locked ? "Room unlocked" : "Room locked. New guests wait.");
                  }}
                />
                <MenuItem
                  icon={Users}
                  label="Mute everyone"
                  onClick={muteAll}
                />
                <MenuItem
                  icon={SignalHigh}
                  label={recording ? "Stop recording" : "Start recording"}
                  onClick={() => {
                    setRecording(!recording);
                    showToast(recording ? "Recording stopped" : "Recording started");
                  }}
                />
                <MenuItem icon={PhoneOff} label="End meeting for all" danger onClick={() => setConfirmEnd(true)} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <div className="shrink-0 rounded-card border border-line bg-elevated p-1.5">
          <ToolButton label="Leave meeting" danger onClick={exit}>
            <PhoneOff className="size-5" />
          </ToolButton>
        </div>
      </div>

      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
            className="w-full max-w-sm rounded-card border border-line bg-elevated p-5 shadow-panel"
          >
            <h2 id="end-title" className="text-lg font-medium">
              End the meeting?
            </h2>
            <p className="mt-2 text-sm leading-normal text-muted">
              Everyone will leave this room, including you.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={exit}>
                End meeting
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stage({
  layout,
  people,
  dominantId,
  stream,
  shareStream,
  mirror,
}: {
  layout: "tile" | "speaker";
  people: ReturnType<typeof useMeeting.getState>["people"];
  dominantId: string | null;
  stream: MediaStream | null;
  shareStream: MediaStream | null;
  mirror: boolean;
}) {
  if (people.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-muted">Connecting</div>;
  }

  if (layout === "speaker") {
    const dominant = people.find((person) => person.id === dominantId) ?? people[0];
    const film = shareStream ? people : people.filter((person) => person.id !== dominant.id);
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="relative min-h-0 flex-1">
          {shareStream ? (
            <div className="relative h-full overflow-hidden rounded-lg border-2 border-accent bg-subtle">
              <StreamVideo stream={shareStream} />
              <p className="absolute inset-x-2 bottom-2 rounded-sm bg-bg/80 px-2 py-1 text-sm">Your screen</p>
            </div>
          ) : (
            <Tile person={dominant} stream={stream} mirror={mirror} className="h-full" />
          )}
        </div>
        {film.length > 0 && (
          <div className="flex h-32 shrink-0 gap-2 overflow-x-auto">
            {film.map((person) => (
              <Tile
                key={person.id}
                person={person}
                stream={stream}
                mirror={mirror}
                compact
                className="h-full w-36 shrink-0"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "stage-grid grid h-full gap-2 overflow-y-auto",
        people.length <= 1
          ? "grid-cols-1"
          : people.length === 3
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {people.map((person) => (
        <Tile key={person.id} person={person} stream={stream} mirror={mirror} className="h-full" />
      ))}
    </div>
  );
}

function ToolButton({
  label,
  children,
  onClick,
  pressed,
  danger,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant={danger ? "danger" : pressed ? "primary" : "secondary"}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="relative"
    >
      {children}
    </Button>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Settings;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Popover.Close asChild>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm",
          danger ? "text-danger hover:bg-subtle" : "text-fg hover:bg-subtle",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </button>
    </Popover.Close>
  );
}
