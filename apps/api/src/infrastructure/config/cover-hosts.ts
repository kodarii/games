/**
 * Allowed hosts for cover image URLs. Adding a new provider whose images live
 * on a different CDN means appending here — no domain changes required.
 *
 * `ALLOWED_COVER_HOST_SUFFIXES` matches arbitrary subdomain prefixes
 * (e.g. `*.ufs.sh` accepts `abc.ufs.sh`). Suffix entries MUST start with a
 * dot so plain `ufs.sh` is NOT considered a wildcard match.
 */
export const ALLOWED_COVER_HOSTS: readonly string[] = ['images.igdb.com', 'utfs.io'];
export const ALLOWED_COVER_HOST_SUFFIXES: readonly string[] = ['.ufs.sh'];

export function isCoverHostAllowed(host: string): boolean {
  if (ALLOWED_COVER_HOSTS.includes(host)) return true;
  return ALLOWED_COVER_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
