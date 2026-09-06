import { google, type docs_v1 } from "googleapis";
import type { CredentialProvider } from "../auth/google-auth.js";
import { mapGoogleError } from "../errors/app-error.js";

export interface DocsAppendResult {
  documentId: string;
}

export interface DocsApi {
  append(documentId: string, content: string): Promise<DocsAppendResult>;
}

export class DocsClient implements DocsApi {
  constructor(private readonly credentials: CredentialProvider) {}

  async append(documentId: string, content: string): Promise<DocsAppendResult> {
    try {
      const docs = await this.docs();
      const document = await docs.documents.get({ documentId });
      const endIndex = resolveEndIndex(document.data);
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: endIndex },
                text: content,
              },
            },
          ],
        },
      });
      return { documentId };
    } catch (err) {
      throw mapGoogleError(err, "docs");
    }
  }

  private async docs(): Promise<docs_v1.Docs> {
    const auth = await this.credentials.getAuthClient();
    return google.docs({ version: "v1", auth });
  }
}

function resolveEndIndex(document: docs_v1.Schema$Document): number {
  const content = document.body?.content;
  if (!content?.length) {
    return 1;
  }
  const last = content[content.length - 1];
  const endIndex = last.endIndex;
  if (typeof endIndex !== "number" || endIndex < 2) {
    return 1;
  }
  return endIndex - 1;
}
