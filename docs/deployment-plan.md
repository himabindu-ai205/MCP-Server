# Deployment Plan — Railway (MCP Server)

Plan to run this Gmail / Google Docs MCP server on [Railway](https://railway.app) as a **Streamable HTTP** service. Local Cursor and Claude Desktop can keep using **stdio**. Railway is for remote orchestrators, custom agents, and any client that connects by URL.

Related: [`architecture.md`](./architecture.md) §3, §15 · [`problemStatement.md`](./problemStatement.md)

**Contents**

1. [Target architecture](#1-target-architecture)
2. [What Railway can and cannot do](#2-what-railway-can-and-cannot-do)
3. [Gaps in the current code](#3-gaps-in-the-current-code)
4. [Phases](#4-phases)
5. [Railway service setup](#5-railway-service-setup)
6. [Environment and secrets](#6-environment-and-secrets)
7. [OAuth on a remote host](#7-oauth-on-a-remote-host)
8. [Connecting clients](#8-connecting-clients)
9. [Security](#9-security)
10. [Verification](#10-verification)
11. [Operations](#11-operations)
12. [Rollback](#12-rollback)
13. [Definition of done](#13-definition-of-done)

---

## 1. Target architecture

```
Cursor / Claude Desktop          Custom agents / remote orchestrators
        │                                      │
        │ stdio (unchanged, local)             │ HTTPS + Bearer token
        ▼                                      ▼
  local node process              Railway  ──►  Streamable HTTP /mcp
                                               │
                                               ▼
                                    same tool registry
                                    create_email_draft
                                    send_email
                                    append_to_google_doc
                                               │
                                               ▼
                                    Google Gmail / Docs APIs
                                    (refresh token in Railway vars)
```

| Surface | Transport | Process |
| --- | --- | --- |
| Cursor, Claude Desktop (local) | stdio | Developer machine |
| Custom agents, remote orchestrators | Streamable HTTP | Railway |
| Google | HTTPS from Railway | Official `googleapis` client |

One tool registry. No Cursor- or Railway-specific tools.

---

## 2. What Railway can and cannot do

| Works on Railway | Does not work on Railway |
| --- | --- |
| Long-running Node process | Host-spawned **stdio** MCP (no local child process) |
| Public or private HTTPS URL | Browser OAuth consent (`npm run auth`) |
| Env vars / secrets | Shipping `token.json` or `.env` in the image |
| `PORT` injected at runtime | Binding only `127.0.0.1` |

Railway is therefore **HTTP-only**. Complete Google consent **once on a laptop**, then store `GOOGLE_REFRESH_TOKEN` as a Railway secret. Do not run `scripts/auth-google.ts` on Railway.

---

## 3. Gaps in the current code

These must be fixed **before** the first Railway deploy. Today the HTTP server is built for loopback.

| Gap | Current behavior | Required for Railway |
| --- | --- | --- |
| Default transport | `npm start` is **stdio** | Start command must be `--transport http` |
| Bind address | `MCP_HTTP_HOST` defaults to `127.0.0.1` | Listen on `0.0.0.0` |
| Port | Reads `MCP_HTTP_PORT`, default `8787` | Prefer Railway’s `PORT` |
| Host allow-list | Accepts only bind host / `localhost` / `127.0.0.1` | Allow `*.up.railway.app` (and a custom domain if used) |
| DNS rebinding list | Same narrow list on `StreamableHTTPServerTransport` | Include the public hostname |
| Health check | Only `/mcp` exists | Add `GET /health` that returns 200 (no Google call) |
| Shared secret | `MCP_HTTP_TOKEN` is optional | **Required** on a public Railway URL |
| Refresh token source | Can fall back to local `token.json` | Railway must use env only (no token file in the repo) |

Suggested start command after those changes:

```bash
node dist/index.js --transport http --host 0.0.0.0 --port ${PORT:-8080}
```

Suggested health response:

```json
{ "status": "ok", "server": "google-workspace", "transport": "http" }
```

Do not put secrets or tool results on `/health`.

---

## 4. Phases

### Phase 0 — Pre-deploy code (blocking)

- [x] Honor `PORT` when `MCP_HTTP_PORT` is unset
- [x] Bind `0.0.0.0` when `RAILWAY_ENVIRONMENT` is set, or via `MCP_HTTP_HOST=0.0.0.0`
- [x] Allow Railway public host + optional `MCP_ALLOWED_HOSTS` (comma-separated)
- [x] Add `GET /health`
- [x] Fail startup if `MCP_HTTP_TOKEN` is missing when not binding loopback
- [x] `package.json`: `"start:railway": "node dist/index.js --transport http --host 0.0.0.0"`
- [x] Confirm `.gitignore` still excludes `.env`, `token.json`, `credential.json`

### Phase 1 — Railway project

- [ ] Create a Railway project and one **Web** service from this Git repo
- [ ] Node 20+ (Nixpacks detects `package.json` / `engines.node`)
- [ ] Build: `npm run build` (Railpack/Nixpacks already installs dependencies)
- [ ] Start: `npm run start:railway` (or the `node dist/index.js …` line above)
- [ ] Health check path: `/health`
- [ ] Generate a public domain (`https://<service>.up.railway.app`)

### Phase 2 — Secrets

- [ ] Run `npm run auth` **locally** if the refresh token is missing or revoked
- [ ] Set Railway variables (see [§6](#6-environment-and-secrets))
- [ ] Never upload `token.json` or `credential.json` as a volume or commit

### Phase 3 — First deploy and smoke test

- [ ] Deploy from `main` (or the release branch)
- [ ] `GET https://<host>/health` → 200
- [ ] `GET https://<host>/mcp` without token → 401
- [ ] MCP client `tools/list` over Streamable HTTP with Bearer token
- [ ] Optional: `create_email_draft` to the operator’s own inbox (not `send_email` until intended)

### Phase 4 — Clients

- [ ] Point remote orchestrators / custom agents at `https://<host>/mcp`
- [ ] Keep local Cursor / Claude Desktop on stdio unless a remote HTTP client is required
- [ ] Document the URL and header in the service README or Railway notes (not in git with the token)

---

## 5. Railway service setup

### 5.1 Repo and build

Nixpacks (default) is enough. No Docker image is required for v1.

| Setting | Value |
| --- | --- |
| Root directory | repository root (`MCP Server`) |
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `node dist/index.js --transport http --host 0.0.0.0` |
| Watch paths | `src/**`, `package.json`, `package-lock.json` |

Optional `railway.toml` (add in Phase 0 if you want config-as-code):

```toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "node dist/index.js --transport http --host 0.0.0.0"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

Railway injects `PORT`. After Phase 0 the process must listen on that port.

### 5.2 Networking

- Enable a **public** Railway domain for internet clients, or a **private** network if only other Railway services call MCP.
- TLS terminates at Railway. The app speaks HTTP on `PORT`.
- Path: `/mcp` (override with `MCP_HTTP_PATH` only if every client is updated).

### 5.3 Resources

A single replica is enough. This process is request-scoped (stateless Streamable HTTP) and holds Google tokens in memory.

| Knob | Starting point |
| --- | --- |
| Replicas | 1 |
| Restart | on failure |
| Region | closest to you / Google (`asia-southeast1` if you are in Singapore) |

---

## 6. Environment and secrets

Set these in Railway → Service → Variables. Mark secrets as hidden. Do not put them in `railway.toml`.

| Variable | Required | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | Same OAuth client as local `.env` |
| `GOOGLE_CLIENT_SECRET` | yes | Secret |
| `GOOGLE_REDIRECT_URI` | yes | Same URI used when the refresh token was minted (local loopback is fine) |
| `GOOGLE_REFRESH_TOKEN` | yes | From local `token.json` / `.env`. Secret |
| `MCP_HTTP_TOKEN` | **yes on Railway** | Long random string; clients send `Authorization: Bearer <token>` |
| `MCP_HTTP_HOST` | yes | `0.0.0.0` |
| `MCP_HTTP_PATH` | no | Default `/mcp` |
| `MCP_ALLOWED_HOSTS` | recommended | e.g. `<service>.up.railway.app`, custom domain |
| `LOG_LEVEL` | no | `info` |
| `PORT` | set by Railway | Do not override unless you know you must |

Do **not** set on Railway:

- `GOOGLE_REFRESH_TOKEN` empty with a hope that `token.json` is on disk
- A copy of `.env` committed to git
- `MCP_HTTP_HOST=127.0.0.1`

Generate `MCP_HTTP_TOKEN` locally (do not commit the value):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 7. OAuth on a remote host

Railway never opens a browser.

1. On a trusted machine: `credential.json` + `npm run auth`.
2. Copy **only** `refresh_token` into Railway `GOOGLE_REFRESH_TOKEN`.
3. Leave `token.json` on the laptop (gitignored).
4. If Google returns `invalid_grant`, revoke the app at [Google Account permissions](https://myaccount.google.com/permissions), run `npm run auth` again, update the Railway variable, and redeploy or restart.

The Desktop / installed OAuth client already used locally is enough. The refresh token is not tied to `127.0.0.1`. Do not switch to a Web client unless you also change the consent redirect and remint the token.

Scopes stay least-privilege: `gmail.compose` and `documents`.

---

## 8. Connecting clients

MCP endpoint after deploy:

```text
https://<service>.up.railway.app/mcp
```

### 8.1 Custom agent / remote orchestrator

Use the official Streamable HTTP client. Send the shared secret on every request:

```http
Authorization: Bearer <MCP_HTTP_TOKEN>
```

or `X-MCP-Token: <MCP_HTTP_TOKEN>`.

### 8.2 Cursor (remote)

If the Cursor build supports a URL MCP server:

```json
{
  "mcpServers": {
    "google-workspace": {
      "url": "https://<service>.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_HTTP_TOKEN>"
      }
    }
  }
}
```

If it only supports `command`, keep using local stdio (`node dist/index.js`) and treat Railway as the remote/orchestrator path.

### 8.3 Claude Desktop

Claude Desktop is typically stdio. Prefer a local process, or a small local proxy that speaks stdio to the desktop app and HTTP to Railway. Do not paste the refresh token into the desktop config if Railway already holds it.

---

## 9. Security

| Control | On Railway |
| --- | --- |
| TLS | Railway edge HTTPS |
| Shared secret | `MCP_HTTP_TOKEN` required; reject missing/wrong token with 401 |
| Google secrets | Railway variables only |
| Tokens in logs | Existing logger redaction; never log `Authorization` or refresh tokens |
| Host checks | Allow only the Railway hostname(s) you set |
| Exposure | This URL can send mail and write Docs — treat it like a private API |
| Git | `.env`, `token.json`, `credential.json` stay gitignored |

Optional later: Railway private network only, plus an allow-list of caller IPs, if all clients live on Railway.

---

## 10. Verification

Run in order after each deploy.

| Check | Expect |
| --- | --- |
| Railway deploy logs | Process listening on `0.0.0.0:<PORT>/mcp` |
| `GET /health` | 200 JSON, no Google call |
| `GET /mcp` no auth | 401 |
| `GET /` | 404 |
| Streamable HTTP `initialize` + `tools/list` with Bearer | `create_email_draft`, `send_email`, `append_to_google_doc` |
| `send_email` with `to: ["not-an-email"]` | `INVALID_EMAIL`, no Gmail call |
| `create_email_draft` to your own inbox (optional) | `success: true` and a `draftId` in Gmail Drafts |

Local unit tests (`npm test`) stay mocked and do not replace the Railway smoke test.

---

## 11. Operations

| Topic | Practice |
| --- | --- |
| Logs | Railway logs = stderr (`[info] Tool invoked: …`). No bodies or tokens |
| Restart | Restart the service after rotating `GOOGLE_REFRESH_TOKEN` or `MCP_HTTP_TOKEN` |
| Deploys | Push to the connected branch; Nixpacks rebuilds `dist/` |
| Cold start | First request after idle may be slower; health check keeps the replica up if configured |
| Quotas | Gmail / Docs quotas belong to the authorized Google account |
| Incidents | `AUTHENTICATION_FAILED` → remint refresh token locally and update Railway |

---

## 12. Rollback

1. In Railway, redeploy the previous successful deployment.
2. If the failure is secrets (bad token), revert variables; no code rollback needed.
3. Local stdio clients are independent — a bad Railway deploy does not break Cursor on stdio.

---

## 13. Definition of done

Railway hosting is done when:

1. Phase 0 code changes are merged and the service binds `0.0.0.0` + `PORT`.
2. `GET /health` returns 200 on the Railway URL.
3. Unauthenticated `/mcp` is rejected.
4. An MCP client can `tools/list` over HTTPS with `MCP_HTTP_TOKEN`.
5. Google calls use `GOOGLE_REFRESH_TOKEN` from Railway variables (no `token.json` on the host).
6. Local stdio for Cursor / Claude Desktop still works unchanged.
7. Secrets are not in git.

---

*This plan deploys the existing generic MCP server. It does not add business-specific tools or move OAuth consent onto Railway.*
