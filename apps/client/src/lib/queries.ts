import type { GamesResponse } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateGameInput,
  type UpdateGameInput,
  createGame,
  fetchGame,
  fetchGames,
  updateGame,
} from './api';

export function useGamesQuery(params: URLSearchParams) {
  return useQuery<GamesResponse>({
    queryKey: ['games', params.toString()],
    queryFn: () => fetchGames(params),
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
