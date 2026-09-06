import { google } from "googleapis";
import type { AppConfig } from "../config/configuration.js";
import { AppError } from "../errors/app-error.js";

export type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

export interface TokenStore {
  getRefreshToken(): string;
}

export class EnvTokenStore implements TokenStore {
  constructor(private readonly refreshToken: string) {}

  getRefreshToken(): string {
    return this.refreshToken;
  }
}

export interface CredentialProvider {
  getAuthClient(): Promise<GoogleOAuthClient>;
}

export class GoogleAuthProvider implements CredentialProvider {
  private readonly oauthClient: GoogleOAuthClient;
  private readonly tokenStore: TokenStore;

  constructor(config: AppConfig, tokenStore: TokenStore = new EnvTokenStore(config.googleRefreshToken)) {
    this.tokenStore = tokenStore;
    this.oauthClient = new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri,
    );
    this.oauthClient.setCredentials({ refresh_token: this.tokenStore.getRefreshToken() });
  }

  async getAuthClient(): Promise<GoogleOAuthClient> {
    try {
      const result = await this.oauthClient.getAccessToken();
      if (!result.token) {
        throw new AppError("AUTHENTICATION_FAILED", "Unable to authenticate with Google.");
      }
      return this.oauthClient;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError("AUTHENTICATION_FAILED", "Unable to authenticate with Google.");
    }
  }
}
