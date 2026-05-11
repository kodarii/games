// Single-process assumption: in-process Promise lock prevents concurrent refresh WITHIN this process only.
// Horizontal scale-out would race on DB write; revisit if deployed to >1 instance.

import { z } from 'zod';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000; // refresh when less than 1 day to expiry
const TWITCH_TIMEOUT_MS = 8000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
});

/** Persisted shape of the single IGDB OAuth token row. */
export interface StoredIgdbToken {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly obtainedAt: Date;
}

/**
 * Persistence port. Production wires this to a Drizzle-backed implementation
 * that targets the `igdb_oauth_token` table (id = 1). Tests inject an
 * in-memory fake.
 */
export interface IgdbTokenStorage {
  read(): Promise<StoredIgdbToken | null>;
  write(record: StoredIgdbToken): Promise<void>;
}

export interface IgdbTokenStoreOptions {
  readonly storage: IgdbTokenStorage;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

export class IgdbTokenStoreError extends Error {
  constructor(
    message: string,
    readonly kind: 'twitch_http' | 'twitch_unauthorized' | 'invalid_response',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'IgdbTokenStoreError';
  }
}

export class IgdbTokenStore {
  private readonly storage: IgdbTokenStorage;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  private inflightRefresh: Promise<string> | null = null;

  constructor(opts: IgdbTokenStoreOptions) {
    this.storage = opts.storage;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }

  async getValidToken(): Promise<string> {
    const existing = await this.storage.read();
    if (existing !== null && this.isUsable(existing)) {
      return existing.accessToken;
    }
    return this.refreshOnce();
  }

  async forceRefresh(): Promise<string> {
    return this.refreshOnce();
  }

  private isUsable(token: StoredIgdbToken): boolean {
    const remaining = token.expiresAt.getTime() - this.now().getTime();
    return remaining > REFRESH_GRACE_MS;
  }

  private refreshOnce(): Promise<string> {
    if (this.inflightRefresh !== null) {
      return this.inflightRefresh;
    }
    const promise = this.doRefresh().finally(() => {
      this.inflightRefresh = null;
    });
    this.inflightRefresh = promise;
    return promise;
  }

  private async doRefresh(): Promise<string> {
    const fetched = await this.fetchTwitchToken();
    // Persist FIRST. Only if persistence succeeds do we treat the token as
    // valid. If the DB write throws, the inflight Promise rejects and the
    // next caller restarts the cycle.
    const obtainedAt = this.now();
    const expiresAt = new Date(obtainedAt.getTime() + fetched.expiresInSeconds * 1000);
    await this.storage.write({
      accessToken: fetched.accessToken,
      expiresAt,
      obtainedAt,
    });
    return fetched.accessToken;
  }

  private async fetchTwitchToken(): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    }).toString();

    const response = await this.fetchImpl(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(TWITCH_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      throw new IgdbTokenStoreError(
        `Twitch OAuth rejected credentials (status ${response.status})`,
        'twitch_unauthorized',
        response.status,
      );
    }
    if (!response.ok) {
      throw new IgdbTokenStoreError(
        `Twitch OAuth returned non-OK status ${response.status}`,
        'twitch_http',
        response.status,
      );
    }

    const raw: unknown = await response.json();
    const parsed = tokenResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new IgdbTokenStoreError(
        `Twitch OAuth response did not match schema: ${parsed.error.message}`,
        'invalid_response',
      );
    }
    return {
      accessToken: parsed.data.access_token,
      expiresInSeconds: parsed.data.expires_in,
    };
  }
}
