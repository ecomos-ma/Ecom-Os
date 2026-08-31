export const ErrorCode = Object.freeze({
  PROVIDER_INIT_FAILED: "PROVIDER_INIT_FAILED",
  PROVIDER_DISCONNECTED: "PROVIDER_DISCONNECTED",
  AUTH_SESSION_INVALID: "AUTH_SESSION_INVALID",
  RECIPIENT_INVALID: "RECIPIENT_INVALID",
  MEDIA_DOWNLOAD_FAILED: "MEDIA_DOWNLOAD_FAILED",
  MEDIA_SEND_FAILED: "MEDIA_SEND_FAILED",
  QUEUE_CONTEXT_MISSING: "QUEUE_CONTEXT_MISSING",
  RATE_LIMITED: "RATE_LIMITED",
  DELIVERY_UNKNOWN: "DELIVERY_UNKNOWN",
  DATABASE_ERROR: "DATABASE_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
});

export class WorkerError extends Error {
  constructor(code, message, { cause, httpStatus = 500, retryable = false, deliveryUnknown = false } = {}) {
    super(message, { cause });
    this.name = "WorkerError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.deliveryUnknown = deliveryUnknown;
  }
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export function publicError(error) {
  return {
    ok: false,
    error: errorMessage(error),
    code: error?.code || "INTERNAL_ERROR",
  };
}
