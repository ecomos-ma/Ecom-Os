import { supabase } from "../lib/supabase";

export type TeamScreenShareSession = {
  id: string;
  workspace_id: string;
  viewer_id: string;
  agent_id: string;
  status: "requested" | "accepted" | "declined" | "stopped" | "unsupported";
  created_at: string;
  expires_at: string;
  viewer_seen_at: string | null;
  agent_seen_at: string | null;
};

export type TeamScreenShareSignal = {
  id: number;
  session_id: string;
  sender_id: string;
  kind: "offer" | "answer" | "ice";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export async function requestTeamScreenShare(workspaceId: string, agentId: string) {
  const { data, error } = await supabase.rpc("request_team_screen_share", {
    p_workspace_id: workspaceId,
    p_agent_id: agentId,
  });
  if (error) throw error;
  return data as TeamScreenShareSession;
}

export async function actTeamScreenShare(sessionId: string, action: "accept" | "decline" | "unsupported" | "stop" | "heartbeat") {
  const { data, error } = await supabase.rpc("act_team_screen_share", {
    p_session_id: sessionId,
    p_action: action,
  });
  if (error) throw error;
  return data as TeamScreenShareSession;
}

export async function getTeamScreenShareSession(sessionId: string) {
  const { data, error } = await supabase.from("team_screen_share_sessions")
    .select("id,workspace_id,viewer_id,agent_id,status,created_at,expires_at,viewer_seen_at,agent_seen_at")
    .eq("id", sessionId).maybeSingle();
  if (error) throw error;
  return data as TeamScreenShareSession | null;
}

export async function getPendingTeamScreenShare(agentId: string, workspaceId: string) {
  const { data, error } = await supabase.from("team_screen_share_sessions")
    .select("id,workspace_id,viewer_id,agent_id,status,created_at,expires_at,viewer_seen_at,agent_seen_at")
    .eq("agent_id", agentId).eq("workspace_id", workspaceId)
    .eq("status", "requested")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as TeamScreenShareSession | null;
}

export async function listTeamScreenShareSignals(sessionId: string, afterId: number) {
  const { data, error } = await supabase.from("team_screen_share_signals")
    .select("id,session_id,sender_id,kind,payload")
    .eq("session_id", sessionId).gt("id", afterId).order("id", { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []) as TeamScreenShareSignal[];
}

export async function sendTeamScreenShareSignal(
  sessionId: string, senderId: string, kind: TeamScreenShareSignal["kind"],
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit,
) {
  const { error } = await supabase.from("team_screen_share_signals")
    .insert({ session_id: sessionId, sender_id: senderId, kind, payload });
  if (error) throw error;
}
