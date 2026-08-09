export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  // The request was well formed and refused anyway: too many attempts, a uniqueness
  // clash, or a dependency this deployment was never given. Collapsing these into
  // BAD_REQUEST loses the only thing the caller can act on.
  | "RATE_LIMITED"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"
  // A database outage is not a missing row. Callers already throw this code;
  // it belongs in the union so the distinction survives type checking.
  | "DATABASE_ERROR"
  | "XAI_ERROR"
  | "XAI_COLLECTION_FAILED"
  | "KNOWLEDGE_INGESTION_FAILED"
  | "CHAT_FAILED"
  | "VOICE_TOKEN_FAILED"
  | "MCP_FAILED"
  | "EMAIL_FAILED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  recoverable: boolean;
  details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { status?: number; recoverable?: boolean; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = options?.status ?? 400;
    this.recoverable = options?.recoverable ?? true;
    this.details = options?.details;
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }

  console.error("[api] unexpected error", error);
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unexpected server error",
        recoverable: false,
      },
    },
    { status: 500 },
  );
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}
