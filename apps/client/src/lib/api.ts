import type { ImportMode, ImportReport } from '@apex/shared';
import type { Game, GameFormat, GamePlatform, GameStatus, GamesResponse, Platform } from '@/types';

export async function fetchGames(params: URLSearchParams): Promise<GamesResponse> {
  const r = await fetch(`/api/games?${params.toString()}`, { credentials: 'include' });
  if (!r.ok) {
    throw new Error(`Failed to fetch games: ${r.status}`);
  }
  return r.json();
}

export async function fetchGame(id: string | number): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, { credentials: 'include' });
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
  format: GameFormat;
  coverColor?: string;
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const r = await fetch('/api/games', {
    method: 'POST',
    credentials: 'include',
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
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed to update game: ${r.status}`);
  }
  return r.json();
}

export async function deleteGame(id: number): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `Failed to delete game: ${r.status}`);
  }
  return r.json();
}

export async function fetchPlatforms(): Promise<Platform[]> {
  const r = await fetch('/api/platforms', { credentials: 'include' });
  if (!r.ok) throw new Error(`Failed to fetch platforms: ${r.status}`);
  return r.json();
}

export async function createPlatform(input: { name: string }): Promise<Platform> {
  const r = await fetch('/api/platforms', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const e = new Error(body?.error ?? `Failed to create platform: ${r.status}`);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function deletePlatform(id: number): Promise<Platform> {
  const r = await fetch(`/api/platforms/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const e = new Error(body?.error ?? `Failed to delete platform: ${r.status}`);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function importData(snapshot: unknown, mode: ImportMode): Promise<ImportReport> {
  const r = await fetch('/api/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, snapshot }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const e = new Error(body?.error ?? `Failed to import: ${r.status}`);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function exportData(): Promise<{ blob: Blob; filename: string }> {
  const r = await fetch('/api/export', { credentials: 'include' });
  if (!r.ok) {
    throw new Error(`Failed to export: ${r.status}`);
  }
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? 'apex-export.json';
  return { blob, filename };
}
