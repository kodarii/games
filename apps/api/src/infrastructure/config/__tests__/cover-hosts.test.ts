import { describe, expect, it } from 'bun:test';
import { isCoverHostAllowed } from '../cover-hosts';

describe('cover-hosts config', () => {
  it('allows exact-match hosts', () => {
    expect(isCoverHostAllowed('images.igdb.com')).toBe(true);
    expect(isCoverHostAllowed('utfs.io')).toBe(true);
  });

  it('allows subdomains matching a registered suffix', () => {
    expect(isCoverHostAllowed('abc.ufs.sh')).toBe(true);
    expect(isCoverHostAllowed('xyz.region.ufs.sh')).toBe(true);
  });

  it('rejects hosts that are not in the allowlist', () => {
    expect(isCoverHostAllowed('evil.example.com')).toBe(false);
    expect(isCoverHostAllowed('images.igdb.com.evil.com')).toBe(false);
  });

  it('rejects bare suffix without the leading subdomain dot', () => {
    expect(isCoverHostAllowed('ufs.sh')).toBe(false);
  });

  it('is case-sensitive on the host name', () => {
    expect(isCoverHostAllowed('IMAGES.IGDB.COM')).toBe(false);
  });
});
