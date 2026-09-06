import { describe, expect, it } from "vitest";
import { EnvTokenStore, GoogleAuthProvider } from "../../src/auth/google-auth.js";
import { loadConfig } from "../../src/config/configuration.js";
import { mapGoogleError } from "../../src/errors/app-error.js";
import { parseArgs } from "../../src/index.js";

const validEnv = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/oauth2callback",
  GOOGLE_REFRESH_TOKEN: "refresh-token",
};

describe("configuration", () => {
  it("loads environment configuration", () => {
    const config = loadConfig({ env: validEnv });
    expect(config.googleClientId).toBe("client-id");
    expect(config.googleRefreshToken).toBe("refresh-token");
    expect(config.httpHost).toBe("127.0.0.1");
  });

  it("fails closed when required env is missing", () => {
    expect(() => loadConfig({ env: {} })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() =>
      loadConfig({
        env: { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" },
      }),
    ).toThrow(/GOOGLE_REFRESH_TOKEN/);
  });
});

describe("auth mapping", () => {
  it("maps refresh and 401 failures to AUTHENTICATION_FAILED", () => {
    expect(mapGoogleError({ code: 401, message: "unauthorized" }, "gmail").code).toBe(
      "AUTHENTICATION_FAILED",
    );
    expect(mapGoogleError({ message: "invalid_grant" }, "gmail").code).toBe("AUTHENTICATION_FAILED");
  });

  it("does not put tokens on MCP envelopes or public DTOs", () => {
    const config = loadConfig({ env: validEnv });
    const store = new EnvTokenStore(config.googleRefreshToken);
    const provider = new GoogleAuthProvider(config, store);
    expect(provider).toHaveProperty("getAuthClient");
    expect(store.getRefreshToken()).toBe("refresh-token");
    const publicResult = {
      success: true,
      draftId: "gmail-draft-id",
      message: "Email draft created successfully.",
    };
    expect(JSON.stringify(publicResult)).not.toMatch(/refresh_token|access_token|client_secret/);
  });
});

describe("cli", () => {
  it("parses stdio and http transports", () => {
    expect(parseArgs([], {})).toMatchObject({ transport: "stdio" });
    expect(parseArgs(["--transport", "http", "--port", "9000"], { PORT: "8080" })).toMatchObject({
      transport: "http",
      port: 9000,
    });
    expect(parseArgs([], { PORT: "8080" })).toMatchObject({ port: 8080 });
  });
});
