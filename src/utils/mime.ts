import { randomBytes } from "node:crypto";
import type { EmailInput } from "./validators.js";

export function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function buildMimeMessage(input: EmailInput): string {
  const headers: string[] = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (input.cc?.length) {
    headers.push(`Cc: ${input.cc.join(", ")}`);
  }
  if (input.bcc?.length) {
    headers.push(`Bcc: ${input.bcc.join(", ")}`);
  }
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(`References: ${input.inReplyTo}`);
  }

  if (input.htmlBody) {
    const boundary = `alt_${randomBytes(8).toString("hex")}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.body,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      input.htmlBody,
      `--${boundary}--`,
    ].join("\r\n");
  }

  headers.push("Content-Type: text/plain; charset=UTF-8");
  return [...headers, "", input.body].join("\r\n");
}

export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}
