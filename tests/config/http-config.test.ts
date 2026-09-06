import { describe, expect, it } from "vitest";
import {
  assertHttpSecurity,
  isAllowedHostname,
  loadConfig,
  requiresHttpToken,
  resolveAllowedHosts,
  resolveHttpHost,
  resolveHttpPort,
} from "../../src/config/configuration.js";
import { parseArgs } from "../../src/index.js";

const validEnv = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000",
  GOOGLE_REFRESH_TOKEN: "refresh-token",
};

describe("http config", () => {
  it("uses PORT when MCP_HTTP_PORT is unset", () => {
    expect(resolveHttpPort({ PORT: "8080" })).toBe(8080);
    expect(resolveHttpPort({ MCP_HTTP_PORT: "8787", PORT: "8080" })).toBe(8787);
  });

  it("binds 0.0.0.0 on Railway unless MCP_HTTP_HOST is set", () => {
    expect(resolveHttpHost({ RAILWAY_ENVIRONMENT: "production" })).toBe("0.0.0.0");
    expect(resolveHttpHost({ RAILWAY_ENVIRONMENT: "production", MCP_HTTP_HOST: "127.0.0.1" })).toBe(
      "127.0.0.1",
    );
    expect(resolveHttpHost({})).toBe("127.0.0.1");
  });

  it("does not read token.json on Railway", () => {
    expect(() =>
      loadConfig({
        env: {
          GOOGLE_CLIENT_ID: "x",
          GOOGLE_CLIENT_SECRET: "y",
          RAILWAY_ENVIRONMENT: "production",
        },
      }),
    ).toThrow(/GOOGLE_REFRESH_TOKEN/);
  });

  it("includes Railway public domain and MCP_ALLOWED_HOSTS", () => {
    const hosts = resolveAllowedHosts(
      {
        RAILWAY_PUBLIC_DOMAIN: "demo.up.railway.app",
        MCP_ALLOWED_HOSTS: "mcp.example.com, *.example.com",
      },
      "0.0.0.0",
    );
    expect(hosts).toContain("demo.up.railway.app");
    expect(hosts).toContain("mcp.example.com");
    expect(hosts).toContain("*.example.com");
  });

  it("allows Railway hostnames and configured hosts", () => {
    expect(isAllowedHostname("abc.up.railway.app", ["127.0.0.1"])).toBe(true);
    expect(isAllowedHostname("web.railway.internal", [])).toBe(true);
    expect(isAllowedHostname("mcp.example.com", ["*.example.com"])).toBe(true);
    expect(isAllowedHostname("evil.com", ["127.0.0.1"])).toBe(false);
  });

  it("requires a token when not on loopback", () => {
    expect(requiresHttpToken("0.0.0.0")).toBe(true);
    expect(requiresHttpToken("127.0.0.1")).toBe(false);
    expect(() => assertHttpSecurity("0.0.0.0")).toThrow(/MCP_HTTP_TOKEN/);
    expect(() => assertHttpSecurity("0.0.0.0", "secret")).not.toThrow();
    expect(() => assertHttpSecurity("127.0.0.1")).not.toThrow();
  });

  it("defaults Railway CLI to http and honors PORT", () => {
    expect(parseArgs([], { RAILWAY_ENVIRONMENT: "production", PORT: "8080" })).toMatchObject({
      transport: "http",
      host: "0.0.0.0",
      port: 8080,
    });
    expect(parseArgs(["--transport", "stdio"], { RAILWAY_ENVIRONMENT: "production" })).toMatchObject({
      transport: "stdio",
    });
  });

  it("keeps local defaults", () => {
    const config = loadConfig({ env: validEnv });
    expect(config.httpHost).toBe("127.0.0.1");
    expect(config.railway).toBe(false);
  });
});
