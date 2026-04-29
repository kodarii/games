import { ImportSnapshotV1Schema, ImportSnapshotV2Schema, type ImportSnapshot } from '@apex/shared';
import { err, ok, type Result } from '../../../domain/shared/result';
import { migrateV1toV2 } from './v1-to-v2';

export type MigrateError =
  | { kind: 'invalid_shape'; version: number; issues: unknown }
  | { kind: 'unsupported_version'; version: number };

export function migrateToCurrent(
  raw: unknown,
  version: number,
  idGenerator: () => string,
): Result<ImportSnapshot, MigrateError> {
  if (version === 1) {
    const parsed = ImportSnapshotV1Schema.safeParse(raw);
    if (!parsed.success) return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(migrateV1toV2(parsed.data, idGenerator));
  }
  if (version === 2) {
    const parsed = ImportSnapshotV2Schema.safeParse(raw);
    if (!parsed.success) return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(parsed.data);
  }
  return err({ kind: 'unsupported_version', version });
}
