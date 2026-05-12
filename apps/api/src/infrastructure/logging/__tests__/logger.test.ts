import { describe, expect, test } from 'bun:test';
import { createLogger } from '../logger';

function captured(): { lines: string[]; sink: (line: string) => void } {
  const lines: string[] = [];
  return { lines, sink: (line) => lines.push(line) };
}

describe('createLogger', () => {
  test('writes a JSON line per event() call with level=info and event name', () => {
    const { lines, sink } = captured();
    const log = createLogger({ level: 'info', sink, time: () => '2024-01-01T00:00:00.000Z' });

    log.event('games.list', { userId: 'u1', durationMs: 7 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({
      level: 'info',
      time: '2024-01-01T00:00:00.000Z',
      event: 'games.list',
      userId: 'u1',
      durationMs: 7,
    });
  });

  test('child() merges bindings into every record', () => {
    const { lines, sink } = captured();
    const log = createLogger({ level: 'info', sink, time: () => 't' });
    const child = log.child({ requestId: 'rid-1' });

    child.event('x');

    const record = JSON.parse(lines[0] as string);
    expect(record.requestId).toBe('rid-1');
    expect(record.event).toBe('x');
  });

  test('child() bindings can be extended further', () => {
    const { lines, sink } = captured();
    const log = createLogger({ level: 'info', sink, time: () => 't' });
    const child = log.child({ requestId: 'rid-1' }).child({ userId: 'u1' });

    child.event('y');

    const record = JSON.parse(lines[0] as string);
    expect(record.requestId).toBe('rid-1');
    expect(record.userId).toBe('u1');
  });

  test('skips records below the configured level', () => {
    const { lines, sink } = captured();
    const log = createLogger({ level: 'warn', sink, time: () => 't' });

    log.info({ event: 'noisy' });
    log.warn({ event: 'audible' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).event).toBe('audible');
  });

  test('serializes Error instances into a structured record', () => {
    const { lines, sink } = captured();
    const log = createLogger({ level: 'info', sink, time: () => 't' });

    log.error({ event: 'boom', err: new Error('kaboom') });

    const record = JSON.parse(lines[0] as string);
    expect(record.err.name).toBe('Error');
    expect(record.err.message).toBe('kaboom');
    expect(typeof record.err.stack).toBe('string');
  });
});
