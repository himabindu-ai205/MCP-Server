import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { config as loadDotenv } from "dotenv";
import { GoogleAuthProvider } from "../src/auth/google-auth.js";
import { loadConfig } from "../src/config/configuration.js";
import { buildRuntime } from "../src/index.js";
import { createLogger } from "../src/utils/logger.js";

loadDotenv({ path: ".env", override: false });

function fail(step: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`FAIL ${step}: ${message}\n`);
  process.exit(1);
}

function ok(step: string, detail = ""): void {
  process.stdout.write(`PASS ${step}${detail ? ` — ${detail}` : ""}\n`);
}

async function main(): Promise<void> {
  if (!existsSync("token.json") && !process.env.GOOGLE_REFRESH_TOKEN) {
    fail("credentials", "token.json and GOOGLE_REFRESH_TOKEN are both missing");
  }
  ok("credentials", existsSync("token.json") ? "token.json present" : "refresh token in env");

  const config = loadConfig();
  ok("config", "environment loaded");

  const auth = new GoogleAuthProvider(config);
  await auth.getAuthClient();
  ok("google-oauth", "access token refreshed");

  const logger = createLogger("error");
  const server = buildRuntime(config, logger);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "verify-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  ok("mcp-connect", "in-memory client connected");

  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  const expected = ["append_to_google_doc", "create_email_draft", "send_email"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail("tools/list", `got ${names.join(", ")}`);
  }
  ok("tools/list", names.join(", "));

  const invalid = await client.callTool({
    name: "send_email",
    arguments: { to: ["not-an-email"], subject: "ping", body: "ping" },
  });
  const text = invalid.content.find((block) => block.type === "text" && "text" in block);
  const envelope = text && "text" in text ? JSON.parse(String(text.text)) : {};
  if (envelope?.error?.code !== "INVALID_EMAIL") {
    fail("tool-validation", JSON.stringify(envelope));
  }
  ok("tool-validation", "INVALID_EMAIL rejected locally");

  await client.close();
  await server.close();
  ok("overall", "MCP server is working");
}

main().catch((err) => fail("verify", err));
