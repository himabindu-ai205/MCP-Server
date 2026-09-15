# Generic Gmail & Google Docs MCP Server

Standalone [Model Context Protocol](https://modelcontextprotocol.io) server that exposes reusable Gmail and Google Docs tools. It is an integration layer, not an AI agent: it does not generate content, contain prompts, or depend on Cursor, Claude Desktop, or any other host.

Compatible clients:

- **Cursor** — stdio
- **Claude Desktop** — stdio
- **Custom agents** — stdio or Streamable HTTP
- **Remote orchestrators** — Streamable HTTP

See [`docs/problemStatement.md`](docs/problemStatement.md) and [`docs/architecture.md`](docs/architecture.md).

## Architecture

```
MCP Layer (stdio / Streamable HTTP)
    ↓
Tool Layer (create_email_draft, send_email, append_to_google_doc)
    ↓
Service Layer (validate → call → map)
    ↓
Google API Layer (Gmail / Docs clients)
    ↓
Authentication Layer (OAuth refresh token)
```

```
Tool Handler → CredentialProvider → TokenStore
                    ↓                    ↓
         Google OAuth Client (refresh)   .env / Secret Manager
```

## Supported MCP tools

| Tool | Purpose |
| --- | --- |
| `create_email_draft` | Create a Gmail draft without sending |
| `send_email` | Send an email through Gmail |
| `append_to_google_doc` | Append content to an existing Google Doc |

Each tool returns a structured envelope:

```json
{ "success": true, "message": "...", "...": "..." }
```

or

```json
{ "success": false, "error": { "code": "INVALID_EMAIL", "message": "..." } }
```

Error codes: `VALIDATION_ERROR`, `INVALID_EMAIL`, `DOCUMENT_NOT_FOUND`, `AUTHENTICATION_FAILED`, `GOOGLE_API_ERROR`, `UNKNOWN_TOOL`.

## Prerequisites

- Node.js 20+
- A Google Cloud project with **Gmail API** and **Google Docs API** enabled
- An OAuth 2.0 client (Desktop or Web) whose redirect URI matches `GOOGLE_REDIRECT_URI`

## Google Cloud project setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable **Gmail API** and **Google Docs API**.
4. Configure the OAuth consent screen. Add your Google account as a test user if the app is in testing.
5. Create OAuth credentials (Desktop app is simplest for local use).
6. Set the authorized redirect URI to `http://localhost:3000/oauth2callback` (or your chosen URI).

### Required APIs

- Gmail API
- Google Docs API

### OAuth scopes (least privilege)

- `https://www.googleapis.com/auth/gmail.compose` — draft and send
- `https://www.googleapis.com/auth/documents` — append to an existing Doc

The server does not request `gmail.readonly`, `gmail.modify`, or full Drive access.

## Environment variables

Copy `.env.example` to `.env` (never commit `.env`):

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=
GOOGLE_ACCOUNT_EMAIL=himabindu.a26@gmail.com
LOG_LEVEL=info
```

Optional HTTP settings: `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_HTTP_PATH`, `MCP_HTTP_TOKEN`.

Obtain a refresh token once:

```bash
npm install
npm run auth
```

The script opens a browser and asks you to **choose a Google account**. Pick `GOOGLE_ACCOUNT_EMAIL` (default `himabindu.a26@gmail.com`). Chrome’s currently signed-in profile is not used as From unless you select that account. The refresh token is written to `.env` / `token.json`.

## Install and build

```bash
npm install
npm test
npm run build
```

## How to start the server

**stdio** (Cursor, Claude Desktop, local custom agents):

```bash
npx tsx src/index.ts
# or
npm run build && node dist/index.js
```

Logs go to **stderr** so they never mix with the MCP JSON-RPC stream on stdout.

**Streamable HTTP** (remote orchestrators, HTTP custom agents):

```bash
npx tsx src/index.ts --transport http --port 8787
```

The MCP endpoint is `http://127.0.0.1:8787/mcp` by default. Bind stays on loopback unless you change `--host`. If `MCP_HTTP_TOKEN` is set, send `Authorization: Bearer <token>` or `X-MCP-Token`.

**Railway** (public Streamable HTTP — see [`docs/deployment-plan.md`](docs/deployment-plan.md)):

```bash
npm run build
npm run start:railway
```

Railway injects `PORT`. The process binds `0.0.0.0`, serves `GET /health`, and requires `MCP_HTTP_TOKEN` (plus `GOOGLE_*` secrets). Do not upload `token.json`; set `GOOGLE_REFRESH_TOKEN` as a Railway variable.

## How to connect an MCP client

### Cursor

Add to `.cursor/mcp.json` (this repo) or Cursor MCP settings. Use **stdio** (a local `command`), not a `url`. A `url` entry makes Cursor show Google sign-in. Stdio loads `.env` and sends with the refresh token — no browser login.

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["${workspaceFolder}/dist/index.js"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

Run `npm run build` first. Enable **gmail** in Settings → MCP. In chat, use the **gmail** `send_email` tool. Do not click Authenticate and do not open Gmail in the browser.

### Claude Desktop

Same JSON shape in `claude_desktop_config.json` (`mcpServers.gmail`).

### Custom agents

Spawn the same command with `StdioClientTransport`, or connect a Streamable HTTP client to `http://127.0.0.1:8787/mcp`.

### Remote orchestrators

Start `--transport http` and point the orchestrator at the MCP URL. Do not expose that port on a public network without TLS and an access token.

## Example tool calls

**Create a draft**

```json
{
  "to": ["customer@example.com"],
  "subject": "Customer Feedback Summary",
  "body": "Draft email content..."
}
```

**Send email**

```json
{
  "to": ["customer@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Customer Feedback Summary",
  "body": "Final email content..."
}
```

**Append to a Google Doc**

```json
{
  "documentId": "google-document-id",
  "content": "## Customer Feedback Summary\n\nCustomers highlighted..."
}
```

The document id is the long id in the Doc URL: `https://docs.google.com/document/d/<documentId>/edit`.

## Testing

```bash
npm test
```

Unit tests mock Gmail and Docs clients. They do not need network access or real Google credentials.

## Security considerations

- Never hardcode credentials or commit `.env`, `credentials.json`, or `token.json`.
- Access and refresh tokens are never returned in MCP responses.
- The logger redacts token-like fields and does not log email bodies or document content at `info`.
- Invalid input is rejected before any Google API call.
- HTTP transport defaults to loopback. Treat it as an internal capability endpoint, not a public Google proxy.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Server exits on startup | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` must be set. |
| `AUTHENTICATION_FAILED` | Re-run `npm run auth`. Confirm APIs are enabled and the OAuth client redirect URI matches. |
| Mail sent from the wrong Gmail | The From address is the account that clicked Allow, not Chrome’s default profile. Set `GOOGLE_ACCOUNT_EMAIL`, run `npm run auth`, and choose that account. Update Railway `GOOGLE_REFRESH_TOKEN`. |
| No refresh token from `auth` | Revoke the app at https://myaccount.google.com/permissions and consent again. |
| `DOCUMENT_NOT_FOUND` | The Doc id is wrong, or the authorized account cannot access that document. |
| `INVALID_EMAIL` | One of `to` / `cc` / `bcc` is not a valid address. |
| Cursor/Claude cannot start the server | Use `node dist/index.js` after `npm run build`, and an absolute path if needed. |
| HTTP client 401 | Set the same `MCP_HTTP_TOKEN` on server and client. |
| Protocol errors on stdio | Do not write logs to stdout; this server logs to stderr only. |

## Future extensions

Add generic tools only (no workflow-specific names):

```
read_google_doc
search_google_drive
create_google_doc
update_google_doc
list_gmail_messages
search_gmail
get_gmail_thread
create_google_sheet
append_to_google_sheet
```

Register a new tool, add a service method, request extra OAuth scopes only if required, and mock the Google client in tests.
