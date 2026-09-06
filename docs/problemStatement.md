# Problem Statement — Generic Gmail & Google Docs MCP Server

## 1. Overview

Build a generic Model Context Protocol (MCP) server that enables AI agents to interact with Gmail and Google Docs through standardized MCP tools.

The MCP server will act as a reusable integration layer between AI agents and Google Workspace services.

The primary goal is to allow any MCP-compatible AI agent to:

1. Draft and send emails using Gmail
2. Append content to an existing Google Doc

The server must be designed generically so that it is not tightly coupled to a specific AI agent, application, prompt, or workflow.

Any compatible AI agent should be able to discover the available MCP tools and invoke them based on the agent's requirements.

## 2. Problem to Solve

AI agents can reason about tasks and generate content, but they need secure external integrations to perform real-world actions.

For example, an AI agent may determine that it needs to:

> "Send an email to the customer with the generated summary."

or:

> "Add this meeting summary to the project documentation Google Doc."

Currently, these actions require custom integrations between each AI agent and Google APIs.

This creates several problems:

- Each AI agent may implement Gmail integration differently.
- Google authentication logic may be duplicated.
- Google API handling becomes tightly coupled to the agent.
- Tool definitions are not standardized.
- Adding another AI agent requires additional integration work.
- Security, error handling, logging, and API management become difficult to maintain.

The proposed solution is a standalone MCP server that exposes reusable Gmail and Google Docs capabilities as MCP tools.

The architecture should follow:

```
                    ┌──────────────────────┐
                    │      AI Agent 1      │
                    └──────────┬───────────┘
                               │
                               │ MCP
                               ▼
                    ┌──────────────────────┐
                    │                      │
                    │   Generic MCP       │
                    │      Server          │
                    │                      │
                    └──────────┬───────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
        ┌──────────────────┐      ┌──────────────────┐
        │    Gmail API     │      │  Google Docs API │
        └──────────────────┘      └──────────────────┘


                    ┌──────────────────────┐
                    │      AI Agent 2      │
                    └──────────┬───────────┘
                               │
                               │ MCP
                               ▼
                         Same MCP Server
```

The MCP server should therefore be agent-independent.

## 3. Primary Functionalities

The MCP server must initially support two core capabilities.

### 3.1 Gmail — Draft and Send Email

The MCP server must expose an MCP tool that allows an AI agent to create and send an email through Gmail.

The tool should support, at minimum:

- Recipient email address
- CC recipients
- BCC recipients
- Email subject
- Email body
- Optional HTML body
- Optional reply/thread information where supported

#### Example AI Agent Request

The AI agent should be able to invoke an MCP tool conceptually similar to:

```json
{
  "to": ["customer@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Customer Feedback Summary",
  "body": "Here is the summary of the customer feedback..."
}
```

The MCP server should then:

1. Validate the request.
2. Authenticate with Gmail.
3. Construct the appropriate Gmail message.
4. Send the message through the Gmail API.
5. Return a structured response to the AI agent.

#### Expected Response

A successful response should contain useful information such as:

```json
{
  "success": true,
  "messageId": "gmail-message-id",
  "threadId": "gmail-thread-id",
  "message": "Email sent successfully."
}
```

Errors should also be returned in a structured and agent-friendly format.

## 4. Gmail Draft Capability

The Gmail functionality should support drafting an email separately from sending it.

The MCP server should expose a tool conceptually similar to:

```
create_email_draft
```

The AI agent should be able to provide:

```json
{
  "to": ["customer@example.com"],
  "subject": "Customer Feedback Summary",
  "body": "Draft email content..."
}
```

The server should create a Gmail draft without sending it.

The response should provide sufficient information to identify the created draft.

Example:

```json
{
  "success": true,
  "draftId": "gmail-draft-id",
  "message": "Email draft created successfully."
}
```

## 5. Gmail Send Capability

A separate MCP tool should support sending an email.

Conceptually:

```
send_email
```

The AI agent should be able to provide:

