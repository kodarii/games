export const CURRENT_SCHEMA_VERSION = 2 as const;
export type ImportMode = 'merge' | 'replace';
export interface ImportReport {
  mode: ImportMode;
  platforms: { created: number; updated: number; deleted?: number };
  games: { created: number; updated: number; deleted?: number };
}
