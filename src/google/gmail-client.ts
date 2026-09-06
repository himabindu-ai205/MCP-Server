import { google, type gmail_v1 } from "googleapis";
import type { CredentialProvider } from "../auth/google-auth.js";
import { mapGoogleError } from "../errors/app-error.js";
import type { EmailInput } from "../utils/validators.js";
import { buildMimeMessage, toBase64Url } from "../utils/mime.js";

export interface GmailDraftResult {
  draftId: string;
}

export interface GmailSendResult {
  messageId: string;
  threadId: string;
}

export interface GmailApi {
  createDraft(input: EmailInput): Promise<GmailDraftResult>;
  send(input: EmailInput): Promise<GmailSendResult>;
}

export class GmailClient implements GmailApi {
  constructor(private readonly credentials: CredentialProvider) {}

  async createDraft(input: EmailInput): Promise<GmailDraftResult> {
    try {
      const gmail = await this.gmail();
      const raw = toBase64Url(buildMimeMessage(input));
      const response = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw,
            threadId: input.threadId,
          },
        },
      });
      const draftId = response.data.id;
      if (!draftId) {
        throw mapGoogleError(new Error("missing draft id"), "gmail");
      }
      return { draftId };
    } catch (err) {
      throw mapGoogleError(err, "gmail");
    }
  }

  async send(input: EmailInput): Promise<GmailSendResult> {
    try {
      const gmail = await this.gmail();
      const raw = toBase64Url(buildMimeMessage(input));
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: input.threadId,
        },
      });
      const messageId = response.data.id;
      const threadId = response.data.threadId;
      if (!messageId || !threadId) {
        throw mapGoogleError(new Error("missing message id"), "gmail");
      }
      return { messageId, threadId };
    } catch (err) {
      throw mapGoogleError(err, "gmail");
    }
  }

  private async gmail(): Promise<gmail_v1.Gmail> {
    const auth = await this.credentials.getAuthClient();
    return google.gmail({ version: "v1", auth });
  }
}
