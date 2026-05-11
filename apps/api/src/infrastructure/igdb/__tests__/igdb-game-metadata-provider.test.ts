import { describe, expect, it } from 'bun:test';
import { IgdbGameMetadataProvider } from '../igdb-game-metadata-provider';
import { IgdbHttpError } from '../igdb-http-client';

interface FakeClientCall {
  path: string;
  body: string;
}

interface FakeClient {
  post(path: string, body: string): Promise<Response>;
  calls: FakeClientCall[];
}

function makeOkClient(payload: unknown): FakeClient {
  const calls: FakeClientCall[] = [];
  return {
    calls,
    async post(path, body) {
      calls.push({ path, body });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
}

function makeThrowingClient(error: unknown): FakeClient {
  const calls: FakeClientCall[] = [];
  return {
    calls,
    async post(path, body) {
      calls.push({ path, body });
      throw error;
    },
  };
}

const RESIDENT_EVIL_4_FIXTURE = [
  {
    id: 12345,
    name: 'Resident Evil 4',
    first_release_date: 1106956800, // 2005-01-29
    cover: { image_id: 'co1abc' },
    platforms: [{ name: 'PlayStation 2' }, { name: 'GameCube' }],
    involved_companies: [
      { developer: true, company: { name: 'Capcom' } },
      { developer: false, company: { name: 'Capcom Production Studio 4' } },
    ],
  },
  {
    id: 67890,
    name: 'Resident Evil 4 (Remake)',
    first_release_date: 1679443200, // 2023-03-22
    cover: { image_id: 'co2def' },
    platforms: [{ name: 'PlayStation 5' }],
    involved_companies: [{ developer: true, company: { name: 'Capcom' } }],
  },
];

describe('IgdbGameMetadataProvider', () => {
  it('sends a byte-exact Apicalypse body to /games (GOLDEN)', async () => {
    const client = makeOkClient([]);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });

    await provider.search({ title: 'Resident Evil 4', platform: 'PS2' });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.path).toBe('/games');
    // GOLDEN: changing this string breaks the wire contract. Touch with care.
    const expected =
      'fields name, cover.image_id, first_release_date, involved_companies.company.name, involved_companies.developer, platforms.name; search "Resident Evil 4"; where platforms = (8); limit 10;';
    expect(client.calls[0]?.body).toBe(expected);
  });

  it('escapes double-quotes in the search title', async () => {
    const client = makeOkClient([]);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    await provider.search({ title: 'a"b', platform: 'PS2' });
    expect(client.calls[0]?.body).toContain('search "a\\"b"');
  });

  it('maps a happy-path response to vendor-neutral candidates', async () => {
    const client = makeOkClient(RESIDENT_EVIL_4_FIXTURE);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });

    const result = await provider.search({ title: 'Resident Evil 4', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { candidates } = result.value;
    expect(candidates).toHaveLength(2);

    const first = candidates[0];
    expect(first?.providerName).toBe('igdb');
    expect(first?.providerId).toBe('12345');
    expect(first?.title).toBe('Resident Evil 4');
    expect(first?.developer).toBe('Capcom');
    expect(first?.releaseYear).toBe(2005);
    expect(first?.coverImageUrl).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
    );
    expect(first?.platformNames).toEqual(['PlayStation 2', 'GameCube']);
  });

  it('returns null for missing optional fields (no cover, no involved_companies)', async () => {
    const client = makeOkClient([
      {
        id: 1,
        name: 'Bare',
      },
    ]);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });

    const result = await provider.search({ title: 'Bare', platform: 'PS2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.value.candidates[0];
    expect(c?.developer).toBeNull();
    expect(c?.releaseYear).toBeNull();
    expect(c?.coverImageUrl).toBeNull();
    expect(c?.platformNames).toEqual([]);
  });

  it('skips fetch entirely on unknown platform and returns platform_unsupported', async () => {
    const client = makeOkClient([]);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });

    const result = await provider.search({ title: 'X', platform: 'RetroConsole' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('platform_unsupported');
    expect(client.calls).toHaveLength(0);
  });

  it('maps IgdbHttpError(unavailable) to err({kind:"unavailable"})', async () => {
    const client = makeThrowingClient(new IgdbHttpError('unavailable', 'IGDB down'));
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('unavailable');
  });

  it('maps IgdbHttpError(rate_limited) to err({kind:"rate_limited"})', async () => {
    const client = makeThrowingClient(new IgdbHttpError('rate_limited', 'slow down'));
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('rate_limited');
  });

  it('maps IgdbHttpError(invalid_response) to err({kind:"invalid_response"})', async () => {
    const client = makeThrowingClient(new IgdbHttpError('invalid_response', 'bad'));
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_response');
  });

  it('returns invalid_response when response shape fails Zod', async () => {
    const client = makeOkClient([{ id: 'not-a-number', name: 'X' }]);
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_response');
  });

  it('returns invalid_response when response is not an array', async () => {
    const client = makeOkClient({ not: 'an-array' });
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_response');
  });

  it('returns invalid_response when JSON parse throws', async () => {
    const client: FakeClient = {
      calls: [],
      async post() {
        return new Response('not-json{', { status: 200 });
      },
    };
    const provider = new IgdbGameMetadataProvider({ httpClient: client });
    const result = await provider.search({ title: 'X', platform: 'PS2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid_response');
  });
});
