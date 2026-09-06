import type { GmailApi, GmailDraftResult, GmailSendResult } from "../google/gmail-client.js";
import { parseEmailInput, type EmailInput } from "../utils/validators.js";

export class GmailService {
  constructor(private readonly client: GmailApi) {}

  async createDraft(input: unknown): Promise<GmailDraftResult> {
    const parsed: EmailInput = parseEmailInput(input);
    return this.client.createDraft(parsed);
  }

  async send(input: unknown): Promise<GmailSendResult> {
    const parsed: EmailInput = parseEmailInput(input);
    return this.client.send(parsed);
  }
}
