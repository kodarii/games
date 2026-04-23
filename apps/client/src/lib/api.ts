import type { Game, GamesResponse } from '@/types';

export async function fetchGames(params: URLSearchParams): Promise<GamesResponse> {
  const r = await fetch(`/api/games?${params.toString()}`);
  if (!r.ok) {
    throw new Error(`Failed to fetch games: ${r.status}`);
  }
  return r.json();
}

export async function fetchGame(id: string | number): Promise<Game> {
  const r = await fetch(`/api/games/${id}`);
  if (!r.ok) {
    throw new Error(`Failed to fetch game: ${r.status}`);
  }
  return r.json();
}