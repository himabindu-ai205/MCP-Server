import { describe, expect, it } from "vitest";
import { mapGoogleError } from "../../src/errors/app-error.js";
import { redact } from "../../src/utils/logger.js";
import { buildMimeMessage } from "../../src/utils/mime.js";

describe("logger redaction", () => {
  it("redacts token-like fields", () => {
    const raw =
      'access_token=ya29.secret refresh_token=1//secret client_secret=abc GOOGLE_REFRESH_TOKEN=keep-me-out';
    const cleaned = redact(raw);
    expect(cleaned).not.toContain("ya29.secret");
    expect(cleaned).not.toContain("1//secret");
    expect(cleaned).toContain("[REDACTED]");
  });
});

describe("google error mapping", () => {
  it("maps docs 404/403-not-found to DOCUMENT_NOT_FOUND", () => {
    expect(mapGoogleError({ code: 404, message: "not found" }, "docs").code).toBe("DOCUMENT_NOT_FOUND");
    expect(mapGoogleError({ code: 403, message: "Requested entity was not found." }, "docs").code).toBe(
      "DOCUMENT_NOT_FOUND",
    );
  });

  it("maps other Google errors to GOOGLE_API_ERROR", () => {
    expect(mapGoogleError({ code: 500, message: "boom" }, "gmail").code).toBe("GOOGLE_API_ERROR");
    expect(mapGoogleError({ code: 404, message: "not found" }, "gmail").code).toBe("GOOGLE_API_ERROR");
  });
});

describe("mime", () => {
  it("includes recipients and subject without logging secrets", () => {
    const mime = buildMimeMessage({
      to: ["customer@example.com"],
      cc: ["cc@example.com"],
      subject: "Hello",
      body: "Body",
    });
    expect(mime).toContain("To: customer@example.com");
    expect(mime).toContain("Cc: cc@example.com");
    expect(mime).toContain("Subject: Hello");
    expect(mime).toContain("Body");
  });
});
