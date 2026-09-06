export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "client_secret",
  "authorization",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "MCP_HTTP_TOKEN",
];

const SECRET_PATTERN = new RegExp(
  `(${SECRET_KEYS.join("|")})(["']?\\s*[:=]\\s*)([^\\s,;}"']+)`,
  "gi",
);

export function redact(value: string): string {
  return value.replace(SECRET_PATTERN, "$1$2[REDACTED]");
}

export function createLogger(level: LogLevel = "info") {
  const min = LEVEL_RANK[level];

  function write(next: LogLevel, message: string): void {
    if (LEVEL_RANK[next] < min) {
      return;
    }
    process.stderr.write(`[${next}] ${redact(message)}\n`);
  }

  return {
    debug: (message: string) => write("debug", message),
    info: (message: string) => write("info", message),
    warn: (message: string) => write("warn", message),
    error: (message: string) => write("error", message),
  };
}

export type Logger = ReturnType<typeof createLogger>;
