/**
 * Coarse title normalization used to build cache keys.
 *
 * Strategy:
 *  1. NFKD normalize so combined diacritics split into base + combining char
 *  2. Drop combining marks (Unicode `Diacritic` property)
 *  3. Lowercase
 *  4. Trim outer whitespace
 *  5. Collapse internal runs of whitespace to a single space
 *  6. Strip leading/trailing punctuation and symbol characters
 *
 * Middle punctuation (`:`, `(`, `&`) is intentionally preserved so different
 * editions / sub-titles produce different cache rows.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
}