```json
{
  "to": ["customer@example.com"],
  "subject": "Customer Feedback Summary",
  "body": "Final email content..."
}
```

The server should send the email using Gmail API and return the result.

## 6. Google Docs — Append Content

The second primary capability is to append content to an existing Google Doc.

The MCP server should expose a tool conceptually similar to:

```
append_to_google_doc
```

The AI agent should provide:

```json
{
  "documentId": "google-document-id",
  "content": "## Customer Feedback Summary\n\nCustomers highlighted..."
}
```

The MCP server should:

1. Validate the document ID.
2. Authenticate with Google.
3. Access the specified Google Doc.
4. Append the supplied content to the end of the document.
5. Return a structured success/failure response.

Example successful response:

```json
{
  "success": true,
  "documentId": "google-document-id",
  "message": "Content appended successfully."
}
```

## 7. Generic MCP Design

The MCP server must not contain business-specific logic.

For example, the server should NOT contain functionality such as:

```
create_customer_feedback_report
```

or:

```
send_customer_feedback_email
```

Instead, it should provide generic capabilities such as:

```
send_email
create_email_draft
append_to_google_doc
```

This allows different AI agents to use the same MCP server for completely different workflows.

For example:

#### Agent A

```
AI Agent
   ↓
send_email
```

#### Agent B

```
AI Agent
   ↓
append_to_google_doc
```

#### Agent C

```
AI Agent
   ↓
create_email_draft
   ↓
append_to_google_doc
```

The MCP server should not need to know which AI agent is invoking it or why the operation is being performed.

## 8. MCP Tool Discovery

The server must properly implement MCP tool discovery.

An MCP-compatible client should be able to connect to the server and discover available tools.

Conceptually:

```
tools/list
```

should expose tools such as:

```
send_email
create_email_draft
append_to_google_doc
```

Each tool must provide:

- Tool name
- Description
- Input schema
- Required parameters
- Optional parameters
- Validation rules

The descriptions should be sufficiently clear for an LLM to understand when and how to use each tool.

## 9. Input Validation

All MCP tool inputs must be validated before invoking Google APIs.

Examples:

#### Email

Validate:

- Recipient exists
- Recipient email address is valid
- Subject is present where required
- Email body is present where required
- CC/BCC values are valid if supplied

#### Google Docs

Validate:

- documentId is provided
- content is provided
- Content is not unexpectedly empty
- Document ID has the expected format where possible

Invalid requests should not be sent to Google APIs.

The MCP server should return clear, structured errors.

## 10. Authentication and Authorization

The MCP server must use Google's supported authentication mechanism for accessing:

- Gmail API
- Google Docs API

The implementation should follow Google's recommended OAuth 2.0 approach.

The design should ensure that:

- Credentials are never hardcoded.
- Client secrets are never committed to source control.
- Access tokens are not exposed in MCP responses.
- Sensitive credentials are stored securely.
- Required OAuth scopes are explicitly defined.
- The minimum required permissions should be requested.

Potential scopes should be evaluated based on the selected Gmail and Google Docs operations.

For example, the implementation may require Gmail scopes for:

```
Gmail draft creation
Gmail email sending
```

and Google Docs permissions for:

```
Reading/updating Google Docs
```

The implementation should use the least-privilege scopes necessary.

## 11. Configuration

The MCP server should use environment-based configuration.

Sensitive configuration must not be hardcoded.

Example configuration:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_REFRESH_TOKEN
```

The exact configuration should be determined by the chosen authentication architecture.

A `.env.example` file should be provided.

Example:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_REFRESH_TOKEN=
```

Actual secrets must never be included in the repository.

## 12. Error Handling

The MCP server must provide meaningful errors that an AI agent can understand and act upon.

Examples:

#### Authentication Error

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Unable to authenticate with Google."
  }
}
```

#### Invalid Email

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EMAIL",
    "message": "The recipient email address is invalid."
  }
}
```

#### Google Document Not Found

```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "The specified Google document could not be found or accessed."
  }
}
```

