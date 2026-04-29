import { z } from 'zod';
import { ImportSnapshotExternalSchema, type ImportSnapshot } from '@apex/shared';
import { err, ok, type Result } from '../../domain/shared/result';
import { migrateToCurrent } from './migrations';
import { externalToCurrent } from './migrations/external-to-current';

const VersionEnvelope = z.object({ version: z.number().int() });

export type ImportParseError =
  | { kind: 'invalid_json'; message: string }
  | { kind: 'invalid_shape'; version?: number; issues: unknown }
  | { kind: 'unsupported_version'; version: number };

export function parseImport(
  rawJson: string,
  idGenerator: () => string = () => crypto.randomUUID(),
  now: () => string = () => new Date().toISOString(),
): Result<ImportSnapshot, ImportParseError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return err({ kind: 'invalid_json', message: String((e as Error).message) });
  }

  const env = VersionEnvelope.safeParse(parsed);
  if (env.success) {
    const result = migrateToCurrent(parsed, env.data.version, idGenerator);
    if (!result.ok) return err(result.error);
    return ok(result.value);
  }

  const ext = ImportSnapshotExternalSchema.safeParse(parsed);
  if (!ext.success) return err({ kind: 'invalid_shape', issues: ext.error.issues });
  return ok(externalToCurrent(ext.data, idGenerator, now));
}
