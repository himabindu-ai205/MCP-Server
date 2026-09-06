export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_EMAIL",
  "DOCUMENT_NOT_FOUND",
  "AUTHENTICATION_FAILED",
  "GOOGLE_API_ERROR",
  "UNKNOWN_TOOL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

export interface SuccessEnvelope {
  success: true;
  message: string;
  [key: string]: unknown;
}

export type ToolEnvelope = SuccessEnvelope | ErrorEnvelope;

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function errorEnvelope(code: ErrorCode, message: string): ErrorEnvelope {
  return { success: false, error: { code, message } };
}

export function successEnvelope(
  message: string,
  extra: Record<string, unknown> = {},
): SuccessEnvelope {
  return { success: true, message, ...extra };
}

export function toErrorEnvelope(err: unknown): ErrorEnvelope {
  if (err instanceof AppError) {
    return errorEnvelope(err.code, err.message);
  }
  return errorEnvelope("GOOGLE_API_ERROR", "Google API request failed.");
}

export function mapGoogleError(err: unknown, surface: "gmail" | "docs"): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const status = extractStatus(err);
  const raw = extractMessage(err);

  if (status === 401 || /invalid_grant|unauthorized|invalid_client/i.test(raw)) {
    return new AppError("AUTHENTICATION_FAILED", "Unable to authenticate with Google.");
  }

  if (surface === "docs" && (status === 404 || (status === 403 && /not found/i.test(raw)))) {
    return new AppError(
      "DOCUMENT_NOT_FOUND",
      "The specified Google document could not be found or accessed.",
    );
  }

  return new AppError("GOOGLE_API_ERROR", "Google API request failed.");
}

function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const record = err as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = record.code ?? record.status ?? record.response?.status;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "";
}
