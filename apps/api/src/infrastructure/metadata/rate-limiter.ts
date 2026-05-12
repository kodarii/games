/**
 * Vendor-neutral token-bucket rate limiter.
 *
 * Reusable across metadata providers. Tokens refill at a fixed cadence
 * (`refillIntervalMs` per token, up to `capacity`). When the bucket is empty,
 * callers queue in FIFO order and wake as tokens become available.
 *
 * The clock and timer are injectable so tests can drive the limiter
 * deterministically without real-time delays.
 */

type TimeoutHandle = unknown;

export interface TokenBucketRateLimiterOptions {
  readonly capacity: number;
  readonly refillIntervalMs: number;
  readonly now?: () => number;
  readonly setTimeoutImpl?: (fn: () => void, ms: number) => TimeoutHandle;
  readonly clearTimeoutImpl?: (handle: TimeoutHandle) => void;
}

export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillIntervalMs: number;
  private readonly now: () => number;
  private readonly setTimeoutImpl: (fn: () => void, ms: number) => TimeoutHandle;
  private readonly clearTimeoutImpl: (handle: TimeoutHandle) => void;

  private tokens: number;
  private lastRefillAt: number;
  private readonly waiters: Array<() => void> = [];
  private scheduled: TimeoutHandle | null = null;

  constructor(opts: TokenBucketRateLimiterOptions) {
    if (opts.capacity <= 0) {
      throw new Error('TokenBucketRateLimiter: capacity must be > 0');
    }
    if (opts.refillIntervalMs <= 0) {
      throw new Error('TokenBucketRateLimiter: refillIntervalMs must be > 0');
    }
    this.capacity = opts.capacity;
    this.refillIntervalMs = opts.refillIntervalMs;
    this.now = opts.now ?? (() => Date.now());
    this.setTimeoutImpl =
      opts.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms) as unknown as TimeoutHandle);
    this.clearTimeoutImpl =
      opts.clearTimeoutImpl ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.tokens = opts.capacity;
    this.lastRefillAt = this.now();
  }

  acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0 && this.waiters.length === 0) {
      this.tokens -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.ensureScheduled();
    });
  }

  private refill(): void {
    const elapsed = this.now() - this.lastRefillAt;
    if (elapsed <= 0) {
      return;
    }
    const earned = Math.floor(elapsed / this.refillIntervalMs);
    if (earned <= 0) {
      return;
    }
    this.tokens = Math.min(this.capacity, this.tokens + earned);
    this.lastRefillAt += earned * this.refillIntervalMs;
  }

  private ensureScheduled(): void {
    if (this.scheduled !== null) {
      return;
    }
    if (this.waiters.length === 0) {
      return;
    }
    const elapsed = this.now() - this.lastRefillAt;
    const remainder = elapsed % this.refillIntervalMs;
    const delay = Math.max(0, this.refillIntervalMs - remainder);
    this.scheduled = this.setTimeoutImpl(() => {
      this.scheduled = null;
      this.tick();
    }, delay);
  }

  private tick(): void {
    this.refill();
    while (this.tokens > 0 && this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter === undefined) {
        break;
      }
      this.tokens -= 1;
      waiter();
    }
    if (this.waiters.length > 0) {
      this.ensureScheduled();
    }
  }
}
