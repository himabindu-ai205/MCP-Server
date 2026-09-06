import { z } from "zod";
import { successEnvelope, toErrorEnvelope, type ToolEnvelope } from "../errors/app-error.js";
import type { DocsService } from "../services/google-docs-service.js";

export const appendDocInputShape = {
  documentId: z
    .string()
    .describe("Google Doc id from the document URL (the long id after /d/)."),
  content: z
    .string()
    .describe("Text to append at the end of the document. Written as supplied; markdown is not rendered."),
};

export const APPEND_TO_GOOGLE_DOC_DESCRIPTION =
  "Append caller-supplied text to the end of an existing Google Doc. Does not create a document, generate content, or interpret markdown. Requires documentId and content.";

export async function runAppendToGoogleDoc(
  service: DocsService,
  args: unknown,
): Promise<ToolEnvelope> {
  try {
    const result = await service.append(args);
    return successEnvelope("Content appended successfully.", { documentId: result.documentId });
  } catch (err) {
    return toErrorEnvelope(err);
  }
}
