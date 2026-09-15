import { describe, expect, it } from "vitest";
import {
  assertExpectedGoogleAccount,
  emailFromIdToken,
  googleConsentUrlOptions,
  normalizeEmail,
} from "../../src/auth/google-account.js";
import { USERINFO_EMAIL_SCOPE } from "../../src/config/configuration.js";
import { AppError } from "../../src/errors/app-error.js";

describe("google account pinning", () => {
  it("normalizes emails for comparison", () => {
    expect(normalizeEmail("  Himabindu.A26@Gmail.com ")).toBe("himabindu.a26@gmail.com");
  });

  it("accepts the expected account", () => {
    expect(() =>
      assertExpectedGoogleAccount("himabindu.a26@gmail.com", "Himabindu.A26@gmail.com"),
    ).not.toThrow();
  });

  it("rejects a different Chrome-signed-in account", () => {
    expect(() =>
      assertExpectedGoogleAccount("other.user@gmail.com", "himabindu.a26@gmail.com"),
    ).toThrow(AppError);
    expect(() =>
      assertExpectedGoogleAccount("other.user@gmail.com", "himabindu.a26@gmail.com"),
    ).toThrow(/other.user@gmail.com/);
  });

  it("reads email from an id_token payload", () => {
    const payload = Buffer.from(
      JSON.stringify({ email: "himabindu.a26@gmail.com" }),
      "utf8",
    ).toString("base64url");
    expect(emailFromIdToken(`header.${payload}.sig`)).toBe("himabindu.a26@gmail.com");
  });

  it("hints the expected account and forces an account picker", () => {
    const options = googleConsentUrlOptions("himabindu.a26@gmail.com");
    expect(options.login_hint).toBe("himabindu.a26@gmail.com");
    expect(options.prompt).toBe("consent select_account");
    expect(options.scope).toContain(USERINFO_EMAIL_SCOPE);
  });
});