#### Google API Failure

```json
{
  "success": false,
  "error": {
    "code": "GOOGLE_API_ERROR",
    "message": "Google API request failed."
  }
}
```

Errors should be:

- Structured
- Predictable
- Safe
- Useful to the calling AI agent
- Free of secrets or sensitive credentials

## 13. Security Requirements

Security is a key requirement.

The implementation must:

- Never expose OAuth client secrets.
- Never expose refresh tokens.
- Never return access tokens to the AI agent.
- Never log authentication tokens.
- Never commit `.env` files containing secrets.
- Validate all tool inputs.
- Use HTTPS/TLS where applicable.
- Follow least-privilege OAuth scopes.
- Handle authentication failures safely.

The `.gitignore` should include sensitive files such as:

```
.env
.env.*
credentials.json
token.json
```

unless a specific non-secret example file is intentionally committed.

## 14. Logging

The MCP server should provide useful operational logging.

Logs may include:

```
Tool invoked: send_email
Tool invoked: create_email_draft
Tool invoked: append_to_google_doc
Google API request successful
Google API request failed
Authentication failure
Validation failure
```

However, logs must never contain:

- OAuth tokens
- Client secrets
- Refresh tokens
- Passwords
- Sensitive authentication information

Email content should also not be logged by default unless explicitly required for debugging.

## 15. Project Structure

The implementation should have a clean separation between:

```
MCP Layer
    ↓
Tool Layer
    ↓
Service Layer
    ↓
Google API Layer
    ↓
Authentication Layer
```

A possible structure is:

```
mcp-google-workspace/
│
├── src/
│   ├── server/
│   │   └── mcp-server
│   │
│   ├── tools/
│   │   ├── gmail-tools
│   │   └── google-docs-tools
│   │
│   ├── services/
│   │   ├── gmail-service
│   │   └── google-docs-service
│   │
│   ├── auth/
│   │   └── google-auth
│   │
│   ├── config/
│   │   └── configuration
│   │
│   └── utils/
│
├── tests/
│
├── .env.example
├── .gitignore
├── README.md
└── package/configuration files
```

The exact project structure may be adjusted based on the selected programming language and MCP SDK.

## 16. Technology Selection

The implementation technology is intentionally left open.

Cursor / Antigravity should select an appropriate official MCP SDK and Google API client library.

Preferred criteria:

- Official or well-supported MCP SDK
- Strong Google API support
- Good OAuth 2.0 support
- Easy local development
- Good testability
- Clear project structure
- Production-readiness

The implementation should avoid unnecessary frameworks or infrastructure.

## 17. Transport

The MCP server should use a standard MCP transport supported by current MCP clients.

The implementation should clearly document:

- Which transport is being used
- How the server is started
- How an MCP client connects
- Required configuration
- Local development setup
- Production deployment considerations

The design should avoid coupling the server to a single AI application.

## 18. Tool Definitions

The initial MCP tool set should include at least:

| Tool | Purpose |
| --- | --- |
| send_email | Send an email through Gmail |
| create_email_draft | Create a Gmail draft without sending |
| append_to_google_doc | Append content to an existing Google Doc |

The tools should have clear descriptions and strongly typed input schemas.

## 19. Example End-to-End Workflow

An AI agent receives:

> "Prepare an email summarizing the customer feedback and add the summary to our project Google Doc."

The AI agent may perform:

```
AI Agent
   │
   ├── Generate customer feedback summary
   │
   ├── MCP → append_to_google_doc
   │
   └── MCP → create_email_draft
```

If the user subsequently says:

> "Send the email."

The AI agent can invoke:

```
MCP → send_email
```

The MCP server does not need to understand the concept of "customer feedback."

It only understands generic operations such as:

```
append content to document
create email draft
send email
```

## 20. Reusability Requirement

The server must be reusable by multiple AI agents.

For example:

