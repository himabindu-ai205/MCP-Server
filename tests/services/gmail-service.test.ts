import { describe, expect, it } from "vitest";
import { AppError } from "../../src/errors/app-error.js";
import { GmailService } from "../../src/services/gmail-service.js";
import { mockGmail, validEmailInput } from "../helpers.js";

describe("GmailService", () => {
  it("creates a draft after validation", async () => {
    const gmail = mockGmail();
    const service = new GmailService(gmail);
    await expect(service.createDraft(validEmailInput())).resolves.toEqual({
      draftId: "gmail-draft-id",
    });
    expect(gmail.calls).toEqual(["createDraft"]);
  });

  it("sends an email after validation", async () => {
    const gmail = mockGmail();
    const service = new GmailService(gmail);
    await expect(service.send(validEmailInput())).resolves.toEqual({
      messageId: "gmail-message-id",
      threadId: "gmail-thread-id",
    });
    expect(gmail.calls).toEqual(["send"]);
  });

  it("rejects a missing recipient without calling Google", async () => {
    const gmail = mockGmail();
    const service = new GmailService(gmail);
    await expect(service.send({ ...validEmailInput(), to: [] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(gmail.calls).toEqual([]);
  });

  it("rejects an invalid email without calling Google", async () => {
    const gmail = mockGmail();
    const service = new GmailService(gmail);
    await expect(service.send({ ...validEmailInput(), to: ["not-an-email"] })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(service.send({ ...validEmailInput(), to: ["not-an-email"] })).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });
    expect(gmail.calls).toEqual([]);
  });

  it("rejects invalid cc/bcc and empty subject or body locally", async () => {
    const gmail = mockGmail();
    const service = new GmailService(gmail);
    await expect(
      service.createDraft({ ...validEmailInput(), cc: ["bad"] }),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    await expect(
      service.createDraft({ ...validEmailInput(), subject: "   " }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.createDraft({ ...validEmailInput(), body: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(gmail.calls).toEqual([]);
  });

  it("propagates Gmail API failures", async () => {
    const gmail = mockGmail({
      async send() {
        throw new AppError("GOOGLE_API_ERROR", "Google API request failed.");
      },
    });
    const service = new GmailService(gmail);
    await expect(service.send(validEmailInput())).rejects.toMatchObject({
      code: "GOOGLE_API_ERROR",
    });
  });

  it("propagates authentication failures", async () => {
    const gmail = mockGmail({
      async createDraft() {
        throw new AppError("AUTHENTICATION_FAILED", "Unable to authenticate with Google.");
      },
    });
    const service = new GmailService(gmail);
    await expect(service.createDraft(validEmailInput())).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
    });
  });
});
