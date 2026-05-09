import { z } from 'zod';
import { GAME_FORMATS } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';
import { ReleaseYearRange } from '../../domain/games/release-year-range';

const ListGamesQuerySchema = z
  .object({
    search: z.string().optional().default(''),
    kind: z.enum(['owned', 'wishlist']).optional(),
    page: z.coerce.number().min(1).default(1),
    perPage: z.coerce.number().min(1).max(100).default(7),
    sort: z
      .enum(['title', 'genre', 'platform', 'format', 'status', 'releaseYear', 'hoursPlayed'])
      .optional(),
    dir: z.enum(['asc', 'desc']).default('asc'),
    platforms: z.array(z.string().min(1).max(64)).max(20).optional(),
    formats: z.array(z.enum(GAME_FORMATS)).max(GAME_FORMATS.length).optional(),
    releaseYearFrom: z.coerce.number().int().min(1958).max(2100).optional(),
    releaseYearTo: z.coerce.number().int().min(1958).max(2100).optional(),
  })
  .refine(
    (d) =>
      d.releaseYearFrom == null || d.releaseYearTo == null || d.releaseYearFrom <= d.releaseYearTo,
    { path: ['releaseYearFrom'], message: 'releaseYearFrom must be <= releaseYearTo' },
  );

export type ListGamesInput = z.infer<typeof ListGamesQuerySchema>;

function escapeLikeWildcards(s: string): string {
  // Order matters: escape backslash FIRST so we don't double-escape later additions.
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class ListGames {
  constructor(private readonly repo: GameRepository) {}

  async execute(input: unknown, userId: string) {
    const parsed = ListGamesQuerySchema.parse(input);

    let releaseYearRange: ReleaseYearRange | undefined;
    if (parsed.releaseYearFrom != null && parsed.releaseYearTo != null) {
      const r = ReleaseYearRange.create(parsed.releaseYearFrom, parsed.releaseYearTo);
      if (!r.ok) {
        throw new Error(`ReleaseYearRange invariant violated after Zod: ${r.error.kind}`);
      }
      releaseYearRange = r.value;
    }

    const search = parsed.search ? escapeLikeWildcards(parsed.search) : undefined;

    const query: ListGamesQuery = {
      userId,
      search,
      kind: parsed.kind,
      page: parsed.page,
      perPage: parsed.perPage,
      sort: parsed.sort,
      dir: parsed.dir,
      platforms: parsed.platforms,
      formats: parsed.formats,
      releaseYearRange,
    };

    const result = await this.repo.list(query);

    return {
      items: result.items,
      page: query.page,
      perPage: query.perPage,
      total: result.total,
      hasMore: query.page * query.perPage < result.total,
    };
  }
}
