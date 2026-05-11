import { describe, expect, it } from 'bun:test';
import { CoverImageUrl } from '../cover-image-url';

describe('CoverImageUrl', () => {
  it('rejects empty string with cover_url_empty', () => {
    const r = CoverImageUrl.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_empty');
  });

  it('rejects whitespace-only string with cover_url_empty', () => {
    const r = CoverImageUrl.create('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_empty');
  });

  it('rejects http:// scheme with cover_url_not_https', () => {
    const r = CoverImageUrl.create('http://images.igdb.com/foo.jpg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_not_https');
  });

  it('rejects unknown host with cover_url_host_not_allowed', () => {
    const r = CoverImageUrl.create('https://malicious.example.com/x.jpg');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_host_not_allowed');
  });

  it('accepts images.igdb.com URL and preserves value', () => {
    const input = 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg';
    const r = CoverImageUrl.create(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe(input);
  });

  it('accepts utfs.io URL', () => {
    const r = CoverImageUrl.create('https://utfs.io/f/abc-key');
    expect(r.ok).toBe(true);
  });

  it('accepts wildcard *.ufs.sh subdomain', () => {
    const r = CoverImageUrl.create('https://xxxx.ufs.sh/f/abc-key');
    expect(r.ok).toBe(true);
  });

  it('rejects malformed URL with cover_url_invalid', () => {
    const r = CoverImageUrl.create('not-a-url');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('cover_url_invalid');
  });
});
