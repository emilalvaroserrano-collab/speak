import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { loadPrefs, roomLabel } from "@/lib/rooms";
import { useMeeting } from "@/lib/meeting-store";
import { useLocalMedia } from "@/components/orbit/media";
import { Prejoin } from "@/components/orbit/prejoin";
import { Room } from "@/components/orbit/room";

export const Route = createFileRoute("/meet/$room")({
  component: MeetPage,
  head: ({ params }) => ({
    meta: [{ title: `${roomLabel(params.room)} · Orbit Meeting` }],
  }),
});

function MeetPage() {
  const { room } = Route.useParams();
  const joined = useMeeting((state) => state.joined && state.room === room);
  const wantAudio = useMeeting((state) => state.wantAudio);
  const wantVideo = useMeeting((state) => state.wantVideo);
  const hydratePrefs = useMeeting((state) => state.hydratePrefs);
  const media = useLocalMedia(wantAudio, wantVideo);

  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) hydratePrefs(prefs);
  }, [hydratePrefs]);

  useEffect(() => {
    const state = useMeeting.getState();
    if (state.joined && state.room !== room) state.leave();
  }, [room]);

  if (!joined) return <Prejoin room={room} media={media} />;
  return <Room room={room} media={media} />;
}
