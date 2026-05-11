import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type CoverImageUrlError =
  | { kind: 'cover_url_empty' }
  | { kind: 'cover_url_not_https' }
  | { kind: 'cover_url_invalid' }
  | { kind: 'cover_url_host_not_allowed' };

export class CoverImageUrl {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<CoverImageUrl, CoverImageUrlError> {
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

    const host = url.host;
    const allowed = host === 'images.igdb.com' || host === 'utfs.io' || host.endsWith('.ufs.sh');
    if (!allowed) {
      return err({ kind: 'cover_url_host_not_allowed' });
    }

    return ok(new CoverImageUrl(trimmed));
  }

  static fromTrusted(value: string): CoverImageUrl {
    return new CoverImageUrl(value);
  }
}
