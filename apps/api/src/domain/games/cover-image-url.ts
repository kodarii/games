import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type CoverImageUrlError =
  | { kind: 'cover_url_empty' }
  | { kind: 'cover_url_not_https' }
  | { kind: 'cover_url_invalid' }
  | { kind: 'cover_url_host_not_allowed' };

/**
 * Predicate the caller injects so the domain stays agnostic about which CDNs
 * a particular deployment whitelists. The list lives in
 * `infrastructure/config/cover-hosts.ts` and is wired into use cases.
 */
export type IsCoverHostAllowed = (host: string) => boolean;

export class CoverImageUrl {
  private constructor(public readonly value: string) {}

  static create(
    raw: string,
    opts: { isHostAllowed: IsCoverHostAllowed },
  ): Result<CoverImageUrl, CoverImageUrlError> {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return err({ kind: 'cover_url_empty' });
    }

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return err({ kind: 'cover_url_invalid' });
    }

    if (url.protocol !== 'https:') {
      return err({ kind: 'cover_url_not_https' });
    }

    if (!opts.isHostAllowed(url.host)) {
      return err({ kind: 'cover_url_host_not_allowed' });
    }

    return ok(new CoverImageUrl(trimmed));
  }

  static fromTrusted(value: string): CoverImageUrl {
    return new CoverImageUrl(value);
  }
}
