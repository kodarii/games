import { z } from 'zod';
import type { CoverImageUrlError } from '../../domain/games/cover-image-url';
import { ExternalMetadataRef } from '../../domain/games/external-metadata-ref';
import type { Game, GameValidationError } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const inputSchema = z.object({
  providerName: z.literal('igdb'),
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
  | {
      kind: 'domain';
      error: GameValidationError | CoverImageUrlError | { kind: 'provider_id_empty' };
    };

/**
 * Persist a user's match of an external metadata provider hit onto an owned
 * Game. IDOR-safe: `findByExternalId(userId, externalId)` is the first DB
 * read; any leak attempt by another user yields `not_found`.
 *
 * TODO(multi-user): re-validate the snapshot against the metadata cache
 * before saving so a malicious client cannot pin arbitrary values. At MVP
 * (single user / hobby) we trust the client snapshot.
 */
export class EnrichGameMetadata {
  constructor(private readonly repo: GameRepository) {}

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

    const existing = await this.repo.findByExternalId(userId, externalId);
    if (!existing) {
      return err({ kind: 'not_found' });
    }

    const refResult = ExternalMetadataRef.create({
      providerName: data.providerName,
      providerId: data.providerId,
      matchedAt: new Date(),
    });
    if (!refResult.ok) {
      return err({ kind: 'domain', error: refResult.error });
    }

    const enrichedResult = existing.applyMetadata(data.snapshot, refResult.value);
    if (!enrichedResult.ok) {
      return err({ kind: 'domain', error: enrichedResult.error });
    }

    const saved = await this.repo.saveMetadata(userId, externalId, enrichedResult.value);
    if (!saved) {
      // Race: row vanished between findByExternalId and saveMetadata.
      return err({ kind: 'not_found' });
    }
    return ok(saved);
  }
}