```
┌─────────────────────┐
│ AI Agent - Support  │
└──────────┬──────────┘
           │
           │
┌──────────▼──────────┐
│                     │
│ Generic MCP Server  │
│                     │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
   Gmail       Google Docs
```

Another AI agent should be able to connect to the same MCP server without requiring changes to the server's business logic.

## 21. Testing Requirements

The project should include automated tests for:

#### MCP Server

- Server startup
- Tool discovery
- Tool schema validation
- Invalid requests

#### Gmail

- Email input validation
- Draft creation
- Email sending
- Gmail API errors
- Authentication failures

#### Google Docs

- Document ID validation
- Content validation
- Append operation
- Document not found
- Permission errors
- Google API failures

Where possible, Google APIs should be mocked for unit tests.

Integration tests may be provided separately where real Google credentials are available.

## 22. README Requirements

The project must include a comprehensive README.md.

The README should explain:

- What the MCP server does
- Architecture
- Supported MCP tools
- Prerequisites
- Google Cloud project setup
- Required Google APIs
- OAuth configuration
- Environment variables
- How to start the server
- How to connect an MCP client
- Example tool calls
- Testing instructions
- Security considerations
- Troubleshooting
- Future extensions

## 23. Acceptance Criteria

The project will be considered complete when all of the following are satisfied:

#### MCP

- [ ] MCP server starts successfully.
- [ ] MCP-compatible clients can connect.
- [ ] Tools can be discovered through MCP.
- [ ] Tool schemas are clearly defined.
- [ ] Server is independent of any specific AI agent.

#### Gmail

- [ ] AI agent can create a Gmail draft.
- [ ] AI agent can send an email through Gmail.
- [ ] To/CC/BCC are supported.
- [ ] Subject and body are supported.
- [ ] Gmail API errors are handled gracefully.
- [ ] Authentication failures are handled gracefully.

#### Google Docs

- [ ] AI agent can specify a Google Doc ID.
- [ ] AI agent can provide content.
- [ ] Content is appended to the specified document.
- [ ] Document access errors are handled gracefully.
- [ ] Google API errors are handled gracefully.

#### Security

- [ ] No credentials are hardcoded.
- [ ] Secrets are excluded from source control.
- [ ] OAuth tokens are never returned to the AI agent.
- [ ] Sensitive credentials are not written to logs.
- [ ] Least-privilege permissions are used where practical.

#### Quality

- [ ] Project has clean separation of concerns.
- [ ] Unit tests are included.
- [ ] Error handling is structured.
- [ ] README provides complete setup instructions.
- [ ] `.env.example` is provided.
- [ ] The implementation can be reused by other MCP-compatible AI agents.

## 24. Future Extensibility

The architecture should make it easy to add additional Google Workspace capabilities later.

Potential future MCP tools include:

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

These should be added as new generic MCP tools, without changing the existing AI-agent integration.

The initial implementation should therefore avoid an architecture that assumes only one AI agent or one specific workflow.

## 25. Important Implementation Principle

The MCP server is an integration and capability layer, not an AI agent.

It should:

```
Receive structured request
        ↓
Validate request
        ↓
Authenticate
        ↓
Call Google API
        ↓
Process result
        ↓
Return structured MCP response
```

It should NOT:

- Make business decisions
- Generate email content using an LLM
- Decide what information should be written to a document
- Contain customer-feedback-specific logic
- Depend on a specific AI agent
- Contain prompts for the AI agent

The AI agent owns reasoning and decision-making.

The MCP server owns secure execution of external actions.

## 26. Final Objective

Build a production-quality, generic MCP server for Google Workspace that provides reusable capabilities for AI agents.

The first version must support:

```
                    AI Agent
                       │
                       │ MCP
                       ▼
             ┌───────────────────┐
             │   Google MCP      │
             │      Server       │
             └─────────┬─────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
           Gmail            Google Docs
              │                 │
       ┌──────┴──────┐          │
       │             │          │
     Draft          Send      Append
```

The solution should be generic, secure, modular, testable, documented, and reusable by any MCP-compatible AI agent.
