import { describe, expect, it } from 'bun:test';
import { TokenBucketRateLimiter } from '../rate-limiter';

type ScheduledTask = { fireAt: number; fn: () => void; cleared: boolean };

interface FakeClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  advance(ms: number): Promise<void>;
}

function makeFakeClock(start = 0): FakeClock {
  let current = start;
  const tasks: ScheduledTask[] = [];
  return {
    now: () => current,
    setTimeout: (fn, ms) => {
      const task: ScheduledTask = { fireAt: current + ms, fn, cleared: false };
      tasks.push(task);
      return task;
    },
    clearTimeout: (handle) => {
      const task = handle as ScheduledTask;
      task.cleared = true;
    },
    async advance(ms) {
      const target = current + ms;
      // fire any task whose fireAt <= target in order, advancing time as we go
      // process events one at a time so chained setTimeouts work
      while (true) {
        const next = tasks
          .filter((t) => !t.cleared && t.fireAt <= target)
          .sort((a, b) => a.fireAt - b.fireAt)[0];
        if (!next) break;
        current = next.fireAt;
        next.cleared = true;
        next.fn();
        // allow microtasks (resolved promises chained off the fired task) to flush
        await Promise.resolve();
        await Promise.resolve();
      }
      current = target;
    },
  };
}

describe('TokenBucketRateLimiter', () => {
  it('starts with capacity tokens — first N acquires resolve immediately', async () => {
    const clock = makeFakeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillIntervalMs: 250,
      now: clock.now,
      setTimeoutImpl: clock.setTimeout,
      clearTimeoutImpl: clock.clearTimeout,
    });

    const resolved: number[] = [];
    const p0 = limiter.acquire().then(() => resolved.push(0));
    const p1 = limiter.acquire().then(() => resolved.push(1));
    const p2 = limiter.acquire().then(() => resolved.push(2));
    const p3 = limiter.acquire().then(() => resolved.push(3));

    await Promise.all([p0, p1, p2, p3]);
    expect(resolved).toEqual([0, 1, 2, 3]);
  });

  it('fifth acquire waits for refill interval', async () => {
    const clock = makeFakeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillIntervalMs: 250,
      now: clock.now,
      setTimeoutImpl: clock.setTimeout,
      clearTimeoutImpl: clock.clearTimeout,
    });

    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    let fifthResolved = false;
    const fifth = limiter.acquire().then(() => {
      fifthResolved = true;
    });

    await clock.advance(100);
    expect(fifthResolved).toBe(false);

    await clock.advance(200); // total 300ms
    await fifth;
    expect(fifthResolved).toBe(true);
  });

  it('idle bucket refills back to capacity', async () => {
    const clock = makeFakeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillIntervalMs: 250,
      now: clock.now,
      setTimeoutImpl: clock.setTimeout,
      clearTimeoutImpl: clock.clearTimeout,
    });

    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    // Idle long enough to refill all 4 tokens
    await clock.advance(1000);

    let count = 0;
    await Promise.all([
      limiter.acquire().then(() => count++),
      limiter.acquire().then(() => count++),
      limiter.acquire().then(() => count++),
      limiter.acquire().then(() => count++),
    ]);

    expect(count).toBe(4);
  });

  it('FIFO order: earlier waiter resolves before later waiter', async () => {
    const clock = makeFakeClock();
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillIntervalMs: 250,
      now: clock.now,
      setTimeoutImpl: clock.setTimeout,
      clearTimeoutImpl: clock.clearTimeout,
    });

    await limiter.acquire(); // consume the only token

    const order: number[] = [];
    const a = limiter.acquire().then(() => order.push(1));
    const b = limiter.acquire().then(() => order.push(2));

    await clock.advance(250);
    await clock.advance(250);
    await Promise.all([a, b]);

    expect(order).toEqual([1, 2]);
  });
});
