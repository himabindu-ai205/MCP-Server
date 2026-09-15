import { z } from "zod";
import { successEnvelope, toErrorEnvelope, type ToolEnvelope } from "../errors/app-error.js";
import type { GmailService } from "../services/gmail-service.js";

export const emailToolInputShape = {
  to: z.array(z.string()).describe("Recipient email addresses. At least one is required."),
  cc: z.array(z.string()).optional().describe("Optional CC recipients."),
  bcc: z.array(z.string()).optional().describe("Optional BCC recipients."),
  subject: z.string().describe("Email subject. Required and must be non-empty."),
  body: z.string().describe("Plain-text email body. Required and must be non-empty."),
  htmlBody: z.string().optional().describe("Optional HTML alternative body."),
  threadId: z.string().optional().describe("Gmail thread id when continuing a thread."),
  inReplyTo: z.string().optional().describe("RFC Message-ID when replying."),
};

export const CREATE_EMAIL_DRAFT_DESCRIPTION =
  "Create a Gmail draft without sending it. The From address is the Google account that authorized this server (GOOGLE_ACCOUNT_EMAIL), not Chrome's signed-in user and not the To recipient. Use this when the user wants to review or edit the message first. Requires to, subject, and body. Supports optional cc, bcc, htmlBody, threadId, and inReplyTo.";

export const SEND_EMAIL_DESCRIPTION =
  "Send an email immediately through Gmail as the Google account that authorized this server (GOOGLE_ACCOUNT_EMAIL), not Chrome's signed-in user. Use this only when the user wants the message delivered now, not saved as a draft. Requires to, subject, and body. Supports optional cc, bcc, htmlBody, threadId, and inReplyTo.";

export async function runCreateEmailDraft(
  service: GmailService,
  args: unknown,
): Promise<ToolEnvelope> {
  try {
    const result = await service.createDraft(args);
    return successEnvelope("Email draft created successfully.", { draftId: result.draftId });
  } catch (err) {
    return toErrorEnvelope(err);
  }
}

export async function runSendEmail(service: GmailService, args: unknown): Promise<ToolEnvelope> {
  try {
    const result = await service.send(args);
    return successEnvelope("Email sent successfully.", {
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (err) {
    return toErrorEnvelope(err);
  }
}
