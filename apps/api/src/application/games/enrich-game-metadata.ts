import { z } from 'zod';
import type { CoverImageUrlError, IsCoverHostAllowed } from '../../domain/games/cover-image-url';
import { ExternalMetadataRef } from '../../domain/games/external-metadata-ref';
import type { Game } from '../../domain/games/game';
import type { GameMetadataCandidate } from '../../domain/games/game-metadata-provider';
import { type GameRepository, OptimisticLockError } from '../../domain/games/game-repository';
import type { GameValidationError } from '../../domain/games/game-value-objects';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import { isProviderSupported } from '../../domain/integrations/supported-providers';
import type { TransactionRunner } from '../shared/transaction-runner';

const inputSchema = z.object({
  providerName: z
    .string()
    .trim()
    .min(1)
    .refine(isProviderSupported, { message: 'Unsupported provider' }),
  providerId: z.string().trim().min(1),
  snapshot: z.object({
    coverImageUrl: z.string().nullable(),
    releaseYear: z.number().int().nullable(),
    developer: z.string().nullable(),
  }),
});

export type EnrichGameMetadataInput = z.infer<typeof inputSchema>;

export type EnrichGameMetadataError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'not_found' }
  | { kind: 'conflict' }
  | { kind: 'cache_miss' }
  | { kind: 'snapshot_mismatch'; fields: readonly SnapshotField[] }
  | {
      kind: 'domain';
      error:
        | GameValidationError
        | CoverImageUrlError
        | { kind: 'provider_id_empty' }
        | { kind: 'provider_name_empty' };
    };

export type SnapshotField = 'coverImageUrl' | 'releaseYear' | 'developer';

/**
 * Narrow read port the use case needs to validate that a client-supplied
 * snapshot actually came from a recent provider response. Satisfied in
 * production by `MetadataCacheRepository.findCandidate`.
 */
export interface MetadataCandidateLookup {
  findCandidate(
    provider: string,
    providerId: string,
  ): Promise<{ candidate: GameMetadataCandidate; fetchedAt: Date } | null>;
}

function diffSnapshot(
  snapshot: EnrichGameMetadataInput['snapshot'],
  candidate: GameMetadataCandidate,
): readonly SnapshotField[] {
  const mismatches: SnapshotField[] = [];
  if (snapshot.coverImageUrl !== candidate.coverImageUrl) mismatches.push('coverImageUrl');
  if (snapshot.releaseYear !== candidate.releaseYear) mismatches.push('releaseYear');
  if (snapshot.developer !== candidate.developer) mismatches.push('developer');
  return mismatches;
}

/**
 * Persist a user's match of an external metadata provider hit onto an owned
 * Game. IDOR-safe: `findByExternalId(userId, externalId)` is the first DB
 * read; any leak attempt by another user yields `not_found`.
 *
 * Snapshot is NOT trusted on its own. Before writing, the use case looks up
 * the matching candidate in `metadata_cache` (keyed by provider+providerId)
 * and rejects the request if any fingerprint field (coverImageUrl,
 * releaseYear, developer) differs. This blocks a malicious client from
 * pinning arbitrary `metadataProvider: 'igdb'` values onto rows.
 *
 * Cache miss (TTL expired or row evicted) returns `cache_miss` so the client
 * can re-issue `GET /games/metadata/candidates` (which repopulates the cache)
 * and retry the PATCH.
 */
export class EnrichGameMetadata {
  constructor(
    private readonly repo: GameRepository,
    private readonly tx: TransactionRunner,
    private readonly candidateLookup: MetadataCandidateLookup,
    private readonly isCoverHostAllowed: IsCoverHostAllowed,
  ) {}

  async execute(
    externalId: string,
    input: unknown,
    userId: string,
  ): Promise<Result<Game, EnrichGameMetadataError>> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }
    const data = parsed.data;

    type TxResult = { ok: true; saved: Game } | { ok: false; error: EnrichGameMetadataError };

    let outcome: TxResult;
    try {
      outcome = await this.tx.run<TxResult>(async (tx) => {
        const repo = this.repo.withTx(tx);

        // 1. IDOR-safe row read MUST happen before any provider-specific
        //    side-channel (cache hit/miss) so a cross-user PATCH cannot
        //    learn whether a given providerId is cached.
        const existing = await repo.findByExternalId(userId, externalId);
        if (!existing) return { ok: false, error: { kind: 'not_found' } };

        // 2. Snapshot must match the trusted cached candidate, otherwise a
        //    malicious client could pin arbitrary fingerprint fields onto
        //    the row. `findCandidate` reads outside the tx — that's fine,
        //    `metadata_cache` is immutable per (provider, cacheKey) row.
        const cached = await this.candidateLookup.findCandidate(data.providerName, data.providerId);
        if (!cached) return { ok: false, error: { kind: 'cache_miss' } };

        const mismatches = diffSnapshot(data.snapshot, cached.candidate);
        if (mismatches.length > 0) {
          return { ok: false, error: { kind: 'snapshot_mismatch', fields: mismatches } };
        }

        const refResult = ExternalMetadataRef.create({
          providerName: data.providerName,
          providerId: data.providerId,
          matchedAt: new Date(),
        });
        if (!refResult.ok) return { ok: false, error: { kind: 'domain', error: refResult.error } };

        const enrichedResult = existing.applyMetadata(data.snapshot, refResult.value, {
          isCoverHostAllowed: this.isCoverHostAllowed,
        });
        if (!enrichedResult.ok)
          return { ok: false, error: { kind: 'domain', error: enrichedResult.error } };

        const saved = await repo.saveMetadata(
          userId,
          externalId,
          enrichedResult.value,
          existing.updatedAt,
        );
        if (!saved) return { ok: false, error: { kind: 'not_found' } };
        return { ok: true, saved };
      });
    } catch (e) {
      if (e instanceof OptimisticLockError) return err({ kind: 'conflict' });
      throw e;
    }

    if (!outcome.ok) return err(outcome.error);
    return ok(outcome.saved);
  }
}
