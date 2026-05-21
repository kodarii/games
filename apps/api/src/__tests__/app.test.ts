import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Application } from '../app';
import { sqlite } from '../infrastructure/db/client';
import { baseLogger } from '../infrastructure/logging/logger';
import { useDisabledIgdbChain } from './_fixtures/igdb-chain-fixture';

useDisabledIgdbChain(Application.buildForTesting().igdbHolderForTesting());

describe('Application lifecycle (BE-07)', () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let serveSpy: ReturnType<typeof spyOn>;
  let events: string[];

  beforeEach(() => {
    events = [];
    spyOn(baseLogger, 'event').mockImplementation((name) => {
      events.push(name);
    });
    spyOn(baseLogger, 'error').mockImplementation((fields) => {
      events.push(`error:${String(fields.event ?? 'unknown')}`);
    });
    exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code ?? 0}`);
    }) as never);
    serveSpy = spyOn(Bun, 'serve').mockImplementation(
      () => ({ stop: async () => undefined }) as ReturnType<typeof Bun.serve>,
    );
    // Prevent the shared sqlite singleton from being closed — closing it would
    // corrupt the DB for all subsequent test files in the same bun test run.
    spyOn(sqlite, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('start() runs migrations, verifyDb, registers routes, starts scheduler, then listens', async () => {
    const app = new Application();
    await app.start(0);
    expect(events).toContain('startup.migrations.applied');
    expect(events).toContain('api.listening');
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('second start() logs application.start.duplicate and returns', async () => {
    const app = new Application();
    await app.start(0);
    events.length = 0;
    await app.start(0);
    expect(events).toEqual(['application.start.duplicate']);
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('stop() stops scheduler, drains server, closes db, exits 0', async () => {
    const app = new Application();
    await app.start(0);
    let exited = -1;
    exitSpy.mockImplementation(((code?: number) => {
      exited = code ?? 0;
      throw new Error('__exit');
    }) as never);
    try {
      await app.stop('SIGTERM', 0);
    } catch (e) {
      // process.exit replaced with throw above
    }
    expect(exited).toBe(0);
    expect(events).toContain('shutdown.start');
    expect(events).toContain('scheduler.stopped');
    expect(events).toContain('shutdown.done');
  });
});
