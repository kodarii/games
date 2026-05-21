import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { LogFields, Logger } from '../../logging/logger';
import { Scheduler, type Task, type TaskResult } from '../scheduler';

interface RecordedEvent {
  readonly name: string;
  readonly fields: LogFields;
}

function makeLogger(): { logger: Logger; events: RecordedEvent[]; errors: RecordedEvent[] } {
  const events: RecordedEvent[] = [];
  const errors: RecordedEvent[] = [];
  const logger: Logger = {
    level: 'info',
    child: () => logger,
    event: (name, fields = {}) => events.push({ name, fields }),
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (fields) => errors.push({ name: String(fields.event ?? ''), fields }),
  };
  return { logger, events, errors };
}

function makeTask(name: string, intervalMs: number, run: () => Promise<TaskResult>): Task {
  return { name, intervalMs, run };
}

describe('Scheduler', () => {
  beforeEach(() => {
    mock.restore();
  });
  afterEach(() => {
    mock.restore();
  });

  it('start() registers intervals for each task and tick logs cron.<name>.completed', async () => {
    const { logger, events } = makeLogger();
    const ranA: number[] = [];
    const ranB: number[] = [];
    const tasks = [
      makeTask('a', 1000, async () => {
        ranA.push(1);
        return { status: 'completed', details: { x: 1 } };
      }),
      makeTask('b', 2000, async () => {
        ranB.push(1);
        return { status: 'completed' };
      }),
    ];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();

    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[1]!);

    expect(ranA).toHaveLength(1);
    expect(ranB).toHaveLength(1);
    expect(events.map((e) => e.name)).toEqual(['cron.a.completed', 'cron.b.completed']);
    expect(events[0]?.fields).toEqual({ x: 1 });
    expect(events[1]?.fields).toEqual({});

    scheduler.stop();
  });

  it('tick logs cron.<name>.skipped with the reason', async () => {
    const { logger, events } = makeLogger();
    const tasks = [makeTask('s', 1000, async () => ({ status: 'skipped', reason: 'lock_held' }))];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    expect(events).toEqual([{ name: 'cron.s.skipped', fields: { reason: 'lock_held' } }]);
    scheduler.stop();
  });

  it('throwing task is isolated; sibling task keeps ticking; failure is logged', async () => {
    const { logger, events, errors } = makeLogger();
    const tasks = [
      makeTask('broken', 1000, async () => {
        throw new Error('boom');
      }),
      makeTask('ok', 1000, async () => ({ status: 'completed' })),
    ];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[0]!);
    await (scheduler as unknown as { tick: (t: Task) => Promise<void> }).tick(tasks[1]!);
    expect(errors.map((e) => e.name)).toEqual(['cron.broken.failed']);
    expect(events.map((e) => e.name)).toEqual(['cron.ok.completed']);
    scheduler.stop();
  });

  it('stop() clears all timers and logs scheduler.stopped', () => {
    const { logger, events } = makeLogger();
    const tasks = [makeTask('a', 1000, async () => ({ status: 'completed' }))];
    const scheduler = new Scheduler({ logger, tasks });
    scheduler.start();
    scheduler.stop();
    scheduler.stop(); // idempotent
    expect(events).toEqual([{ name: 'scheduler.stopped', fields: { tasks: 1 } }]);
  });

  it('start() after stop() throws', () => {
    const { logger } = makeLogger();
    const scheduler = new Scheduler({ logger, tasks: [] });
    scheduler.start();
    scheduler.stop();
    expect(() => scheduler.start()).toThrow(/cannot start after stop/);
  });

  it('start() twice is idempotent — no duplicate intervals', () => {
    const { logger } = makeLogger();
    const scheduler = new Scheduler({ logger, tasks: [] });
    scheduler.start();
    scheduler.start();
    scheduler.stop();
  });
});
