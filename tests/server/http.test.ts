import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../src/config/configuration.js";
import { createHttpServer, HEALTH_BODY, type CliOptions } from "../../src/index.js";
import { createLogger } from "../../src/utils/logger.js";

const logger = createLogger("error");
const servers: Array<ReturnType<typeof createHttpServer>> = [];

const baseConfig: AppConfig = {
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRedirectUri: "http://localhost:3000",
  googleRefreshToken: "refresh-token",
  logLevel: "error",
  httpHost: "127.0.0.1",
  httpPort: 0,
  httpPath: "/mcp",
  httpToken: "test-token",
  allowedHosts: ["127.0.0.1", "localhost"],
  railway: false,
};

async function listen(config: AppConfig, options: Partial<CliOptions> = {}) {
  const server = createHttpServer(
    config,
    {
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
      ...options,
    },
    logger,
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    ),
  );
});

describe("HTTP transport", () => {
  it("serves GET /health without a token or Google call", async () => {
    const { url } = await listen({ ...baseConfig, httpToken: undefined });
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(HEALTH_BODY);
  });

  it("rejects /mcp without a token when a token is configured", async () => {
    const { url } = await listen(baseConfig);
    const response = await fetch(`${url}/mcp`);
    expect(response.status).toBe(401);
  });

  it("rejects unknown paths with 404", async () => {
    const { url } = await listen(baseConfig);
    const response = await fetch(`${url}/`);
    expect(response.status).toBe(404);
  });

  it("refuses to start on 0.0.0.0 without MCP_HTTP_TOKEN", () => {
    expect(() =>
      createHttpServer(
        { ...baseConfig, httpToken: undefined },
        { transport: "http", host: "0.0.0.0", port: 8080, path: "/mcp" },
        logger,
      ),
    ).toThrow(/MCP_HTTP_TOKEN/);
  });
});
