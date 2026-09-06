#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { GoogleAuthProvider } from "./auth/google-auth.js";
import {
  assertHttpSecurity,
  DEFAULT_HTTP_PATH,
  isAllowedHostname,
  isRailwayEnv,
  loadConfig,
  requiresHttpToken,
  resolveAllowedHosts,
  resolveHttpHost,
  resolveHttpPort,
  type AppConfig,
} from "./config/configuration.js";
import { AppError } from "./errors/app-error.js";
import { DocsClient } from "./google/docs-client.js";
import { GmailClient } from "./google/gmail-client.js";
import { SERVER_NAME, createMcpServer } from "./server/mcp-server.js";
import { GmailService } from "./services/gmail-service.js";
import { DocsService } from "./services/google-docs-service.js";
import { createLogger, type Logger } from "./utils/logger.js";

loadDotenv({ path: ".env", override: false });

export const HEALTH_BODY = {
  status: "ok" as const,
  server: SERVER_NAME,
  transport: "http" as const,
};

export interface CliOptions {
  transport: "stdio" | "http";
  host: string;
  port: number;
  path: string;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions {
  const options: CliOptions = {
    transport: env.MCP_TRANSPORT === "stdio" ? "stdio" : isRailwayEnv(env) || env.MCP_TRANSPORT === "http" ? "http" : "stdio",
    host: resolveHttpHost(env),
    port: resolveHttpPort(env),
    path: env.MCP_HTTP_PATH?.trim() || DEFAULT_HTTP_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--transport" && next) {
      options.transport = next === "http" ? "http" : "stdio";
      i += 1;
    } else if (arg === "--host" && next) {
      options.host = next;
      i += 1;
    } else if (arg === "--port" && next) {
      options.port = Number(next);
      i += 1;
    } else if (arg === "--path" && next) {
      options.path = next.startsWith("/") ? next : `/${next}`;
      i += 1;
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new AppError("VALIDATION_ERROR", "--port must be an integer between 1 and 65535.");
  }

  return options;
}

export function buildRuntime(config: AppConfig, logger: Logger) {
  const credentials = new GoogleAuthProvider(config);
  const gmailService = new GmailService(new GmailClient(credentials));
  const docsService = new DocsService(new DocsClient(credentials));
  return createMcpServer({ gmailService, docsService, logger });
}

export function allowedHostsForBind(config: AppConfig, bindHost: string, env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([...config.allowedHosts, ...resolveAllowedHosts(env, bindHost)])];
}

async function startStdio(config: AppConfig, logger: Logger): Promise<void> {
  const server = buildRuntime(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server listening on stdio");
}

export function createHttpServer(
  config: AppConfig,
  options: CliOptions,
  logger: Logger,
  env: NodeJS.ProcessEnv = process.env,
): Server {
  assertHttpSecurity(options.host, config.httpToken);
  const path = options.path;
  const allowedHosts = allowedHostsForBind(config, options.host, env);

  return createServer(async (req, res) => {
    try {
      const pathname = urlPath(req);

      if (req.method === "GET" && pathname === "/health") {
        writeJson(res, 200, HEALTH_BODY);
        return;
      }

      if (!isRequestHostAllowed(req, allowedHosts)) {
        writeJson(res, 421, { error: "Invalid host header" });
        return;
      }

      if (req.method === "OPTIONS" && pathname === path) {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }

      if (pathname !== path) {
        writeJson(res, 404, { error: "Not found" });
        return;
      }

      const tokenRequired = Boolean(config.httpToken) || requiresHttpToken(options.host);
      if (tokenRequired && (!config.httpToken || !hasValidToken(req, config.httpToken))) {
        writeJson(res, 401, { error: "Unauthorized" });
        return;
      }

      const body = req.method === "POST" ? await readJsonBody(req) : undefined;
      const server = buildRuntime(config, logger);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableDnsRebindingProtection: true,
        allowedHosts,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      logger.error(`HTTP request failed: ${err instanceof Error ? err.message : "unknown"}`);
      if (!res.headersSent) {
        writeJson(res, 500, { error: "Internal server error" });
      }
    }
  });
}

async function startHttp(config: AppConfig, options: CliOptions, logger: Logger): Promise<void> {
  const httpServer = createHttpServer(config, options, logger);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => resolve());
  });
  logger.info(`MCP server listening on http://${options.host}:${options.port}${options.path}`);
}

function urlPath(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

export function isRequestHostAllowed(req: IncomingMessage, allowedHosts: string[]): boolean {
  const header = req.headers.host;
  if (!header) {
    return true;
  }
  const hostname = header.split(":")[0]?.toLowerCase() ?? "";
  return isAllowedHostname(hostname, allowedHosts);
}

function hasValidToken(req: IncomingMessage, expected: string): boolean {
  const header = req.headers.authorization;
  if (header === `Bearer ${expected}`) {
    return true;
  }
  return req.headers["x-mcp-token"] === expected;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MCP-Token, MCP-Session-Id",
  };
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const extra = status === 204 ? corsHeaders() : { "Content-Type": "application/json" };
  res.writeHead(status, extra);
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw);
}

export async function main(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const options = parseArgs(argv, env);
  const config = loadConfig({ env });
  const logger = createLogger(config.logLevel);

  if (options.transport === "http") {
    await startHttp(config, options, logger);
    return;
  }
  await startStdio(config, logger);
}

const isMain = Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);

if (isMain) {
  main().catch((err) => {
    const message = err instanceof AppError ? err.message : "Failed to start MCP server.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
