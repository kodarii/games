import type { Game, GamePlatform, GameStatus, GamesResponse } from '@/types';

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

export interface CreateGameInput {
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const r = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed to create game: ${r.status}`);
  }
  return r.json();
}

export type UpdateGameInput = CreateGameInput;

export async function updateGame(id: number, input: UpdateGameInput): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed to update game: ${r.status}`);
  }
  return r.json();
}
