import type { LogFields } from './logger';

export type TaskResult =
  | { status: 'completed'; details?: LogFields }
  | { status: 'skipped'; reason: string };
