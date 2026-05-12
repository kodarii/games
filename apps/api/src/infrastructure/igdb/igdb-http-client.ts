import type { CircuitBreaker } from './circuit-breaker';
import type { IgdbTokenStore } from './igdb-token-store';
import type { TokenBucketRateLimiter } from '../metadata/rate-limiter';

const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES
const BASE_BACKOFF_MS = 200;
const JITTER_MAX_MS = 150;
const DEFAULT_MAX_INFLIGHT = 8;

export type IgdbHttpErrorKind = 'unavailable' | 'rate_limited' | 'invalid_response';

/** Thrown when an IGDB HTTP call fails terminally. */
export class IgdbHttpError extends Error {
  constructor(
    readonly kind: IgdbHttpErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IgdbHttpError';
  }
}

/** Narrow shape of the token store the client depends on (decouples tests). */
type TokenStorePort = Pick<IgdbTokenStore, 'getValidToken' | 'forceRefresh'>;

export interface IgdbHttpClientOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly tokenStore: TokenStorePort;
  readonly rateLimiter: TokenBucketRateLimiter;
  readonly breaker: CircuitBreaker;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly maxInflight?: number;
  /** Injectable for tests so backoff delays don't burn real time. */
  readonly setTimeoutImpl?: typeof setTimeout;
  /** Injectable so jitter is deterministic in tests. */
  readonly random?: () => number;
}

/**
 * IGDB HTTP client wrapping fetch with: rate limiting, in-flight concurrency
 * cap, circuit breaker, retry on 429/5xx/network error, and single forced
 * token refresh on 401.
 *
 * The client is Apicalypse-agnostic — it accepts a path + body string and
 * sets the IGDB-required headers. Body shaping (Apicalypse) lives in the
 * adapter layer (Phase 4).
 */
export class IgdbHttpClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly tokenStore: TokenStorePort;
  private readonly rateLimiter: TokenBucketRateLimiter;
  private readonly breaker: CircuitBreaker;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxInflight: number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly random: () => number;

  private inflight = 0;
  private readonly semaphoreWaiters: Array<() => void> = [];

  constructor(opts: IgdbHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.clientId = opts.clientId;
    this.tokenStore = opts.tokenStore;
    this.rateLimiter = opts.rateLimiter;
    this.breaker = opts.breaker;
    this.timeoutMs = opts.timeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxInflight = opts.maxInflight ?? DEFAULT_MAX_INFLIGHT;
    this.setTimeoutImpl = opts.setTimeoutImpl ?? setTimeout;
    this.random = opts.random ?? Math.random;
  }

  async post(path: string, body: string): Promise<Response> {
    if (!this.breaker.canRequest()) {
      throw new IgdbHttpError('unavailable', 'IGDB circuit breaker is open');
    }
    await this.rateLimiter.acquire();
    await this.acquireSemaphore();
    try {
      return await this.executeWithRetries(path, body);
    } finally {
      this.releaseSemaphore();
    }
  }

  private async executeWithRetries(path: string, body: string): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let attempt = 0;
    let refreshed = false;
    let lastError: unknown = null;
    let lastStatus: number | null = null;

    while (attempt <= MAX_RETRIES) {
      const token = await this.tokenStore.getValidToken();
      const fetchResult = await this.runFetch(url, body, token);

      if (fetchResult.kind === 'response') {
        const response = fetchResult.response;
        const status = response.status;
        if (status === 401 && !refreshed) {
          // Force one refresh and retry without counting it as a backoff attempt.
          refreshed = true;
          await this.tokenStore.forceRefresh();
          continue;
        }
        if (status === 401) {
          this.breaker.recordFailure();
          throw new IgdbHttpError('unavailable', 'IGDB returned 401 after token refresh');
        }
        if (status === 429) {
          lastStatus = status;
          if (attempt >= MAX_RETRIES) {
            this.breaker.recordFailure();
            throw new IgdbHttpError('rate_limited', 'IGDB rate-limited after retries');
          }
          const waitMs = this.computeRetryAfterMs(response.headers.get('retry-after'), attempt);
          await this.sleep(waitMs);
          attempt += 1;
          continue;
        }
        if (status >= 500 && status < 600) {
          lastStatus = status;
          if (attempt >= MAX_RETRIES) {
            this.breaker.recordFailure();
            throw new IgdbHttpError('unavailable', `IGDB returned ${status} after retries`);
          }
          await this.sleep(this.computeBackoffMs(attempt));
          attempt += 1;
          continue;
        }
        // Success path (2xx) or non-retryable client error (4xx other than 401/429)
        if (status >= 200 && status < 300) {
          this.breaker.recordSuccess();
          return response;
        }
        // Other 4xx — non-retryable. Surface as invalid_response so callers can map it.
        this.breaker.recordFailure();
        throw new IgdbHttpError('invalid_response', `IGDB returned non-retryable status ${status}`);
      }

      // Network error
      lastError = fetchResult.error;
      if (attempt >= MAX_RETRIES) {
        this.breaker.recordFailure();
        throw new IgdbHttpError(
          'unavailable',
          'IGDB network error after retries',
          this.scrubCause(lastError),
        );
      }
      await this.sleep(this.computeBackoffMs(attempt));
      attempt += 1;
    }

    // Defensive: loop must exit via return or throw. Keep as a typed safeguard.
    this.breaker.recordFailure();
    throw new IgdbHttpError(
      'unavailable',
      `IGDB request exhausted retries (lastStatus=${lastStatus ?? 'n/a'})`,
    );
  }

  private async runFetch(
    url: string,
    body: string,
    token: string,
  ): Promise<{ kind: 'response'; response: Response } | { kind: 'error'; error: unknown }> {
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'client-id': this.clientId,
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'text/plain',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { kind: 'response', response };
    } catch (error) {
      return { kind: 'error', error };
    }
  }

  private computeBackoffMs(attempt: number): number {
    const base = BASE_BACKOFF_MS * 2 ** attempt;
    const jitter = Math.floor(this.random() * JITTER_MAX_MS);
    return base + jitter;
  }

  private computeRetryAfterMs(header: string | null, attempt: number): number {
    if (header === null) {
      return this.computeBackoffMs(attempt);
    }
    const trimmed = header.trim();
    // Try integer seconds first
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.ceil(asNumber * 1000);
    }
    // HTTP-date
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      return delta > 0 ? delta : 0;
    }
    return this.computeBackoffMs(attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.setTimeoutImpl(() => resolve(), ms);
    });
  }

  private acquireSemaphore(): Promise<void> {
    if (this.inflight < this.maxInflight) {
      this.inflight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.semaphoreWaiters.push(() => {
        this.inflight += 1;
        resolve();
      });
    });
  }

  private releaseSemaphore(): void {
    this.inflight -= 1;
    const next = this.semaphoreWaiters.shift();
    if (next) {
      next();
    }
  }

  /**
   * Strip anything that could carry the bearer token out of an error cause
   * before attaching it to an `IgdbHttpError`. Network errors from native
   * fetch don't normally include headers, but defense-in-depth.
   */
  private scrubCause(cause: unknown): unknown {
    if (cause instanceof Error) {
      return new Error(cause.message);
    }
    return undefined;
  }
}

/**
 * Returns a copy of the given headers map with `Authorization` replaced by
 * `[REDACTED]`. Use this when logging request shape so the bearer token
 * never reaches log output.
 */
export function redactAuthHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = key.toLowerCase() === 'authorization' ? '[REDACTED]' : value;
  }
  return out;
}
