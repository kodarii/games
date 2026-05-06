import type { Game, GameSortField, GamesResponse, SortDir } from '@/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateGameInput,
  type CreateWishlistInput,
  type UpdateGameInput,
  createDeveloper,
  createGame,
  createGenre,
  createPlatform,
  createWishlistItem,
  deleteDeveloper,
  deleteGame,
  deleteGenre,
  deletePlatform,
  fetchDevelopers,
  fetchGame,
  fetchGames,
  fetchGenres,
  fetchMyPermissions,
  fetchPlatforms,
  moveToCollection,
  updateGame,
  uploadCover,
} from './api';

export type InfiniteGamesParams = {
  search: string;
  perPage: number;
  sort?: GameSortField;
  dir?: SortDir;
};

export function useInfiniteGamesQuery(params: InfiniteGamesParams) {
  return useInfiniteQuery({
    queryKey: ['games', 'owned', params] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }): Promise<GamesResponse> => {
      const sp = new URLSearchParams({
        page: String(pageParam),
        perPage: String(params.perPage),
        search: params.search,
        kind: 'owned',
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

export function useInfiniteWishlistQuery(params: InfiniteGamesParams) {
  return useInfiniteQuery({
    queryKey: ['games', 'wishlist', params] as const,
    initialPageParam: 1,
    queryFn: ({ pageParam }): Promise<GamesResponse> => {
      const sp = new URLSearchParams({
        page: String(pageParam),
        perPage: String(params.perPage),
        search: params.search,
        kind: 'wishlist',
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

export function useCreateWishlistMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWishlistInput) => createWishlistItem(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games', 'wishlist'] });
    },
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

export function usePlatformsQuery() {
  return useQuery({ queryKey: ['platforms'], queryFn: fetchPlatforms });
}

export function useCreatePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPlatform,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms'] }),
  });
}

export function useDeletePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlatform,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms'] }),
  });
}

export function useGenresQuery() {
  return useQuery({ queryKey: ['genres'], queryFn: fetchGenres });
}

export function useCreateGenre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createGenre,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genres'] }),
  });
}

export function useDeleteGenre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteGenre,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genres'] }),
  });
}

export function useDevelopersQuery() {
  return useQuery({ queryKey: ['developers'], queryFn: fetchDevelopers });
}

export function useCreateDeveloper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDeveloper,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developers'] }),
  });
}

export function useDeleteDeveloper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDeveloper,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developers'] }),
  });
}

export function useMyPermissions() {
  return useQuery({
    queryKey: ['me', 'permissions'],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUploadCoverMutation() {
  return useMutation({
    mutationFn: (file: File) => uploadCover(file),
  });
}

export function useMoveToCollectionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (externalId: string) => moveToCollection(externalId),
    onMutate: async (externalId) => {
      await qc.cancelQueries({ queryKey: ['games', 'wishlist'] });
      const snapshot = qc.getQueriesData<{ pages: Array<{ items: Game[] }> }>({
        queryKey: ['games', 'wishlist'],
      });
      qc.setQueriesData({ queryKey: ['games', 'wishlist'] }, (old: unknown) => {
        const data = old as { pages?: Array<{ items: Game[] }> } | undefined;
        if (!data?.pages) return old;
        return {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            items: p.items.filter((g) => g.externalId !== externalId),
          })),
        };
      });
      return { snapshot };
    },
    onError: (_err, _externalId, ctx) => {
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['games', 'wishlist'] });
      qc.invalidateQueries({ queryKey: ['games', 'owned'] });
    },
  });
}
