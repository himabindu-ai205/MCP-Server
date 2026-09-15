import type { GenerateAuthUrlOpts } from "google-auth-library";
import { google } from "googleapis";
import { OAUTH_SCOPES } from "../config/configuration.js";
import { AppError } from "../errors/app-error.js";
import type { GoogleOAuthClient } from "./google-auth.js";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function assertExpectedGoogleAccount(actual: string | undefined, expected: string): void {
  const got = actual ? normalizeEmail(actual) : "";
  const want = normalizeEmail(expected);
  if (!got) {
    throw new AppError(
      "AUTHENTICATION_FAILED",
      `Could not read the authorized Google account. Re-run npm run auth and choose ${want}.`,
    );
  }
  if (got !== want) {
    throw new AppError(
      "AUTHENTICATION_FAILED",
      `Authorized Google account is ${got}, expected ${want}. Re-run npm run auth and select that account (Chrome's signed-in user is ignored unless you pick it).`,
    );
  }
}

export function emailFromIdToken(idToken?: string | null): string | undefined {
  if (!idToken) {
    return undefined;
  }
  const parts = idToken.split(".");
  if (parts.length < 2 || !parts[1]) {
    return undefined;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: string;
    };
    return payload.email?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function googleConsentUrlOptions(accountEmail?: string): GenerateAuthUrlOpts {
  return {
    access_type: "offline",
    prompt: "consent select_account",
    scope: [...OAUTH_SCOPES],
    ...(accountEmail ? { login_hint: accountEmail } : {}),
  };
}

export async function fetchAuthorizedEmail(client: GoogleOAuthClient): Promise<string | undefined> {
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    if (me.data.email) {
      return me.data.email;
    }
  } catch {
    // compose-only tokens may omit userinfo
  }

  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.emailAddress) {
      return profile.data.emailAddress;
    }
  } catch {
    // gmail.compose may not allow getProfile
  }

  return undefined;
}
