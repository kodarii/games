import { describe, expect, it } from 'bun:test';
import { parseImport } from '../parse-import';

const validV2 = {
  version: 2,
  exportedAt: '2024-01-01T00:00:00.000Z',
  platforms: [{ externalId: 'p-1', name: 'PS5' }],
  games: [
    {
      externalId: 'g-1',
      title: 'God of War',
      developer: 'Santa Monica',
      genre: 'Action',
      releaseYear: 2018,
      platform: 'PS5',
      hoursPlayed: 30,
      status: 'Completed' as const,
      format: 'digital' as const,
    },
  ],
};

const validV1 = {
  version: 1,
  exportedAt: '2024-01-01T00:00:00.000Z',
  platforms: [{ name: 'PS4' }, { name: 'Switch' }],
  games: [
    {
      title: 'Bloodborne',
      developer: 'FromSoftware',
      genre: 'Action RPG',
      releaseYear: 2015,
      platform: 'PS4',
      hoursPlayed: 50,
      status: 'Completed' as const,
      format: 'physical' as const,
    },
    {
      title: 'Zelda',
      developer: 'Nintendo',
      genre: 'Adventure',
      releaseYear: 2017,
      platform: 'Switch',
      hoursPlayed: 80,
      status: 'Playing' as const,
      format: 'digital' as const,
    },
    {
      title: 'Mario',
      developer: 'Nintendo',
      genre: 'Platformer',
      releaseYear: 2017,
      platform: 'Switch',
      hoursPlayed: 20,
      status: 'Backlog' as const,
      format: 'digital' as const,
    },
  ],
};

describe('parseImport', () => {
  it('returns invalid_json for malformed JSON', () => {
    const result = parseImport('{not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_json');
  });

  it('returns invalid_shape when no version and not a valid external snapshot', () => {
    const result = parseImport('{"foo": 1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_shape');
  });

  it('parses external (no-version) format and synthesises platforms + defaults', () => {
    let n = 0;
    const idGen = () => `id-${++n}`;
    const now = () => '2026-04-29T00:00:00.000Z';
    const ext = {
      games: [
        { title: 'Bloodborne', releaseYear: 2026, platform: 'PS4', format: 'physical', coverColor: '#f4a261' },
        { title: 'Mario', releaseYear: 2017, platform: 'Switch', format: 'digital' },
        { title: 'Zelda', releaseYear: 2017, platform: 'Switch', format: 'digital' },
      ],
    };
    const result = parseImport(JSON.stringify(ext), idGen, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      expect(result.value.exportedAt).toBe('2026-04-29T00:00:00.000Z');
      expect(result.value.platforms.map((p) => p.name)).toEqual(['PS4', 'Switch']);
      expect(result.value.platforms[0]?.externalId).toBe('id-1');
      expect(result.value.platforms[1]?.externalId).toBe('id-2');
      expect(result.value.games).toHaveLength(3);
      expect(result.value.games[0]?.developer).toBe('Unknown');
      expect(result.value.games[0]?.genre).toBe('');
      expect(result.value.games[0]?.hoursPlayed).toBe(0);
      expect(result.value.games[0]?.status).toBe('Backlog');
      expect(result.value.games[0]?.coverColor).toBe('#f4a261');
      expect(result.value.games[0]?.externalId).toBe('id-3');
    }
  });

  it('rejects external format with invalid game shape (missing platform)', () => {
    const ext = { games: [{ title: 'X', releaseYear: 2020, format: 'physical' }] };
    const result = parseImport(JSON.stringify(ext));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_shape');
  });

  it('returns unsupported_version for unknown version', () => {
    const result = parseImport('{"version": 99}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unsupported_version');
      if (result.error.kind === 'unsupported_version') expect(result.error.version).toBe(99);
    }
  });

  it('returns invalid_shape for v2 with missing title', () => {
    const bad = { ...validV2, games: [{ externalId: 'g-1', developer: 'X', genre: 'Y', releaseYear: 2020, platform: 'PS5', hoursPlayed: 0, status: 'Backlog', format: 'digital' }] };
    const result = parseImport(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_shape');
  });

  it('returns ok for valid v2 input and migrates to v3', () => {
    const result = parseImport(JSON.stringify(validV2));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      expect(result.value.platforms[0]?.name).toBe('PS5');
    }
  });

  it('migrates v1 to v3 with deterministic idGenerator', () => {
    const gen = () => 'fixed-uuid';
    const result = parseImport(JSON.stringify(validV1), gen);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      result.value.platforms.forEach((p) => expect(p.externalId).toBe('fixed-uuid'));
      result.value.games.forEach((g) => expect(g.externalId).toBe('fixed-uuid'));
    }
  });

  it('migrates v1 to v3 assigning unique UUIDs per record with counter', () => {
    let n = 0;
    const gen = () => `uuid-${++n}`;
    const result = parseImport(JSON.stringify(validV1), gen);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.platforms[0]?.externalId).toBe('uuid-1');
      expect(result.value.platforms[1]?.externalId).toBe('uuid-2');
      expect(result.value.games[0]?.externalId).toBe('uuid-3');
      expect(result.value.games[1]?.externalId).toBe('uuid-4');
      expect(result.value.games[2]?.externalId).toBe('uuid-5');
    }
  });

  it('accepts v3 with price and purchasedAt', () => {
    const v3 = {
      version: 3,
      exportedAt: '2024-01-01T00:00:00.000Z',
      platforms: [{ externalId: 'p-1', name: 'PS5' }],
      games: [
        {
          externalId: 'g-1',
          title: 'God of War',
          developer: 'Santa Monica',
          genre: 'Action',
          releaseYear: 2018,
          platform: 'PS5',
          hoursPlayed: 30,
          status: 'Completed' as const,
          format: 'digital' as const,
          price: 12999,
          purchasedAt: '2024-06-15',
        },
      ],
    };
    const result = parseImport(JSON.stringify(v3));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      expect(result.value.games[0]?.price).toBe(12999);
      expect(result.value.games[0]?.purchasedAt).toBe('2024-06-15');
    }
  });

  it('migrates v2 by setting price/purchasedAt to null', () => {
    const result = parseImport(JSON.stringify(validV2));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      result.value.games.forEach((g) => {
        expect(g.price).toBeNull();
        expect(g.purchasedAt).toBeNull();
      });
    }
  });

  it('migrates v1 by setting price/purchasedAt to null', () => {
    const gen = () => 'fixed-uuid';
    const result = parseImport(JSON.stringify(validV1), gen);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(4);
      result.value.games.forEach((g) => {
        expect(g.price).toBeNull();
        expect(g.purchasedAt).toBeNull();
      });
    }
  });
});
