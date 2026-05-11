import type {
  Developer,
  Game,
  GameFormat,
  GamePlatform,
  GameStatus,
  GamesResponse,
  Genre,
  MetadataCandidatesResponse,
  Platform,
} from '@/types';
import type { ImportMode, ImportReport } from '@apex/shared';

/**
 * Reads an error message from a non-OK response body, preferring RFC 7807 fields
 * (`detail`, `title`) over the legacy `{ error }` shape, falling back to a hardcoded
 * verb-based message. Returns `[message, body]` so callers that need the full body
 * (e.g. for `issues` or status attachment) can still access it.
 */
async function readErrorMessage(
  r: Response,
  fallback: string,
): Promise<[message: string, body: unknown]> {
  const body = (await r.json().catch(() => ({}))) as {
    detail?: string;
    title?: string;
    error?: string;
  };
  return [body?.detail ?? body?.title ?? body?.error ?? fallback, body];
}

export async function fetchGames(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<GamesResponse> {
  const r = await fetch(`/api/games?${params.toString()}`, { credentials: 'include', signal });
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
  kind?: 'owned' | 'wishlist';
  title: string;
  developer?: string | null;
  genre?: string;
  releaseYear?: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed?: number;
  status?: GameStatus;
  format: GameFormat;
  coverColor?: string;
  coverImage?: string | null;
  price?: number | null;
  purchasedAt?: string | null;
  notes?: string | null;
  metadataRef?: { providerName: 'igdb'; providerId: string };
}

export interface CreateWishlistInput {
  kind: 'wishlist';
  title: string;
  platform: string;
  developer?: string;
}

export async function createWishlistItem(input: CreateWishlistInput): Promise<Game> {
  const r = await fetch('/api/games', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to create wishlist item: ${r.status}`);
    throw new Error(message);
  }
  return r.json();
}

export async function createGame(input: CreateGameInput): Promise<Game> {
  const r = await fetch('/api/games', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to create game: ${r.status}`);
    throw new Error(message);
  }
  return r.json();
}

export type UpdateGameInput = CreateGameInput;

export async function updateGame(id: string, input: UpdateGameInput): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to update game: ${r.status}`);
    throw new Error(message);
  }
  return r.json();
}

export async function deleteGame(id: string): Promise<Game> {
  const r = await fetch(`/api/games/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to delete game: ${r.status}`);
    throw new Error(message);
  }
  return r.json();
}

export interface EnrichGameMetadataInput {
  providerName: 'igdb';
  providerId: string;
  snapshot: {
    coverImageUrl: string | null;
    releaseYear: number | null;
    developer: string | null;
  };
}

export async function enrichGameMetadata(
  externalId: string,
  body: EnrichGameMetadataInput,
): Promise<Game> {
  const r = await fetch(`/api/games/${externalId}/metadata`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to enrich game metadata: ${r.status}`);
    throw new Error(message);
  }
  return r.json();
}

export async function fetchMetadataCandidates(
  title: string,
  platform: string,
  signal?: AbortSignal,
): Promise<MetadataCandidatesResponse> {
  const sp = new URLSearchParams({ title, platform });
  const r = await fetch(`/api/games/metadata/candidates?${sp.toString()}`, {
    credentials: 'include',
    signal,
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to fetch metadata candidates: ${r.status}`);
    throw new Error(message);
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
    const [message, body] = await readErrorMessage(r, `Failed to create platform: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function deletePlatform(id: number): Promise<Platform> {
  const r = await fetch(`/api/platforms/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) {
    const [message, body] = await readErrorMessage(r, `Failed to delete platform: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function fetchGenres(): Promise<Genre[]> {
  const r = await fetch('/api/genres', { credentials: 'include' });
  if (!r.ok) throw new Error(`Failed to fetch genres: ${r.status}`);
  return r.json();
}

export async function createGenre(input: { name: string }): Promise<Genre> {
  const r = await fetch('/api/genres', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to create genre: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    throw e;
  }
  return r.json();
}

export async function deleteGenre(id: number): Promise<Genre> {
  const r = await fetch(`/api/genres/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to delete genre: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    throw e;
  }
  return r.json();
}

export async function fetchDevelopers(): Promise<Developer[]> {
  const r = await fetch('/api/developers', { credentials: 'include' });
  if (!r.ok) throw new Error(`Failed to fetch developers: ${r.status}`);
  return r.json();
}

export async function createDeveloper(input: { name: string }): Promise<Developer> {
  const r = await fetch('/api/developers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to create developer: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    throw e;
  }
  return r.json();
}

export async function deleteDeveloper(id: number): Promise<Developer> {
  const r = await fetch(`/api/developers/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to delete developer: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
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
    const [message, body] = await readErrorMessage(r, `Failed to import: ${r.status}`);
    const e = new Error(message);
    (e as any).status = r.status;
    (e as any).body = body;
    throw e;
  }
  return r.json();
}

export async function uploadCover(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/upload/cover', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, 'upload_failed');
    const e = new Error(message);
    (e as any).status = r.status;
    throw e;
  }
  return r.json();
}

export async function fetchMyPermissions(): Promise<{ canUploadCovers: boolean }> {
  const r = await fetch('/api/me/permissions', { credentials: 'include' });
  if (!r.ok) throw new Error(`Failed to fetch permissions: ${r.status}`);
  return r.json();
}

export async function moveToCollection(externalId: string): Promise<{ game: Game }> {
  const r = await fetch(`/api/games/${externalId}/move-to-collection`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) {
    const [message] = await readErrorMessage(r, `Failed to move to collection: ${r.status}`);
    throw new Error(message);
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
