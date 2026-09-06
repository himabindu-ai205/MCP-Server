import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { GmailApi } from "../src/google/gmail-client.js";
import type { DocsApi } from "../src/google/docs-client.js";
import { createMcpServer } from "../src/server/mcp-server.js";
import { GmailService } from "../src/services/gmail-service.js";
import { DocsService } from "../src/services/google-docs-service.js";
import { createLogger } from "../src/utils/logger.js";

export function validEmailInput() {
  return {
    to: ["customer@example.com"],
    cc: [] as string[],
    bcc: [] as string[],
    subject: "Customer Feedback Summary",
    body: "Here is the summary of the customer feedback...",
  };
}

export function mockGmail(overrides: Partial<GmailApi> = {}): GmailApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createDraft() {
      calls.push("createDraft");
      return { draftId: "gmail-draft-id" };
    },
    async send() {
      calls.push("send");
      return { messageId: "gmail-message-id", threadId: "gmail-thread-id" };
    },
    ...overrides,
  };
}

export function mockDocs(overrides: Partial<DocsApi> = {}): DocsApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async append(documentId: string) {
      calls.push("append");
      return { documentId };
    },
    ...overrides,
  };
}

export async function connectTestClient(gmail: GmailApi, docs: DocsApi) {
  const server = createMcpServer({
    gmailService: new GmailService(gmail),
    docsService: new DocsService(docs),
    logger: createLogger("error"),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

export function parseEnvelope(result: { content: Array<{ type: string; text?: string }> }) {
  const text = result.content.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("missing text content");
  }
  return JSON.parse(text) as Record<string, unknown>;
}
