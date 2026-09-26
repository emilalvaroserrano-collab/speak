import { Link } from "@tanstack/react-router";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { rememberRoom, roomLabel } from "@/lib/rooms";
import { useMeeting } from "@/lib/meeting-store";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/orbit/mark";
import { StreamVideo, type LocalMedia } from "@/components/orbit/media";
import { initials } from "@/components/orbit/tile";

const fieldClass =
  "h-12 w-full rounded-md border border-strong bg-bg px-3 text-base text-fg outline-none";

export function Prejoin({ room, media }: { room: string; media: LocalMedia }) {
  const displayName = useMeeting((state) => state.displayName);
  const setDisplayName = useMeeting((state) => state.setDisplayName);
  const wantAudio = useMeeting((state) => state.wantAudio);
  const wantVideo = useMeeting((state) => state.wantVideo);
  const toggleAudio = useMeeting((state) => state.toggleAudio);
  const toggleVideo = useMeeting((state) => state.toggleVideo);
  const mirror = useMeeting((state) => state.mirror);
  const join = useMeeting((state) => state.join);
  const videoLive = Boolean(media.stream?.getVideoTracks().some((track) => track.readyState === "live"));

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex h-16 items-center justify-between border-b border-line px-5">
        <Link to="/" className="inline-flex items-center gap-2 text-fg" aria-label="Orbit Meeting home">
          <Mark />
          <span className="text-base font-medium tracking-tight">Orbit Meeting</span>
        </Link>
        <p className="max-w-40 truncate text-sm capitalize text-muted">{roomLabel(room)}</p>
      </header>

      <main className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-8 lg:grid-cols-2 lg:items-center">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-subtle">
          {wantVideo && videoLive ? (
            <StreamVideo stream={media.stream} mirror={mirror} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-4xl font-medium tracking-tight">{initials(displayName || "Guest")}</span>
            </div>
          )}
          <p className="absolute inset-x-3 bottom-3 truncate rounded-md bg-bg/80 px-3 py-2 text-sm">
            {displayName.trim() || "Guest"}
          </p>
        </div>

        <form
          className="rounded-card border border-line bg-elevated p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!displayName.trim()) setDisplayName("Guest");
            rememberRoom(room);
            join(room);
          }}
        >
          <h1 className="text-2xl font-medium tracking-tight">Join meeting</h1>
          <p className="mt-1 text-sm capitalize text-muted">{roomLabel(room)}</p>

          <label htmlFor="display-name" className="mt-5 grid gap-2 text-sm font-medium">
            Your name
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
              autoComplete="name"
              className={fieldClass}
            />
          </label>

          <div className="mt-4 flex gap-2">
            <Button
              variant={wantAudio ? "secondary" : "danger"}
              aria-pressed={wantAudio}
              onClick={toggleAudio}
              className="flex-1"
            >
              {wantAudio ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              {wantAudio ? "Mic on" : "Mic off"}
            </Button>
            <Button
              variant={wantVideo ? "secondary" : "danger"}
              aria-pressed={wantVideo}
              onClick={toggleVideo}
              className="flex-1"
            >
              {wantVideo ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              {wantVideo ? "Camera on" : "Camera off"}
            </Button>
          </div>

          {media.mics.length > 0 && (
            <label className="mt-4 grid gap-2 text-sm font-medium">
              Microphone
              <select
                className={fieldClass}
                value={media.micId}
                onChange={(event) => media.setMicId(event.target.value)}
              >
                <option value="">System default</option>
                {media.mics.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Microphone"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {media.cameras.length > 0 && (
            <label className="mt-4 grid gap-2 text-sm font-medium">
              Camera
              <select
                className={fieldClass}
                value={media.cameraId}
                onChange={(event) => media.setCameraId(event.target.value)}
              >
                <option value="">System default</option>
                {media.cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Camera"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(media.audioError || media.videoError) && (
            <p className="mt-4 text-sm leading-normal text-muted">
              {[media.audioError, media.videoError].filter(Boolean).join(" ")} You can still join.
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="mt-5 w-full">
            Join meeting
          </Button>
        </form>
      </main>
    </div>
  );
}
