import { config as loadDotenv } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { google } from "googleapis";
import { GoogleAuthProvider } from "../src/auth/google-auth.js";
import { loadConfig } from "../src/config/configuration.js";
import { buildRuntime } from "../src/index.js";
import { createLogger } from "../src/utils/logger.js";

loadDotenv({ path: ".env", override: false });

async function resolveAuthorizedEmail(): Promise<string> {
  const config = loadConfig();
  const auth = new GoogleAuthProvider(config);
  const client = await auth.getAuthClient();

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    if (me.data.email) {
      return me.data.email;
    }
  } catch {
    // compose-only tokens may not include userinfo
  }

  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.emailAddress) {
      return profile.data.emailAddress;
    }
  } catch {
    // gmail.compose may not allow getProfile
  }

  throw new Error(
    "Could not read the authorized Gmail address. Pass a recipient as the first argument.",
  );
}

async function main(): Promise<void> {
  const recipient = process.argv[2] || (await resolveAuthorizedEmail());
  const config = loadConfig();
  const server = buildRuntime(config, createLogger("error"));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "draft-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "create_email_draft",
    arguments: {
      to: [recipient],
      subject: "MCP server draft test",
      body: "This is a Gmail draft created by the MCP create_email_draft tool. It was not sent.",
    },
  });

  const text = result.content.find((block) => block.type === "text" && "text" in block);
  const envelope = text && "text" in text ? JSON.parse(String(text.text)) : {};
  process.stdout.write(`${JSON.stringify({ to: recipient, result: envelope }, null, 2)}\n`);

  await client.close();
  await server.close();

  if (envelope.success !== true) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "Draft failed."}\n`);
  process.exit(1);
});
