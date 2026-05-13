import type {
  IgdbCredentialsVerifier,
  VerifyError,
} from '../../domain/integrations/igdb-credentials-verifier';
import { type Result, err, ok } from '../../domain/shared/result';
import type { Logger } from '../logging/logger';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

export interface TwitchIgdbCredentialsVerifierOptions {
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
  readonly logger: Logger;
}

/**
 * Verifies a `client_id` / `client_secret` pair against Twitch's OAuth2
 * client-credentials endpoint. Returns `ok` iff Twitch responds 2xx.
 *
 * Body parsing on the 200 path is intentionally skipped: the verifier
 * answers a single yes/no question and never returns the token. Token
 * lifecycle for IGDB calls is owned by `IgdbTokenStore`.
 */
export class TwitchIgdbCredentialsVerifier implements IgdbCredentialsVerifier {
  constructor(private readonly opts: TwitchIgdbCredentialsVerifierOptions) {}

  async verify(input: {
    clientId: string;
    clientSecret: string;
  }): Promise<Result<void, VerifyError>> {
    const body = new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'client_credentials',
    }).toString();

    let response: Response;
    try {
      response = await this.opts.fetch(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (cause) {
      const isAbort =
        cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError');
      const reason: 'timeout' | 'fetch_failed' = isAbort ? 'timeout' : 'fetch_failed';
      this.opts.logger.event('integration.igdb.verify.unavailable', { reason });
      return err({ kind: 'network_unreachable', reason });
    }

    if (response.ok) {
      this.opts.logger.event('integration.igdb.verify.success');
      return ok(undefined);
    }

    if (response.status >= 500) {
      this.opts.logger.event('integration.igdb.verify.unavailable', { status: response.status });
      return err({ kind: 'twitch_unavailable', status: response.status });
    }

    const reason = await this.parse4xxReason(response);
    this.opts.logger.event('integration.igdb.verify.invalid', { reason });
    return err({ kind: 'invalid_credentials', reason });
  }

  private async parse4xxReason(
    response: Response,
  ): Promise<'client_id' | 'client_secret' | 'unknown'> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      // Body unreadable (already consumed / connection cut). The status is
      // still a hard 4xx, so we keep the error kind but lose the hint.
      return 'unknown';
    }
    const lower = text.toLowerCase();
    if (lower.includes('invalid client secret')) return 'client_secret';
    if (lower.includes('invalid client')) return 'client_id';
    return 'unknown';
  }
}
