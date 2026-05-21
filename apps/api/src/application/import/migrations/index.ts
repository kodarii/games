import {
  ImportSnapshotV1Schema,
  ImportSnapshotV2Schema,
  ImportSnapshotV3Schema,
  ImportSnapshotV4Schema,
  type ImportSnapshot,
} from '@apex/shared';
import { err, ok, type Result } from '../../../domain/shared/result';
import { migrateV1toV2 } from './v1-to-v2';
import { migrateV2toV3 } from './v2-to-v3';
import { migrateV3toV4 } from './v3-to-v4';

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
    if (!parsed.success)
      return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(migrateV3toV4(migrateV2toV3(migrateV1toV2(parsed.data, idGenerator))));
  }
  if (version === 2) {
    const parsed = ImportSnapshotV2Schema.safeParse(raw);
    if (!parsed.success)
      return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(migrateV3toV4(migrateV2toV3(parsed.data)));
  }
  if (version === 3) {
    const parsed = ImportSnapshotV3Schema.safeParse(raw);
    if (!parsed.success)
      return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(migrateV3toV4(parsed.data));
  }
  if (version === 4) {
    const parsed = ImportSnapshotV4Schema.safeParse(raw);
    if (!parsed.success)
      return err({ kind: 'invalid_shape', version, issues: parsed.error.issues });
    return ok(parsed.data);
  }
  return err({ kind: 'unsupported_version', version });
}
