import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorEnvelope, type ToolEnvelope } from "../errors/app-error.js";
import type { Logger } from "../utils/logger.js";
import { createLogger } from "../utils/logger.js";
import type { GmailService } from "../services/gmail-service.js";
import type { DocsService } from "../services/google-docs-service.js";
import {
  CREATE_EMAIL_DRAFT_DESCRIPTION,
  SEND_EMAIL_DESCRIPTION,
  emailToolInputShape,
  runCreateEmailDraft,
  runSendEmail,
} from "../tools/gmail-tools.js";
import {
  APPEND_TO_GOOGLE_DOC_DESCRIPTION,
  appendDocInputShape,
  runAppendToGoogleDoc,
} from "../tools/google-docs-tools.js";

export const SERVER_NAME = "gmail";
export const SERVER_VERSION = "1.0.0";

export const TOOL_NAMES = ["create_email_draft", "send_email", "append_to_google_doc"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ServerDependencies {
  gmailService: GmailService;
  docsService: DocsService;
  logger?: Logger;
}

export function unknownToolEnvelope(name: string): ToolEnvelope {
  return errorEnvelope("UNKNOWN_TOOL", `Unknown tool: ${name}`);
}

export function createMcpServer(deps: ServerDependencies): McpServer {
  const logger = deps.logger ?? createLogger("info");
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.tool(
    "create_email_draft",
    CREATE_EMAIL_DRAFT_DESCRIPTION,
    emailToolInputShape,
    async (args) => {
      logger.info("Tool invoked: create_email_draft");
      const envelope = await runCreateEmailDraft(deps.gmailService, args);
      logOutcome(logger, "create_email_draft", envelope);
      return toMcpResult(envelope);
    },
  );

  server.tool(
    "send_email",
    SEND_EMAIL_DESCRIPTION,
    emailToolInputShape,
    async (args) => {
      logger.info("Tool invoked: send_email");
      const envelope = await runSendEmail(deps.gmailService, args);
      logOutcome(logger, "send_email", envelope);
      return toMcpResult(envelope);
    },
  );

  server.tool(
    "append_to_google_doc",
    APPEND_TO_GOOGLE_DOC_DESCRIPTION,
    appendDocInputShape,
    async (args) => {
      logger.info("Tool invoked: append_to_google_doc");
      const envelope = await runAppendToGoogleDoc(deps.docsService, args);
      logOutcome(logger, "append_to_google_doc", envelope);
      return toMcpResult(envelope);
    },
  );

  return server;
}

function toMcpResult(envelope: ToolEnvelope) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    isError: envelope.success === false,
  };
}

function logOutcome(logger: Logger, tool: string, envelope: ToolEnvelope): void {
  if (envelope.success) {
    const extra =
      "draftId" in envelope
        ? ` draftId=${String(envelope.draftId)}`
        : "messageId" in envelope
          ? ` messageId=${String(envelope.messageId)}`
          : "documentId" in envelope
            ? ` documentId=${String(envelope.documentId)}`
            : "";
    logger.info(`[${tool}] success${extra}`);
    return;
  }
  if (envelope.error.code === "AUTHENTICATION_FAILED") {
    logger.warn("Authentication failure");
  } else if (envelope.error.code === "VALIDATION_ERROR" || envelope.error.code === "INVALID_EMAIL") {
    logger.info("Validation failure");
  } else {
    logger.warn("Google API request failed");
  }
  logger.info(`[${tool}] ${envelope.error.code}`);
}
