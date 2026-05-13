import type { Result } from '../shared/result';

/**
 * Failure modes returned by {@link IgdbCredentialsVerifier.verify}.
 *
 * - `invalid_credentials`: Twitch authoritatively rejected the pair. The
 *   `reason` discriminator narrows the hint to `client_id` / `client_secret`
 *   when Twitch's 4xx body identifies which side is wrong, otherwise
 *   `unknown`.
 * - `twitch_unavailable`: Twitch responded with 5xx. The HTTP `status` is
 *   surfaced so the caller can decide whether to retry vs. surface a generic
 *   outage to the user.
 * - `network_unreachable`: the request never produced an HTTP response —
 *   either it timed out (`AbortSignal.timeout`) or `fetch` itself threw
 *   (DNS, TLS, connection reset).
 */
export type VerifyError =
  | { kind: 'invalid_credentials'; reason: 'client_id' | 'client_secret' | 'unknown' }
  | { kind: 'twitch_unavailable'; status: number }
  | { kind: 'network_unreachable'; reason: 'timeout' | 'fetch_failed' };

/**
 * Port: answers "would Twitch accept these IGDB credentials right now?".
 *
 * Plaintext in, no token out — the verifier deliberately does not return
 * the access token. Token acquisition / caching for actual IGDB calls is a
 * separate concern handled by `IgdbTokenStore`.
 *
 * Implementations MUST NOT throw on network / HTTP failures; everything
 * surfaces through the {@link VerifyError} tagged union.
 */
export interface IgdbCredentialsVerifier {
  verify(input: { clientId: string; clientSecret: string }): Promise<Result<void, VerifyError>>;
}
