import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import { ErrorCode, WorkerError } from "../utils/errors.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB

// Mimes accepted by the validation gate (from Supabase bucket config)
const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

// WhatsApp PTT requires Ogg Opus. A bare audio/ogg upload can be Vorbis, so
// only an explicit opus MIME bypasses conversion.
const OGG_OPUS_MIMES = new Set(["audio/ogg;codecs=opus"]);
const FFMPEG_BINARY = process.env.FFMPEG_PATH || ffmpegStatic;

/**
 * Convert audio buffer to ogg/opus using ffmpeg.
 * Returns an Ogg Opus buffer. It never falls back to a source file WhatsApp
 * cannot render as a voice note.
 */
async function convertToOpusOgg(inputBuffer, inputMime) {
  if (OGG_OPUS_MIMES.has(inputMime)) {
    return { buffer: inputBuffer, mimeType: "audio/ogg; codecs=opus" };
  }

  if (!FFMPEG_BINARY) throw new Error("Voice conversion is unavailable because no ffmpeg binary was configured");

  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const chunks = [];
    const proc = spawn(FFMPEG_BINARY, [
      "-loglevel", "error",
      "-i", "pipe:0",
      "-c:a", "libopus",
      "-b:a", "32k",
      "-vbr", "on",
      "-compression_level", "10",
      "-f", "ogg",
      "pipe:1",
    ], { windowsHide: true });

    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("error", (err) => {
      fail(`Voice conversion could not start: ${err.message}`);
    });

    proc.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(`Voice conversion failed (ffmpeg exit ${code}): ${stderr.slice(0, 200)}`);
        return;
      }
      const converted = Buffer.concat(chunks);
      if (!converted.length) {
        fail("Voice conversion produced an empty file");
        return;
      }
      settled = true;
      resolve({ buffer: converted, mimeType: "audio/ogg; codecs=opus" });
    });

    proc.stdin.on("error", () => { }); // Suppress broken pipe
    proc.stdin.end(inputBuffer);
  });
}

/**
 * Download and validate a voice recording, converting to ogg/opus if needed.
 * Returns: { buffer, mimeType, seconds, name }
 */
export async function loadVoiceRecording(repository, workspaceId, recording) {
  try {
    if (!recording || recording.workspace_id !== workspaceId) {
      throw new Error("Recording does not belong to this workspace");
    }

    const mime = (recording.mime_type || "").toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new Error(`Unsupported voice MIME type: ${mime}`);
    }

    const fileSize = Number(recording.file_size);
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_AUDIO_BYTES) {
      throw new Error("Voice recording must be between 1 byte and 10 MB");
    }

    if (!String(recording.storage_path || "").startsWith(`${workspaceId}/`)) {
      throw new Error("Voice storage path is outside the workspace prefix");
    }

    const rawBuffer = await repository.downloadRecording(recording.storage_path);
    if (!rawBuffer.length || rawBuffer.length > MAX_AUDIO_BYTES) {
      throw new Error("Downloaded voice recording is empty or larger than 10 MB");
    }

    // Convert to ogg/opus for real WhatsApp PTT compatibility
    const { buffer, mimeType } = await convertToOpusOgg(rawBuffer, mime);

    return {
      buffer,
      mimeType,
      seconds: recording.duration_seconds ? Number(recording.duration_seconds) : undefined,
      name: recording.name,
      originalMime: mime,
    };
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError(
      ErrorCode.MEDIA_DOWNLOAD_FAILED,
      error?.message || "Voice recording download failed",
      { cause: error, retryable: true },
    );
  }
}
