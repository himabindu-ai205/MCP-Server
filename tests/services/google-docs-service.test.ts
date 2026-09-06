import { describe, expect, it } from "vitest";
import { AppError } from "../../src/errors/app-error.js";
import { DocsService } from "../../src/services/google-docs-service.js";
import { mockDocs } from "../helpers.js";

describe("DocsService", () => {
  it("appends content after validation", async () => {
    const docs = mockDocs();
    const service = new DocsService(docs);
    await expect(
      service.append({ documentId: "google-document-id", content: "Hello" }),
    ).resolves.toEqual({ documentId: "google-document-id" });
    expect(docs.calls).toEqual(["append"]);
  });

  it("rejects missing documentId or content without calling Google", async () => {
    const docs = mockDocs();
    const service = new DocsService(docs);
    await expect(service.append({ documentId: "", content: "Hello" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      service.append({ documentId: "google-document-id", content: "   " }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(docs.calls).toEqual([]);
  });

  it("rejects an unexpected document id format", async () => {
    const docs = mockDocs();
    const service = new DocsService(docs);
    await expect(
      service.append({ documentId: "bad id!", content: "Hello" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(docs.calls).toEqual([]);
  });

  it("maps document-not-found and auth failures", async () => {
    const missing = mockDocs({
      async append() {
        throw new AppError(
          "DOCUMENT_NOT_FOUND",
          "The specified Google document could not be found or accessed.",
        );
      },
    });
    await expect(
      new DocsService(missing).append({ documentId: "missing-doc", content: "Hello" }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });

    const auth = mockDocs({
      async append() {
        throw new AppError("AUTHENTICATION_FAILED", "Unable to authenticate with Google.");
      },
    });
    await expect(
      new DocsService(auth).append({ documentId: "google-document-id", content: "Hello" }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED" });
  });
});
