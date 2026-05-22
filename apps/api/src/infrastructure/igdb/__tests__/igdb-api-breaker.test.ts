import { describe, expect, it } from 'bun:test';
import type { Logger } from '../../logging/logger';
import { createIgdbApiBreaker } from '../igdb-api-breaker';

function fakeLogger(events: Array<{ name: string; fields: unknown }>): Logger {
  const logger = {
    event(name: string, fields: unknown) {
      events.push({ name, fields });
    },
    info() {},
    warn() {},
    error() {},
    debug() {},
    child: () => logger,
    level: 'info' as const,
  };
  return logger as unknown as Logger;
}

describe('createIgdbApiBreaker', () => {
  it('returns a breaker that starts closed', () => {
    const events: Array<{ name: string; fields: unknown }> = [];
    const breaker = createIgdbApiBreaker(fakeLogger(events));
    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('logs igdb.breaker.open when transitioning to open', () => {
    const events: Array<{ name: string; fields: unknown }> = [];
    const breaker = createIgdbApiBreaker(fakeLogger(events));
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(events.some((e) => e.name === 'igdb.breaker.open')).toBe(true);
    const opened = events.find((e) => e.name === 'igdb.breaker.open');
    expect(opened?.fields).toMatchObject({ host: 'api.igdb.com' });
  });

  it('returns distinct instances on every call (no implicit singleton)', () => {
    const a = createIgdbApiBreaker(fakeLogger([]));
    const b = createIgdbApiBreaker(fakeLogger([]));
    expect(a).not.toBe(b);
  });
});
