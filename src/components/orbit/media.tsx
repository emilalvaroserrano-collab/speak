import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type LocalMedia = {
  stream: MediaStream | null;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  cameraId: string;
  micId: string;
  setCameraId: (id: string) => void;
  setMicId: (id: string) => void;
  videoError: string | null;
  audioError: string | null;
};

export function useLocalMedia(wantAudio: boolean, wantVideo: boolean): LocalMedia {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micId, setMicId] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStream(null);
        setVideoError(wantVideo ? "No camera in this browser" : null);
        setAudioError(wantAudio ? "No microphone in this browser" : null);
        return;
      }
      if (!wantAudio && !wantVideo) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
        setVideoError(null);
        setAudioError(null);
        return;
      }

      const audio = wantAudio
        ? {
            ...(micId ? { deviceId: { exact: micId } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          }
        : false;
      const video = wantVideo
        ? cameraId
          ? { deviceId: { exact: cameraId } }
          : { facingMode: "user" }
        : false;

      const attempts: MediaStreamConstraints[] = [{ audio, video }];
      if (wantAudio && wantVideo) {
        attempts.push({ audio, video: false }, { audio: false, video });
      }

      let next: MediaStream | null = null;
      let lastError: unknown = null;
      for (const constraints of attempts) {
        try {
          next = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (cancelled) {
        next?.getTracks().forEach((track) => track.stop());
        return;
      }

      if (!next) {
        setStream(null);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (wantVideo) setVideoError("Camera unavailable");
        if (wantAudio) setAudioError("Microphone unavailable");
        void lastError;
        return;
      }

      const hasVideo = next.getVideoTracks().length > 0;
      const hasAudio = next.getAudioTracks().length > 0;
      setVideoError(wantVideo && !hasVideo ? "Camera unavailable" : null);
      setAudioError(wantAudio && !hasAudio ? "Microphone unavailable" : null);

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = next;
      setStream(next);

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setCameras(devices.filter((device) => device.kind === "videoinput"));
        setMics(devices.filter((device) => device.kind === "audioinput"));
      } catch {
        /* device labels are optional */
      }
    }

    void open();
    return () => {
      cancelled = true;
    };
  }, [wantAudio, wantVideo, cameraId, micId]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    stream,
    cameras,
    mics,
    cameraId,
    micId,
    setCameraId,
    setMicId,
    videoError,
    audioError,
  };
}

export function StreamVideo({
  stream,
  mirror,
  className,
}: {
  stream: MediaStream | null;
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
  }, [stream]);

  const live = stream?.getVideoTracks().some((track) => track.readyState === "live");
  if (!stream || !live) return null;

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full object-cover", mirror && "mirror-x", className)}
    />
  );
}
