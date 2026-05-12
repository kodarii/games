import type { Result } from '../shared/result';
import type { ProviderName } from './external-metadata-ref';

export interface GameMetadataCandidate {
  readonly providerName: ProviderName;
  readonly providerId: string;
  readonly title: string;
  readonly developer: string | null;
  readonly releaseYear: number | null;
  readonly coverImageUrl: string | null;
  readonly platformNames: readonly string[];
}

export type GameMetadataProviderError =
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'invalid_response' }
  | { kind: 'platform_unsupported' };

export interface GameMetadataSearchHit {
  readonly candidates: readonly GameMetadataCandidate[];
  readonly fetchedAt: Date;
}

export interface GameMetadataSearchQuery {
  readonly title: string;
  readonly platform: string;
  readonly limit?: number;
}

export interface GameMetadataProvider {
  search(
    query: GameMetadataSearchQuery,
  ): Promise<Result<GameMetadataSearchHit, GameMetadataProviderError>>;
}
