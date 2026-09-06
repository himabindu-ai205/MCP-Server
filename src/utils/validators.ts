import { z } from "zod";
import { AppError } from "../errors/app-error.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCUMENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

export const emailAddressSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => EMAIL_RE.test(value), { message: "invalid email" });

export const emailInputSchema = z.object({
  to: z.array(emailAddressSchema).min(1, "Recipient email address is required."),
  cc: z.array(emailAddressSchema).optional(),
  bcc: z.array(emailAddressSchema).optional(),
  subject: z.string().trim().min(1, "Subject is required."),
  body: z.string().trim().min(1, "Email body is required."),
  htmlBody: z.string().optional(),
  threadId: z.string().min(1).optional(),
  inReplyTo: z.string().min(1).optional(),
});

export const appendInputSchema = z.object({
  documentId: z
    .string()
    .trim()
    .min(1, "documentId is required.")
    .regex(DOCUMENT_ID_RE, "documentId has an unexpected format."),
  content: z.string().trim().min(1, "content is required."),
});

export type EmailInput = z.infer<typeof emailInputSchema>;
export type AppendInput = z.infer<typeof appendInputSchema>;

export function parseEmailInput(value: unknown): EmailInput {
  const parsed = emailInputSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw mapZodError(parsed.error, "email");
}

export function parseAppendInput(value: unknown): AppendInput {
  const parsed = appendInputSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw mapZodError(parsed.error, "docs");
}

function mapZodError(error: z.ZodError, surface: "email" | "docs"): AppError {
  const issue = error.issues[0];
  const path = issue?.path.join(".") ?? "";

  if (surface === "email" && /^(to|cc|bcc)/.test(path) && /invalid email/i.test(issue?.message ?? "")) {
    return new AppError("INVALID_EMAIL", "The recipient email address is invalid.");
  }

  if (surface === "docs" && path === "documentId" && issue?.code === "invalid_string") {
    return new AppError("VALIDATION_ERROR", "documentId has an unexpected format.");
  }

  return new AppError("VALIDATION_ERROR", issue?.message ?? "Request validation failed.");
}
