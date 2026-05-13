/**
 * Per-host circuit breaker. Process-local state (resets on deploy).
 *
 * - Closed: requests pass through. Failures are tracked within a rolling
 *   window of `windowMs` ms; reaching `failureThreshold` opens the breaker.
 * - Open: requests are rejected. After `halfOpenAfterMs` since opening,
 *   the next `canRequest()` call transitions to half-open.
 * - Half-open: a single probe is allowed. `recordSuccess` closes the
 *   breaker; `recordFailure` reopens it.
 *
 * `onStateChange(next, prev)` fires exactly once per transition. It is
 * never invoked from `canRequest` for a stable state — only when
 * `canRequest` itself triggers an open→half-open transition.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly windowMs: number;
  readonly halfOpenAfterMs: number;
  readonly now?: () => number;
  readonly onStateChange?: (next: CircuitState, prev: CircuitState) => void;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly halfOpenAfterMs: number;
  private readonly now: () => number;
  private readonly onStateChange: (next: CircuitState, prev: CircuitState) => void;

  private currentState: CircuitState = 'closed';
  private failureTimestamps: number[] = [];
  private openedAt: number | null = null;

  constructor(opts: CircuitBreakerOptions) {
    if (opts.failureThreshold <= 0) {
      throw new Error('CircuitBreaker: failureThreshold must be > 0');
    }
    this.failureThreshold = opts.failureThreshold;
    this.windowMs = opts.windowMs;
    this.halfOpenAfterMs = opts.halfOpenAfterMs;
    this.now = opts.now ?? (() => Date.now());
    this.onStateChange = opts.onStateChange ?? (() => undefined);
  }

  get state(): CircuitState {
    return this.currentState;
  }

  canRequest(): boolean {
    if (this.currentState === 'open') {
      if (this.openedAt !== null && this.now() - this.openedAt >= this.halfOpenAfterMs) {
        this.transitionTo('half-open');
        return true;
      }
      return false;
    }
    // closed or half-open — both allow a request through (half-open allows a single probe)
    return true;
  }

  recordSuccess(): void {
    if (this.currentState === 'half-open') {
      this.transitionTo('closed');
      this.failureTimestamps = [];
      this.openedAt = null;
      return;
    }
    // closed: success resets the failure counter
    this.failureTimestamps = [];
  }

  /**
   * Forces the breaker back to `closed` and zeroes its failure window.
   * Used when the system reconfigures the upstream credentials at runtime —
   * any in-window failures attributed to old credentials would otherwise keep
   * the breaker open against the freshly-supplied ones.
   */
  reset(): void {
    this.failureTimestamps = [];
    this.openedAt = null;
    this.transitionTo('closed');
  }

  recordFailure(): void {
    if (this.currentState === 'half-open') {
      this.transitionTo('open');
      this.openedAt = this.now();
      return;
    }
    if (this.currentState === 'open') {
      // already open — keep openedAt unchanged so half-open timing isn't reset by stale failures
      return;
    }
    const now = this.now();
    this.failureTimestamps.push(now);
    this.pruneWindow(now);
    if (this.failureTimestamps.length >= this.failureThreshold) {
      this.transitionTo('open');
      this.openedAt = now;
    }
  }

  private pruneWindow(now: number): void {
    const cutoff = now - this.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t > cutoff);
  }

  private transitionTo(next: CircuitState): void {
    const prev = this.currentState;
    if (prev === next) {
      return;
    }
    this.currentState = next;
    this.onStateChange(next, prev);
  }
}
