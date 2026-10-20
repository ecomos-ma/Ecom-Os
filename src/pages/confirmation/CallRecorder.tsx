import { Mic, Pause, Play, RotateCw, Square, UploadCloud } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type PendingRecording = {
  recordingId: string;
  blob: Blob;
  startedAt: Date;
  endedAt: Date;
};

function newRecordingId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  throw new Error("Secure recording IDs are unavailable in this browser.");
}

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

function announceCallStatus(active: boolean) {
  window.dispatchEvent(new CustomEvent("ecomos:agent-call-status", { detail: { active } }));
}

export type CallRecorderHandle = {
  start: () => Promise<boolean>;
  hasUnfinished: () => boolean;
};

export const CallRecorder = forwardRef<CallRecorderHandle, {
  onUpload: (recording: PendingRecording) => Promise<void>;
  onActivity: (activity: "CALL_STARTED" | "CALL_ENDED", metadata?: Record<string, unknown>) => Promise<void>;
  disabled?: boolean;
}>(function CallRecorder({
  onUpload,
  onActivity,
  disabled = false,
}, ref) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<Date | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<PendingRecording | null>(null);
  const uploadingRef = useRef(false);
  const startingRef = useRef(false);
  const uploadForSessionRef = useRef(onUpload);
  const disposedRef = useRef(false);

  const clearResources = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
        announceCallStatus(false);
      }
      clearResources();
    };
  }, []);

  useEffect(() => {
    const warnOnLeave = (event: BeforeUnloadEvent) => {
      if (!recorderRef.current && !pendingRef.current && !uploadingRef.current && !startingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnOnLeave);
    return () => window.removeEventListener("beforeunload", warnOnLeave);
  }, []);

  const uploadRecording = async (ready: PendingRecording) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    try {
      await uploadForSessionRef.current(ready);
      pendingRef.current = null;
      setPending(null);
      setDuration(0);
    } catch (uploadError: any) {
      setError(uploadError?.message || "Upload failed. The recording is still available to retry in this tab.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const start = async () => {
    if (disabled || recording || recorderRef.current || startingRef.current || uploadingRef.current || pendingRef.current) return false;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot make a microphone recording. Use a supported secure browser.");
      return false;
    }
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16_000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (disposedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24_000 } : { audioBitsPerSecond: 24_000 });
      const startedAt = new Date();
      chunksRef.current = [];
      startedAtRef.current = startedAt;
      streamRef.current = stream;
      recorderRef.current = recorder;
      uploadForSessionRef.current = onUpload;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const endedAt = new Date();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size > 0 && startedAtRef.current) {
          try {
            const ready = { recordingId: newRecordingId(), blob, startedAt: startedAtRef.current, endedAt };
            pendingRef.current = ready;
            setPending(ready);
            void uploadRecording(ready);
          } catch (recordingError: any) {
            setError(recordingError?.message || "Could not prepare this recording.");
          }
        } else {
          setError("No microphone audio was captured. Nothing was saved; please try again.");
        }
        clearResources();
      };
      stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => {
        if (recorder.state === "inactive") return;
        recorder.stop();
        setRecording(false);
        announceCallStatus(false);
        void onActivity("CALL_ENDED", { duration_seconds: Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)), source: "browser_microphone_recording", reason: "microphone_disconnected" }).catch(() => undefined);
      }, { once: true }));
      recorder.start(1000);
      setDuration(0);
      setRecording(true);
      announceCallStatus(true);
      intervalRef.current = window.setInterval(() => setDuration((current) => current + 1), 1000);
      void onActivity("CALL_STARTED", { source: "browser_microphone_recording", initiated_by: "agent_click" }).catch(() => undefined);
      return true;
    } catch (startError: any) {
      clearResources();
      if (startError?.name === "NotAllowedError") {
        setError("Microphone permission was denied. Recording only starts after you grant browser permission.");
      } else {
        setError(startError?.message || "Could not start microphone recording.");
      }
      return false;
    } finally {
      startingRef.current = false;
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    recorder.stop();
    setRecording(false);
    announceCallStatus(false);
    void onActivity("CALL_ENDED", { duration_seconds: duration, source: "browser_microphone_recording" }).catch(() => undefined);
  };

  useImperativeHandle(ref, () => ({
    start,
    hasUnfinished: () => Boolean(recorderRef.current || startingRef.current || pendingRef.current || uploadingRef.current),
  }));

  return (
    <div className="rounded-xl border border-base-border bg-base-raised/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-ink">Microphone recording</div>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-muted">Records this device’s microphone only. A separate phone dialer may pause the browser; customer phone audio is not captured automatically.</p>
        </div>
        {recording ? (
          <button onClick={() => void stop()} className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-[11.5px] font-semibold text-white shadow-sm hover:bg-danger/90">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Stop & save {durationLabel(duration)} <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button onClick={() => void start()} disabled={disabled || uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-[11.5px] font-semibold text-brand hover:bg-brand/15 disabled:opacity-50">
            <Mic size={13} /> Start recording
          </button>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-ink-muted">Inform the customer and record only when permitted.</p>
      {pending && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
          <div className="text-[11px] text-ink"><span className="font-semibold">Recording ready</span> · {durationLabel(Math.max(0, Math.round((pending.endedAt.getTime() - pending.startedAt.getTime()) / 1000)))} · {(pending.blob.size / 1024 / 1024).toFixed(1)} MB</div>
          <button onClick={() => void uploadRecording(pending)} disabled={uploading} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60">
            {uploading ? <RotateCw size={12} className="animate-spin" /> : <UploadCloud size={12} />} {uploading ? "Saving to Team" : "Retry save"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[10.5px] text-danger">{error}</p>}
    </div>
  );
});

export function SecureRecordingPlayer({
  src,
  durationSeconds,
}: {
  src: string | null;
  durationSeconds: number;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!src) return null;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) { audio.pause(); } else { void audio.play(); }
      }} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand hover:bg-brand/15">
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <span className="text-[11px] text-ink-muted">{durationLabel(durationSeconds)}</span>
      <audio ref={audioRef} src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}
