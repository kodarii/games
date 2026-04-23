import { useQuery } from '@tanstack/react-query';
import { fetchGame, fetchGames } from './api';
import type { GamesResponse } from '@/types';

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