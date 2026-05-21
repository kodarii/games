import type { LogFields, LogLevel, Logger } from '../../application/shared/logger';
import { env } from '../config/env';

export type { LogFields, LogLevel, LogValue, Logger } from '../../application/shared/logger';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface CreateLoggerOptions {
  readonly level?: LogLevel;
  readonly bindings?: LogFields;
  /** Sink for the rendered JSON line. Defaults to `console.log`. Tests can capture. */
  readonly sink?: (line: string) => void;
  /** Clock for the `time` field. Defaults to `() => new Date().toISOString()`. */
  readonly time?: () => string;
}

function serializeError(err: Error): LogFields {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack ?? null,
  };
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

class JsonLogger implements Logger {
  readonly level: LogLevel;
  private readonly bindings: LogFields;
  private readonly sink: (line: string) => void;
  private readonly time: () => string;
  private readonly minRank: number;

  constructor(opts: Required<CreateLoggerOptions>) {
    this.level = opts.level;
    this.bindings = opts.bindings;
    this.sink = opts.sink;
    this.time = opts.time;
    this.minRank = LEVEL_RANK[opts.level];
  }

  child(bindings: LogFields): Logger {
    return new JsonLogger({
      level: this.level,
      bindings: { ...this.bindings, ...bindings },
      sink: this.sink,
      time: this.time,
    });
  }

  event(name: string, fields: LogFields = {}): void {
    this.write('info', { event: name, ...fields });
  }

  debug(fields: LogFields): void {
    this.write('debug', fields);
  }

  info(fields: LogFields): void {
    this.write('info', fields);
  }

  warn(fields: LogFields): void {
    this.write('warn', fields);
  }

  error(fields: LogFields): void {
    this.write('error', fields);
  }

  private write(level: LogLevel, fields: LogFields): void {
    if (LEVEL_RANK[level] < this.minRank) return;
    const record = {
      level,
      time: this.time(),
      ...this.bindings,
      ...fields,
    };
    // Single point where logger talks to a sink. Replace this to swap transport.
    this.sink(JSON.stringify(record, replacer));
  }
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return new JsonLogger({
    level: options.level ?? env.LOG_LEVEL,
    bindings: options.bindings ?? {},
    sink: options.sink ?? ((line: string) => console.log(line)),
    time: options.time ?? (() => new Date().toISOString()),
  });
}

/**
 * Process-level logger. Use for bootstrap, cron, wiring — anywhere there is no
 * Hono request scope. Request handlers MUST use `c.get('logger')` instead so
 * `requestId` / `userId` propagate.
 */
export const baseLogger: Logger = createLogger();
