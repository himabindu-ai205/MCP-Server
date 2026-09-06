import type { DocsApi, DocsAppendResult } from "../google/docs-client.js";
import { parseAppendInput } from "../utils/validators.js";

export class DocsService {
  constructor(private readonly client: DocsApi) {}

  async append(input: unknown): Promise<DocsAppendResult> {
    const parsed = parseAppendInput(input);
    return this.client.append(parsed.documentId, parsed.content);
  }
}
