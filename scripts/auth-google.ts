import { createServer } from "node:http";
import { exec } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { google } from "googleapis";
import { OAUTH_SCOPES } from "../src/config/configuration.js";
import { AppError } from "../src/errors/app-error.js";

loadDotenv({ path: ".env", override: false });

const TOKEN_PATH = resolve("token.json");
const CREDENTIAL_FILES = ["credential.json", "credentials.json"];

interface InstalledClient {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

function loadInstalledClient(): InstalledClient {
  for (const file of CREDENTIAL_FILES) {
    if (!existsSync(file)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      installed?: InstalledClient;
      web?: InstalledClient;
    };
    const client = parsed.installed ?? parsed.web;
    if (client?.client_id && client.client_secret) {
      return client;
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    return {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [process.env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3000"],
    };
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Missing credential.json (or credentials.json) and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
  );
}

function resolveListenTarget(client: InstalledClient): { port: number; redirectUri: string } {
  const registered = client.redirect_uris?.[0] ?? "http://localhost";
  const url = new URL(registered.includes("://") ? registered : `http://${registered}`);
  const port = Number(url.port || process.env.GOOGLE_OAUTH_PORT || 3000);
  url.port = String(port);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/";
  }
  return { port, redirectUri: url.toString().replace(/\/$/, url.pathname === "/" ? "" : "") };
}

function writeTokenFile(tokens: Record<string, unknown>): void {
  writeFileSync(TOKEN_PATH, `${JSON.stringify(tokens, null, 2)}\n`, { encoding: "utf8" });
}

function upsertEnvRefreshToken(refreshToken: string): void {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) {
    return;
  }
  const current = readFileSync(envPath, "utf8");
  const next = current.includes("GOOGLE_REFRESH_TOKEN=")
    ? current.replace(/GOOGLE_REFRESH_TOKEN=.*/m, `GOOGLE_REFRESH_TOKEN=${refreshToken}`)
    : `${current.trimEnd()}\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`;
  writeFileSync(envPath, next, { encoding: "utf8" });
}

async function main(): Promise<void> {
  const client = loadInstalledClient();
  const { port, redirectUri } = resolveListenTarget(client);
  const redirect = new URL(redirectUri.includes("://") ? redirectUri : `http://${redirectUri}`);
  const pathname = redirect.pathname || "/";

  const oauth2Client = new google.auth.OAuth2(client.client_id, client.client_secret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...OAUTH_SCOPES],
  });

  const code = await waitForCode(port, pathname, authUrl);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    throw new AppError(
      "AUTHENTICATION_FAILED",
      "Google did not return a refresh token. Revoke the app at https://myaccount.google.com/permissions and retry.",
    );
  }

  writeTokenFile(tokens as Record<string, unknown>);
  upsertEnvRefreshToken(tokens.refresh_token);
  process.stdout.write(`Wrote ${TOKEN_PATH}\n`);
}

function waitForCode(port: number, pathname: string, authUrl: string): Promise<string> {
  return new Promise((resolveCode, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        const incomingPath = url.pathname === "" ? "/" : url.pathname;
        const expectedPath = pathname === "" ? "/" : pathname;
        if (incomingPath !== expectedPath && incomingPath !== "/") {
          res.writeHead(404).end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400).end("Authorization failed. You can close this window.");
          server.close();
          reject(new AppError("AUTHENTICATION_FAILED", `Google authorization failed: ${error}`));
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400).end("Missing authorization code.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Authorization complete. You can close this window and return to the terminal.");
        server.close();
        resolveCode(code);
      } catch (err) {
        reject(err);
      }
    });

    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      process.stderr.write(`Waiting for Google consent on http://127.0.0.1:${port}${pathname}\n`);
      process.stderr.write(`${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

function openBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "Authorization failed."}\n`);
  process.exit(1);
});
