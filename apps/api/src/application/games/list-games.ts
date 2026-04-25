import { z } from 'zod';
import type { Game } from '../../domain/games/game';
import type { GameRepository, ListGamesQuery } from '../../domain/games/game-repository';

const ListGamesQuerySchema = z.object({
  search: z.string().optional().default(''),
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(7),
  sort: z.enum(['title', 'genre', 'platform', 'status', 'releaseYear', 'hoursPlayed']).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export type ListGamesInput = z.infer<typeof ListGamesQuerySchema>;

export class ListGames {
  constructor(private readonly repo: GameRepository) {}

  async execute(input: unknown) {
    const parsed = ListGamesQuerySchema.parse(input);

    const query: ListGamesQuery = {
      search: parsed.search || undefined,
      page: parsed.page,
      perPage: parsed.perPage,
      sort: parsed.sort,
      dir: parsed.dir,
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
