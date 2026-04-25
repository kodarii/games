import type { GamesResponse, SortDir } from '@/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateGameInput,
  type UpdateGameInput,
  createGame,
  deleteGame,
  fetchGame,
  fetchGames,
  updateGame,
} from './api';

export type InfiniteGamesParams = {
  search: string;
  perPage: number;
  sort?: string;
  dir?: SortDir;
};

export function useInfiniteGamesQuery(params: InfiniteGamesParams) {
  return useInfiniteQuery({
    queryKey: ['games', 'infinite', params] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }): Promise<GamesResponse> => {
      const sp = new URLSearchParams({
        page: String(pageParam),
        perPage: String(params.perPage),
        search: params.search,
      });
      if (params.sort) {
        sp.set('sort', params.sort);
        sp.set('dir', params.dir ?? 'asc');
      }
      return fetchGames(sp);
    },
    getNextPageParam: (last, _all, lastParam) => (last.hasMore ? lastParam + 1 : undefined),
  });
}

export function useGameQuery(id: string | number | undefined) {
  return useQuery({
    queryKey: ['game', id],
    queryFn: () => fetchGame(id!),
    enabled: id != null,
  });
}

export function useCreateGameMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGameInput) => createGame(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] });
    },
  });
}

export function useUpdateGameMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateGameInput }) => updateGame(id, input),
    onSuccess: (game) => {
      qc.invalidateQueries({ queryKey: ['games'] });
      qc.invalidateQueries({ queryKey: ['game', String(game.id)] });
      qc.invalidateQueries({ queryKey: ['game', game.id] });
    },
  });
}

export function useDeleteGameMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteGame(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] });
    },
  });
}
