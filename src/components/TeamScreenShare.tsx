import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MonitorUp, ShieldCheck, Square, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { toast } from "./Toast";
import {
  actTeamScreenShare, getPendingTeamScreenShare, getTeamScreenShareSession,
  listTeamScreenShareSignals, requestTeamScreenShare, sendTeamScreenShareSignal,
  type TeamScreenShareSession, type TeamScreenShareSignal,
} from "../services/teamScreenShareService";

const forbiddenDuringCapture = /^\/(admin|settings|finance|agent-invoices|founder|billing|auth)(\/|$)/i;

type CaptureTrack = MediaStreamTrack & {
  getCaptureHandle?: () => { handle: string; origin: string } | null;
};

function verifiedEcomOSTab(track: CaptureTrack, workspaceId: string) {
  const handle = track.getCaptureHandle?.();
  return track.getSettings().displaySurface === "browser"
    && handle?.handle === `ecomos:${workspaceId}`
    && handle?.origin === window.location.origin;
}

function iceConfiguration(): RTCConfiguration {
  // No permanent TURN credentials belong in a public Vite bundle.
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
}

/** Every viewing session is separately requested and separately consented to. */
export function TeamScreenShare() {
  const { workspace, profile } = useAuth();
  const location = useLocation();
  const [request, setRequest] = useState<TeamScreenShareSession | null>(null);
  const [viewing, setViewing] = useState<TeamScreenShareSession | null>(null);
  const [agentSharing, setAgentSharing] = useState(false);
  const [viewerState, setViewerState] = useState<"pending" | "connecting" | "connected" | "declined" | "stopped" | "unsupported">("pending");
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeRef = useRef<TeamScreenShareSession | null>(null);
  const lastSignalRef = useRef(0);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pollingRef = useRef(false);
  const heartbeatAtRef = useRef(0);
  const watchedAgentNameRef = useRef("");
  const isManager = ["founder", "owner", "admin", "manager", "supervisor"].includes(profile?.role || "");

  useEffect(() => {
    if (!workspace?.id) return;
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      setCaptureHandleConfig?: (config: { handle: string; permittedOrigins: string[]; exposeOrigin: boolean }) => void;
    };
    try {
      mediaDevices?.setCaptureHandleConfig?.({
        handle: `ecomos:${workspace.id}`,
        permittedOrigins: [window.location.origin],
        exposeOrigin: true,
      });
    } catch { /* unsupported browser: capture will be rejected at consent */ }
  }, [workspace?.id]);

  const clearMedia = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    pendingIceRef.current = [];
    lastSignalRef.current = 0;
    setAgentSharing(false);
  }, []);

  const stop = useCallback((session?: TeamScreenShareSession | null, notifyServer = true) => {
    const target = session ?? activeRef.current;
    activeRef.current = null;
    clearMedia();
    setRequest(null);
    setViewing(null);
    setAccepting(false);
    if (target && notifyServer) void actTeamScreenShare(target.id, "stop").catch(() => undefined);
  }, [clearMedia]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ agentId: string; agentName: string }>).detail;
      if (!isManager || !workspace?.id || !profile?.id || !detail?.agentId || activeRef.current) return;
      setError("");
      setViewerState("pending");
      watchedAgentNameRef.current = detail.agentName;
      void requestTeamScreenShare(workspace.id, detail.agentId).then((session) => {
        activeRef.current = session;
        setViewing(session);
      }).catch((requestError: Error) => toast.error(requestError.message || "Could not request screen sharing."));
    };
    window.addEventListener("ecomos-watch-live", handler);
    return () => window.removeEventListener("ecomos-watch-live", handler);
  }, [isManager, workspace?.id, profile?.id]);

  useEffect(() => {
    if (!workspace?.id || !profile?.id || !["agent", "supervisor"].includes(profile.role || "")) return;
    let disposed = false;
    let inFlight = false;
    const check = async () => {
      if (disposed || inFlight || activeRef.current || forbiddenDuringCapture.test(window.location.pathname)) return;
      inFlight = true;
      try {
        const pending = await getPendingTeamScreenShare(profile.id, workspace.id);
        if (!disposed && pending && !activeRef.current) setRequest(pending);
        if (!disposed && !pending) setRequest(null);
      } catch { /* a transient poll error must not imply consent */ }
      finally { inFlight = false; }
    };
    void check();
    const channel = supabase.channel(`screen-share-invites-${workspace.id}-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_screen_share_sessions", filter: `agent_id=eq.${profile.id}` }, () => void check())
      .subscribe();
    const timer = window.setInterval(() => void check(), 8000);
    return () => { disposed = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [workspace?.id, profile?.id, profile?.role]);

  const sendSignal = useCallback(async (session: TeamScreenShareSession, kind: TeamScreenShareSignal["kind"], payload: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    if (!profile?.id) return;
    await sendTeamScreenShareSignal(session.id, profile.id, kind, payload);
  }, [profile?.id]);

  const createPeer = useCallback((session: TeamScreenShareSession) => {
    const pc = new RTCPeerConnection(iceConfiguration());
    pcRef.current = pc;
    pc.onicecandidate = (event) => {
      if (event.candidate && activeRef.current?.id === session.id) {
        void sendSignal(session, "ice", event.candidate.toJSON()).catch(() => undefined);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && session.viewer_id === profile?.id) setViewerState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (activeRef.current?.id === session.id) {
          if (session.viewer_id === profile?.id && pc.connectionState === "failed") {
            activeRef.current = null;
            clearMedia();
            setViewerState("unsupported");
            void actTeamScreenShare(session.id, "stop").catch(() => undefined);
          } else {
            toast.error("The live connection stopped. Start a new request to try again.");
            stop(session);
          }
        }
      }
    };
    return pc;
  }, [profile?.id, sendSignal, stop, clearMedia]);

  const decline = async () => {
    if (!request) return;
    try { await actTeamScreenShare(request.id, "decline"); }
    catch (declineError: any) { toast.error(declineError?.message || "Could not decline this request."); }
    setRequest(null);
  };

  const accept = async () => {
    if (!request || !workspace?.id || !profile?.id || accepting) return;
    if (!navigator.mediaDevices?.getDisplayMedia || !window.RTCPeerConnection) {
      setError("This browser cannot share an Ecom OS tab. Use Live Activity instead.");
      void actTeamScreenShare(request.id, "unsupported").catch(() => undefined);
      setRequest(null);
      return;
    }
    setAccepting(true);
    setError("");
    let stream: MediaStream | null = null;
    try {
      // This must be the first awaited operation from the Accept click: the
      // browser itself asks the agent to select an Ecom OS tab every time.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" }, audio: false,
        preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude",
      } as DisplayMediaStreamOptions);
      const track = stream.getVideoTracks()[0] as CaptureTrack | undefined;
      if (!track?.getCaptureHandle) {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error("Capture Handle is unsupported in this browser. Use Live Activity instead.");
      }
      if (!track || !verifiedEcomOSTab(track, workspace.id)) {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error("Select this Ecom OS browser tab. Other tabs, windows and screens are not allowed.");
      }
      if (forbiddenDuringCapture.test(window.location.pathname)) throw new Error("Live sharing is unavailable on this private page.");
      const accepted = await actTeamScreenShare(request.id, "accept");
      activeRef.current = accepted;
      streamRef.current = stream;
      setRequest(null);
      setAgentSharing(true);
      track.onended = () => { if (activeRef.current?.id === accepted.id) stop(accepted); };
      track.addEventListener("capturehandlechange", () => {
        if (!verifiedEcomOSTab(track, workspace.id)) stop(accepted);
      });
      const pc = createPeer(accepted);
      stream.getTracks().forEach((item) => pc.addTrack(item, stream!));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(accepted, "offer", offer);
    } catch (captureError: any) {
      stream?.getTracks().forEach((item) => item.stop());
      if (activeRef.current) stop(activeRef.current);
      const message = captureError?.message || "Screen sharing was not started.";
      setError(message);
      if (request && (message.includes("Capture Handle") || message.includes("cannot share"))) {
        void actTeamScreenShare(request.id, "unsupported").catch(() => undefined);
        setRequest(null);
      }
    } finally { setAccepting(false); }
  };

  const processSignal = useCallback(async (session: TeamScreenShareSession, signal: TeamScreenShareSignal) => {
    if (signal.sender_id === profile?.id) return;
    if (signal.kind === "offer" && session.viewer_id === profile?.id) {
      const pc = pcRef.current ?? createPeer(session);
      pc.ontrack = (event) => {
        if (videoRef.current) videoRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        setViewerState("connected");
      };
      await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      for (const candidate of pendingIceRef.current.splice(0)) await pc.addIceCandidate(candidate);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(session, "answer", answer);
    } else if (signal.kind === "answer" && session.agent_id === profile?.id && pcRef.current) {
      await pcRef.current.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      for (const candidate of pendingIceRef.current.splice(0)) await pcRef.current.addIceCandidate(candidate);
    } else if (signal.kind === "ice") {
      const candidate = signal.payload as RTCIceCandidateInit;
      if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(candidate);
      else pendingIceRef.current.push(candidate);
    }
  }, [profile?.id, createPeer, sendSignal]);

  useEffect(() => {
    if (!viewing?.id && !agentSharing) return;
    let disposed = false;
    const tick = async () => {
      const session = activeRef.current;
      if (disposed || !session || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const current = await getTeamScreenShareSession(session.id);
        if (!current || current.status === "declined" || current.status === "stopped" || current.status === "unsupported" || Date.parse(current.expires_at) <= Date.now()) {
          if (session.viewer_id === profile?.id) {
            activeRef.current = null;
            clearMedia();
            setViewerState(current?.status === "declined" ? "declined" : current?.status === "unsupported" ? "unsupported" : "stopped");
          } else stop(session, false);
          return;
        }
        activeRef.current = current;
        if (current.status === "accepted") {
          if (session.viewer_id === profile?.id && viewerState === "pending") setViewerState("connecting");
          if (session.viewer_id === profile?.id && current.agent_seen_at
            && Date.now() - Date.parse(current.agent_seen_at) > 20_000) {
            activeRef.current = null;
            clearMedia();
            setViewerState("stopped");
            void actTeamScreenShare(current.id, "stop").catch(() => undefined);
            return;
          }
          if (session.agent_id === profile?.id && current.viewer_seen_at
            && Date.now() - Date.parse(current.viewer_seen_at) > 20_000) {
            stop(current);
            return;
          }
          const signals = await listTeamScreenShareSignals(current.id, lastSignalRef.current);
          for (const signal of signals) {
            lastSignalRef.current = Math.max(lastSignalRef.current, signal.id);
            await processSignal(current, signal);
          }
        }
        if (Date.now() - heartbeatAtRef.current > 5000) {
          heartbeatAtRef.current = Date.now();
          await actTeamScreenShare(current.id, "heartbeat");
        }
      } catch (pollError: any) {
        if (!disposed) setError(pollError?.message || "Live sharing connection lost.");
      } finally { pollingRef.current = false; }
    };
    void tick();
    const sessionId = viewing?.id ?? activeRef.current?.id;
    const channel = sessionId ? supabase.channel(`screen-share-signals-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_screen_share_sessions", filter: `id=eq.${sessionId}` }, () => void tick())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_screen_share_signals", filter: `session_id=eq.${sessionId}` }, () => void tick())
      .subscribe() : null;
    const timer = window.setInterval(() => void tick(), 3000);
    return () => { disposed = true; window.clearInterval(timer); if (channel) void supabase.removeChannel(channel); };
  }, [viewing?.id, agentSharing, processSignal, profile?.id, stop, clearMedia, viewerState]);

  useEffect(() => {
    if (agentSharing && forbiddenDuringCapture.test(location.pathname)) stop();
    if (viewing && location.pathname !== "/team") stop();
  }, [agentSharing, viewing, location.pathname, stop]);

  useEffect(() => () => {
    const session = activeRef.current;
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (session) void actTeamScreenShare(session.id, "stop").catch(() => undefined);
  }, []);

  return <>
    {request && !agentSharing && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Screen sharing request">
      <div className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-6 text-ink shadow-2xl">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-brand/10 p-2.5 text-brand"><MonitorUp size={22} /></span><div><h2 className="text-lg font-bold">Owner requests to view your Ecom OS screen</h2><p className="text-xs text-ink-muted">This request expires shortly. Nothing is shared until you approve and choose this Ecom OS tab in your browser.</p></div></div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</p>}
        <div className="mt-5 flex gap-2"><button type="button" onClick={() => void decline()} className="flex-1 rounded-xl border border-base-border px-4 py-3 text-sm font-semibold">Decline</button><button type="button" disabled={accepting} onClick={() => void accept()} className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{accepting ? "Choose Ecom OS tab…" : "Accept & choose tab"}</button></div>
      </div>
    </div>}
    {agentSharing && <div role="status" className="fixed bottom-20 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 shadow-xl dark:bg-rose-950"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" /> Ecom OS tab is being shared <button type="button" onClick={() => stop()} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-white"><Square size={13} /> Stop Sharing</button></div>}
    {viewing && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Watch agent live">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-base-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-base-border p-4"><div><h2 className="flex items-center gap-2 font-bold text-ink"><MonitorUp size={18} className="text-brand" /> Watch Live · {watchedAgentNameRef.current}</h2><p className="text-xs text-ink-muted">{viewerState === "pending" ? "Waiting for this agent to accept and choose the Ecom OS tab." : viewerState === "connecting" ? "Agent accepted. Connecting live view…" : viewerState === "connected" ? "Live Ecom OS tab · no video is saved" : viewerState === "declined" ? "Agent declined this request." : viewerState === "unsupported" ? "Screen sharing is unsupported in this browser." : "The sharing session ended."}</p></div><button type="button" onClick={() => stop()} aria-label="Close live view" className="rounded-lg p-2 text-ink-muted hover:bg-base-raised"><X size={20} /></button></div>
        <div className="relative flex min-h-[280px] items-center justify-center bg-slate-950"><video ref={videoRef} autoPlay playsInline muted className="max-h-[calc(92vh-125px)] w-full object-contain" />{viewerState !== "connected" && <p className="absolute text-center text-sm text-white/80">{viewerState === "pending" ? "Waiting for agent approval…" : viewerState === "connecting" ? "Connecting…" : "No active screen share"}</p>}</div>
        <div className="flex items-center justify-between gap-2 border-t border-base-border p-3 text-xs text-ink-muted"><span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Agent consent is required for every session. If WebRTC cannot connect, use Live Activity.</span><button type="button" onClick={() => stop()} className="rounded-lg border border-base-border px-3 py-2 font-semibold text-ink">Stop watching</button></div>
      </div>
    </div>}
  </>;
}
