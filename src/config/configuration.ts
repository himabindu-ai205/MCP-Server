import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../errors/app-error.js";
import type { LogLevel } from "../utils/logger.js";

export const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";
export const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const OAUTH_SCOPES = [GMAIL_COMPOSE_SCOPE, DOCS_SCOPE, USERINFO_EMAIL_SCOPE] as const;

export const DEFAULT_HTTP_PATH = "/mcp";
export const DEFAULT_HTTP_PORT = 8787;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const RAILWAY_HOST_SUFFIXES = [".up.railway.app", ".railway.internal"];

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  googleRefreshToken: string;
  googleAccountEmail?: string;
  logLevel: LogLevel;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpToken?: string;
  allowedHosts: string[];
  railway: boolean;
}

export interface LoadConfigOptions {
  requireRefreshToken?: boolean;
  env?: NodeJS.ProcessEnv;
}

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

export function isRailwayEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.RAILWAY_ENVIRONMENT?.trim() || env.RAILWAY_ENVIRONMENT_NAME?.trim());
}

export function isLoopbackBind(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

export function requiresHttpToken(bindHost: string): boolean {
  return !isLoopbackBind(bindHost);
}

export function resolveHttpHost(env: NodeJS.ProcessEnv): string {
  const explicit = env.MCP_HTTP_HOST?.trim();
  if (explicit) {
    return explicit;
  }
  return isRailwayEnv(env) ? "0.0.0.0" : "127.0.0.1";
}

export function resolveHttpPort(env: NodeJS.ProcessEnv, fallback = DEFAULT_HTTP_PORT): number {
  return parsePort(env.MCP_HTTP_PORT || env.PORT, fallback);
}

export function resolveAllowedHosts(env: NodeJS.ProcessEnv, bindHost: string): string[] {
  const hosts = new Set<string>(["127.0.0.1", "localhost", "::1"]);
  if (bindHost && bindHost !== "0.0.0.0" && bindHost !== "::") {
    hosts.add(bindHost.toLowerCase());
  }
  const publicDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim().toLowerCase();
  if (publicDomain) {
    hosts.add(publicDomain);
  }
  for (const part of env.MCP_ALLOWED_HOSTS?.split(",") ?? []) {
    const host = part.trim().toLowerCase();
    if (host) {
      hosts.add(host);
    }
  }
  return [...hosts];
}

export function isAllowedHostname(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  if (allowedHosts.includes(host)) {
    return true;
  }
  for (const pattern of allowedHosts) {
    if (pattern.startsWith("*.") && host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1) {
      return true;
    }
  }
  return RAILWAY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}

export function assertHttpSecurity(bindHost: string, httpToken?: string): void {
  if (requiresHttpToken(bindHost) && !httpToken) {
    throw new AppError(
      "VALIDATION_ERROR",
      "MCP_HTTP_TOKEN is required when binding a non-loopback address.",
    );
  }
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const requireRefreshToken = options.requireRefreshToken ?? true;
  const railway = isRailwayEnv(env);

  const googleClientId = required(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = required(env, "GOOGLE_CLIENT_SECRET");
  const googleRedirectUri = env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3000";
  const allowTokenFile = !options.env && !railway;
  const googleRefreshToken = env.GOOGLE_REFRESH_TOKEN?.trim() || (allowTokenFile ? readRefreshTokenFromFile() : "");

  if (requireRefreshToken && !googleRefreshToken) {
    throw new AppError(
      "AUTHENTICATION_FAILED",
      "GOOGLE_REFRESH_TOKEN is required. Run `npm run auth` once, then set the token in the environment.",
    );
  }

  const logLevelRaw = (env.LOG_LEVEL?.trim().toLowerCase() ?? "info") as LogLevel;
  const logLevel = LOG_LEVELS.has(logLevelRaw) ? logLevelRaw : "info";
  const httpHost = resolveHttpHost(env);

  return {
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    googleRefreshToken,
    googleAccountEmail: env.GOOGLE_ACCOUNT_EMAIL?.trim() || undefined,
    logLevel,
    httpHost,
    httpPort: resolveHttpPort(env),
    httpPath: normalizePath(env.MCP_HTTP_PATH?.trim() || DEFAULT_HTTP_PATH),
    httpToken: env.MCP_HTTP_TOKEN?.trim() || undefined,
    allowedHosts: resolveAllowedHosts(env, httpHost),
    railway,
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new AppError("VALIDATION_ERROR", `Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError("VALIDATION_ERROR", "PORT / MCP_HTTP_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function readRefreshTokenFromFile(): string {
  const tokenPath = resolve("token.json");
  if (!existsSync(tokenPath)) {
    return "";
  }
  try {
    const parsed = JSON.parse(readFileSync(tokenPath, "utf8")) as {
      refresh_token?: string;
    };
    return parsed.refresh_token?.trim() ?? "";
  } catch {
    return "";
  }
}
