export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Any JSON-serializable value that may appear inside a log record. */
export type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | LogValue[]
  | { [key: string]: LogValue }
  | Error;

export type LogFields = Record<string, LogValue>;

/**
 * Structured logger interface. Two ergonomic styles:
 *  - `logger.event('games.list', { userId, durationMs })` — preferred.
 *  - `logger.info({ event: 'x', ...fields })` — equivalent.
 *
 * `child(bindings)` returns a logger that prepends `bindings` to every record.
 */
export interface Logger {
  readonly level: LogLevel;
  child(bindings: LogFields): Logger;
  event(name: string, fields?: LogFields): void;
  debug(fields: LogFields): void;
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}
