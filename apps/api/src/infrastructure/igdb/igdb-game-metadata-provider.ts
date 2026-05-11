import { z } from 'zod';
import type {
  GameMetadataCandidate,
  GameMetadataProvider,
  GameMetadataProviderError,
  GameMetadataSearchHit,
  GameMetadataSearchQuery,
} from '../../domain/games/game-metadata-provider';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import { IgdbHttpError } from './igdb-http-client';
import { mapPlatform } from './igdb-platform-map';

const DEFAULT_LIMIT = 10;

/**
 * Minimum surface of the IGDB HTTP client this adapter depends on. Decoupled
 * from the concrete `IgdbHttpClient` so unit tests can inject a fake without
 * also constructing rate-limiter / breaker / token-store plumbing.
 */
export interface IgdbHttpClientPort {
  post(path: string, body: string): Promise<Response>;
}

export interface IgdbGameMetadataProviderOptions {
  readonly httpClient: IgdbHttpClientPort;
}

const igdbInvolvedCompanySchema = z.object({
  developer: z.boolean(),
  company: z.object({ name: z.string() }),
});

const igdbPlatformSchema = z.object({ name: z.string() });

const igdbCoverSchema = z.object({ image_id: z.string() });

const igdbGameSchema = z.object({
  id: z.number(),
  name: z.string(),
  cover: igdbCoverSchema.optional(),
  first_release_date: z.number().optional(),
  platforms: z.array(igdbPlatformSchema).optional(),
  involved_companies: z.array(igdbInvolvedCompanySchema).optional(),
});

const igdbGamesResponseSchema = z.array(igdbGameSchema);

type IgdbGame = z.infer<typeof igdbGameSchema>;

function buildCoverUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

function pickDeveloper(game: IgdbGame): string | null {
  if (!game.involved_companies) return null;
  const dev = game.involved_companies.find((entry) => entry.developer);
  return dev?.company.name ?? null;
}

function deriveReleaseYear(game: IgdbGame): number | null {
  if (game.first_release_date === undefined) return null;
  const date = new Date(game.first_release_date * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

function escapeApicalypseString(raw: string): string {
  // Apicalypse string literal: double-quote delimited. Escape backslashes
  // first then quotes, then drop ASCII control characters defensively so they
  // can never break the body framing.
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

// IGDB Apicalypse: `search` is INCOMPATIBLE with `sort`. Do NOT add a `sort`
// clause next to `search` — IGDB will silently ignore one of the two.
function buildApicalypseBody(title: string, platformId: number): string {
  const safeTitle = escapeApicalypseString(title);
  return `fields name, cover.image_id, first_release_date, involved_companies.company.name, involved_companies.developer, platforms.name; search "${safeTitle}"; where platforms = (${platformId}); limit ${DEFAULT_LIMIT};`;
}

export class IgdbGameMetadataProvider implements GameMetadataProvider {
  private readonly httpClient: IgdbHttpClientPort;

  constructor(opts: IgdbGameMetadataProviderOptions) {
    this.httpClient = opts.httpClient;
  }

  async search(
    query: GameMetadataSearchQuery,
  ): Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>> {
    const platformId = mapPlatform(query.platform);
    if (platformId === null) {
      return err({ kind: 'platform_unsupported' });
    }

    const body = buildApicalypseBody(query.title, platformId);

    let response: Response;
    try {
      response = await this.httpClient.post('/games', body);
    } catch (httpError) {
      if (httpError instanceof IgdbHttpError) {
        return err({ kind: httpError.kind });
      }
      throw httpError;
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch (_readError) {
      return err({ kind: 'invalid_response' });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (_parseError) {
      return err({ kind: 'invalid_response' });
    }

    const validated = igdbGamesResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return err({ kind: 'invalid_response' });
    }

    const candidates: GameMetadataCandidate[] = validated.data.map((game) => ({
      providerName: 'igdb',
      providerId: String(game.id),
      title: game.name,
      developer: pickDeveloper(game),
      releaseYear: deriveReleaseYear(game),
      coverImageUrl: game.cover ? buildCoverUrl(game.cover.image_id) : null,
      platformNames: game.platforms?.map((p) => p.name) ?? [],
    }));

    return ok({ candidates, fetchedAt: new Date() });
  }
}
