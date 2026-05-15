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
import { apiFetch } from './api-fetch';

export { ApiError } from './api-fetch';

/**
 * Generates a fresh Idempotency-Key (UUID v4) for a mutation. The caller is
 * responsible for keeping the value stable across retries of the *same logical
 * operation* — i.e. generate once at the call site, pass to fetch, reuse if
 * the network attempt is retried. Producing a new UUID per retry defeats the
 * server-side idempotency cache.
 *
 * Preferred callers cache one key per mutation instance via `useRef` and pass
 * it explicitly into the mutation function (see `apps/client/src/lib/queries.ts`
 * and `apps/client/src/hooks/use-igdb-integration.ts`). Mutation functions
 * accept an optional `idempotencyKey` argument; when omitted, a fresh UUID is
 * generated inline as backward-compatible fallback (e.g. single-shot
 * non-retry call sites like `use-import.ts`).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function fetchGames(params: URLSearchParams, signal?: AbortSignal): Promise<GamesResponse> {
  return apiFetch<GamesResponse>(`/api/games?${params.toString()}`, { signal });
}

export function fetchGame(id: string | number): Promise<Game> {
  return apiFetch<Game>(`/api/games/${id}`);
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

export function createWishlistItem(input: CreateWishlistInput, idempotencyKey?: string): Promise<Game> {
  return apiFetch<Game>('/api/games', {
    method: 'POST',
    body: input,
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
}

export function createGame(input: CreateGameInput, idempotencyKey?: string): Promise<Game> {
  return apiFetch<Game>('/api/games', {
    method: 'POST',
    body: input,
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
}

export type UpdateGameInput = CreateGameInput;

export function updateGame(id: string, input: UpdateGameInput): Promise<Game> {
  return apiFetch<Game>(`/api/games/${id}`, { method: 'PUT', body: input });
}

export function deleteGame(id: string): Promise<Game> {
  return apiFetch<Game>(`/api/games/${id}`, { method: 'DELETE' });
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

export function enrichGameMetadata(
  externalId: string,
  body: EnrichGameMetadataInput,
): Promise<Game> {
  return apiFetch<Game>(`/api/games/${externalId}/metadata`, {
    method: 'PATCH',
    body,
  });
}

export function fetchMetadataCandidates(
  title: string,
  platform: string,
  signal?: AbortSignal,
): Promise<MetadataCandidatesResponse> {
  const sp = new URLSearchParams({ title, platform });
  return apiFetch<MetadataCandidatesResponse>(`/api/games/metadata/candidates?${sp.toString()}`, {
    signal,
  });
}

export interface MetadataStatusResponse {
  igdbConfigured: boolean;
}

export function fetchMetadataStatus(signal?: AbortSignal): Promise<MetadataStatusResponse> {
  return apiFetch<MetadataStatusResponse>('/api/games/metadata/status', { signal });
}

export function fetchPlatforms(): Promise<Platform[]> {
  return apiFetch<Platform[]>('/api/platforms');
}

export function createPlatform(input: { name: string }): Promise<Platform> {
  return apiFetch<Platform>('/api/platforms', { method: 'POST', body: input });
}

export function deletePlatform(id: number): Promise<Platform> {
  return apiFetch<Platform>(`/api/platforms/${id}`, { method: 'DELETE' });
}

export function fetchGenres(): Promise<Genre[]> {
  return apiFetch<Genre[]>('/api/genres');
}

export function createGenre(input: { name: string }): Promise<Genre> {
  return apiFetch<Genre>('/api/genres', { method: 'POST', body: input });
}

export function deleteGenre(id: number): Promise<Genre> {
  return apiFetch<Genre>(`/api/genres/${id}`, { method: 'DELETE' });
}

export function fetchDevelopers(): Promise<Developer[]> {
  return apiFetch<Developer[]>('/api/developers');
}

export function createDeveloper(input: { name: string }): Promise<Developer> {
  return apiFetch<Developer>('/api/developers', { method: 'POST', body: input });
}

export function deleteDeveloper(id: number): Promise<Developer> {
  return apiFetch<Developer>(`/api/developers/${id}`, { method: 'DELETE' });
}

export function importData(snapshot: unknown, mode: ImportMode, idempotencyKey?: string): Promise<ImportReport> {
  return apiFetch<ImportReport>('/api/import', {
    method: 'POST',
    body: { mode, snapshot },
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
}

export function uploadCover(file: File, idempotencyKey?: string): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch<{ url: string }>('/api/upload/cover', {
    method: 'POST',
    body: fd,
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
}

export function fetchMyPermissions(): Promise<{ canUploadCovers: boolean }> {
  return apiFetch<{ canUploadCovers: boolean }>('/api/me/permissions');
}

export function moveToCollection(externalId: string, idempotencyKey?: string): Promise<{ game: Game }> {
  return apiFetch<{ game: Game }>(`/api/games/${externalId}/move-to-collection`, {
    method: 'POST',
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
  });
}

export type IgdbIntegrationStatusResponse = {
  status: 'not-configured' | 'configured';
  enabled: boolean;
  clientId: string | null;
  clientIdMasked: string | null;
  hasSecret: boolean;
  lastVerifiedAt: string | null;
  updatedAt: string | null;
};

export function fetchIgdbIntegration(signal?: AbortSignal): Promise<IgdbIntegrationStatusResponse> {
  return apiFetch<IgdbIntegrationStatusResponse>('/api/integrations/igdb', { signal });
}

export interface SaveIgdbIntegrationInput {
  clientId: string;
  clientSecret: string | null;
  enabled: boolean;
  idempotencyKey: string;
}

export function saveIgdbIntegration(
  input: SaveIgdbIntegrationInput,
): Promise<IgdbIntegrationStatusResponse> {
  return apiFetch<IgdbIntegrationStatusResponse>('/api/integrations/igdb', {
    method: 'PUT',
    body: {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      enabled: input.enabled,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export async function deleteIgdbIntegration(idempotencyKey: string): Promise<void> {
  await apiFetch<void>('/api/integrations/igdb', {
    method: 'DELETE',
    idempotencyKey,
    responseType: 'text',
  });
}

export async function exportData(): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetch<Response>('/api/export', { responseType: 'response' });
  const blob = await response.blob();
  const cd = response.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? 'apex-export.json';
  return { blob, filename };
}
