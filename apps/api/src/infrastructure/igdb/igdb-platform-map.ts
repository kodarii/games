/**
 * Static map of local platform names → IGDB platform ids.
 *
 * Single source of truth for the adapter. Keys are normalized to uppercase
 * with whitespace replaced by `_` so user-entered platform names like
 * `"Nintendo Switch"` and `"NINTENDO_SWITCH"` resolve to the same id.
 *
 * Ids verified against IGDB `/platforms` (see plan §"Local platform → IGDB
 * platform id" and §"Resolutions (IGDB docs pass)").
 */
const MAP: Record<string, number> = {
  PS2: 8,
  PS3: 9,
  PS4: 48,
  PS5: 167,
  SWITCH: 130,
  NINTENDO_SWITCH: 130,
  PC: 6,
  XBOX_ONE: 49,
  XBOX_SERIES_X: 169,
  XBOX_360: 12,
  XBOX: 11,
  WII: 5,
  WII_U: 41,
  GAMECUBE: 21,
  N64: 4,
  GAMEBOY_ADVANCE: 24,
  NINTENDO_DS: 20,
  NINTENDO_3DS: 37,
  PSP: 38,
  PS_VITA: 46,
  DREAMCAST: 23,
  GENESIS: 29,
};

function normalizeKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

export function mapPlatform(name: string): number | null {
  const key = normalizeKey(name);
  return MAP[key] ?? null;
}
