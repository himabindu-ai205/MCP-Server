import { describe, expect, it } from "vitest";
import { AppError } from "../../src/errors/app-error.js";
import { unknownToolEnvelope } from "../../src/server/mcp-server.js";
import { connectTestClient, mockDocs, mockGmail, parseEnvelope, validEmailInput } from "../helpers.js";

describe("MCP server", () => {
  it("lists the three v1 tools with schemas", async () => {
    const { client, server } = await connectTestClient(mockGmail(), mockDocs());
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["append_to_google_doc", "create_email_draft", "send_email"]);
    for (const tool of listed.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
    await client.close();
    await server.close();
  });

  it("creates a draft and sends email through tools", async () => {
    const { client, server } = await connectTestClient(mockGmail(), mockDocs());
    const draft = parseEnvelope(await client.callTool({ name: "create_email_draft", arguments: validEmailInput() }));
    expect(draft).toEqual({
      success: true,
      draftId: "gmail-draft-id",
      message: "Email draft created successfully.",
    });

    const sent = parseEnvelope(await client.callTool({ name: "send_email", arguments: validEmailInput() }));
    expect(sent).toEqual({
      success: true,
      messageId: "gmail-message-id",
      threadId: "gmail-thread-id",
      message: "Email sent successfully.",
    });
    await client.close();
    await server.close();
  });

  it("appends to a Google Doc through a tool", async () => {
    const { client, server } = await connectTestClient(mockGmail(), mockDocs());
    const result = parseEnvelope(
      await client.callTool({
        name: "append_to_google_doc",
        arguments: { documentId: "google-document-id", content: "## Summary" },
      }),
    );
    expect(result).toEqual({
      success: true,
      documentId: "google-document-id",
      message: "Content appended successfully.",
    });
    await client.close();
    await server.close();
  });

  it("returns INVALID_EMAIL without calling Gmail", async () => {
    const gmail = mockGmail();
    const { client, server } = await connectTestClient(gmail, mockDocs());
    const result = parseEnvelope(
      await client.callTool({
        name: "send_email",
        arguments: { ...validEmailInput(), to: ["bad"] },
      }),
    );
    expect(result).toEqual({
      success: false,
      error: {
        code: "INVALID_EMAIL",
        message: "The recipient email address is invalid.",
      },
    });
    expect(gmail.calls).toEqual([]);
    await client.close();
    await server.close();
  });

  it("returns DOCUMENT_NOT_FOUND from the docs tool", async () => {
    const docs = mockDocs({
      async append() {
        throw new AppError(
          "DOCUMENT_NOT_FOUND",
          "The specified Google document could not be found or accessed.",
        );
      },
    });
    const { client, server } = await connectTestClient(mockGmail(), docs);
    const result = parseEnvelope(
      await client.callTool({
        name: "append_to_google_doc",
        arguments: { documentId: "missing-doc", content: "Hello" },
      }),
    );
    expect(result).toMatchObject({
      success: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
    await client.close();
    await server.close();
  });

  it("exposes UNKNOWN_TOOL as a structured envelope", () => {
    expect(unknownToolEnvelope("nope")).toEqual({
      success: false,
      error: { code: "UNKNOWN_TOOL", message: "Unknown tool: nope" },
    });
  });
});
