import { useState } from 'react';
import { z } from 'zod';
import {
  ImportSnapshotExternalSchema,
  ImportSnapshotV1Schema,
  ImportSnapshotV2Schema,
  ImportSnapshotV3Schema,
  ImportSnapshotV4Schema,
  type ImportMode,
  type ImportReport,
} from '@apex/shared';
import { useQueryClient } from '@tanstack/react-query';
import { importData } from '@/lib/api';

const SnapshotSchema = z.discriminatedUnion('version', [
  ImportSnapshotV1Schema,
  ImportSnapshotV2Schema,
  ImportSnapshotV3Schema,
  ImportSnapshotV4Schema,
]);

export type ParsedSummary = {
  version: 1 | 2 | 3 | 4 | 'external';
  platforms: number;
  games: number;
  snapshot: unknown;
};

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  | { kind: 'parse-failed'; message: string }
  | { kind: 'validated'; file: File; summary: ParsedSummary }
  | { kind: 'submitting'; file: File; summary: ParsedSummary }
  | { kind: 'succeeded'; report: ImportReport }
  | { kind: 'failed'; message: string };

export function useImport() {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const queryClient = useQueryClient();

  async function selectFile(file: File) {
    setState({ kind: 'parsing' });
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setState({ kind: 'parse-failed', message: 'File is not valid JSON.' });
        return;
      }
      const raw = parsed as Record<string, unknown> | null;
      if (raw && typeof raw === 'object' && 'version' in raw) {
        if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4) {
          setState({
            kind: 'parse-failed',
            message:
              typeof raw.version === 'number'
                ? `Unsupported version: ${raw.version}`
                : 'Invalid "version" field.',
          });
          return;
        }
        const result = SnapshotSchema.safeParse(parsed);
        if (!result.success) {
          const issue = result.error.issues[0];
          const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
          setState({ kind: 'parse-failed', message: `Invalid file${path}: ${issue.message}` });
          return;
        }
        const summary: ParsedSummary = {
          version: result.data.version,
          platforms: result.data.platforms.length,
          games: result.data.games.length,
          snapshot: parsed,
        };
        setState({ kind: 'validated', file, summary });
        return;
      }

      const ext = ImportSnapshotExternalSchema.safeParse(parsed);
      if (!ext.success) {
        const issue = ext.error.issues[0];
        const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
        setState({ kind: 'parse-failed', message: `Invalid file${path}: ${issue.message}` });
        return;
      }
      const platformCount = new Set(ext.data.games.map((g) => g.platform)).size;
      const summary: ParsedSummary = {
        version: 'external',
        platforms: platformCount,
        games: ext.data.games.length,
        snapshot: parsed,
      };
      setState({ kind: 'validated', file, summary });
    } catch {
      setState({ kind: 'parse-failed', message: 'Failed to read file.' });
    }
  }

  async function submit(mode: ImportMode) {
    if (state.kind !== 'validated') return;
    const { file, summary } = state;
    setState({ kind: 'submitting', file, summary });
    try {
      const report = await importData(summary.snapshot, mode);
      await queryClient.invalidateQueries({ queryKey: ['games'] });
      await queryClient.invalidateQueries({ queryKey: ['platforms'] });
      setState({ kind: 'succeeded', report });
    } catch (e: any) {
      const errKind = e?.body?.error ?? 'unknown';
      setState({ kind: 'failed', message: mapError(errKind) });
    }
  }

  function reset() {
    setState({ kind: 'idle' });
  }

  return { state, selectFile, submit, reset };
}

function mapError(kind: string): string {
  switch (kind) {
    case 'payload_too_large': return 'File too large (max 5MB).';
    case 'invalid_body': return 'Invalid request body.';
    case 'invalid_json': return 'File is not valid JSON.';
    case 'invalid_shape': return 'File structure does not match expected format.';
    case 'unsupported_version': return 'This file uses an unsupported schema version.';
    case 'duplicate_external_id': return 'File contains duplicate item IDs.';
    case 'duplicate_platform_name': return 'File contains duplicate platform names.';
    case 'unknown_platform': return 'A game references a platform that does not exist in the file or in your library.';
    case 'domain_error': return 'File contains invalid data in one of the records.';
    default: return 'Something went wrong. Please try again.';
  }
}
