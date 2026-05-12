import { describe, expect, it } from 'bun:test';
import { CoverImageUrl } from '../cover-image-url';

const igdbOnly = { isHostAllowed: (host: string) => host === 'images.igdb.com' };
const uploadthing = {
  isHostAllowed: (host: string) => host === 'utfs.io' || host.endsWith('.ufs.sh'),
};
const denyAll = { isHostAllowed: (_host: string) => false };

describe('CoverImageUrl', () => {
  it('rejects empty string with cover_url_empty', () => {
    const r = CoverImageUrl.create('', igdbOnly);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_empty');
  });

  it('rejects whitespace-only string with cover_url_empty', () => {
    const r = CoverImageUrl.create('   ', igdbOnly);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_empty');
  });

  it('rejects http:// scheme with cover_url_not_https', () => {
    const r = CoverImageUrl.create('http://images.igdb.com/foo.jpg', igdbOnly);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_not_https');
  });

  it('rejects malformed URL with cover_url_invalid', () => {
    const r = CoverImageUrl.create('not-a-url', igdbOnly);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_invalid');
  });

  it('rejects host not in the supplied allow predicate', () => {
    const r = CoverImageUrl.create('https://malicious.example.com/x.jpg', igdbOnly);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_host_not_allowed');
  });

  it('accepts a host the injected predicate allows (igdb)', () => {
    const input = 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg';
    const r = CoverImageUrl.create(input, igdbOnly);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe(input);
  });

  it('accepts a host the injected predicate allows (uploadthing exact)', () => {
    const r = CoverImageUrl.create('https://utfs.io/f/abc-key', uploadthing);
    expect(r.ok).toBe(true);
  });

  it('accepts a host the injected predicate allows (uploadthing suffix)', () => {
    const r = CoverImageUrl.create('https://xxxx.ufs.sh/f/abc-key', uploadthing);
    expect(r.ok).toBe(true);
  });

  it('rejects every host when the predicate is deny-all', () => {
    const r = CoverImageUrl.create('https://images.igdb.com/foo.jpg', denyAll);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_host_not_allowed');
  });

  it('treats the same URL differently when the host predicate changes', () => {
    const url = 'https://images.igdb.com/foo.jpg';
    const allowed = CoverImageUrl.create(url, igdbOnly);
    const blocked = CoverImageUrl.create(url, uploadthing);
    expect(allowed.ok).toBe(true);
    expect(blocked.ok).toBe(false);
  });
});
