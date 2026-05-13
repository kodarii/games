import { describe, expect, it } from 'bun:test';
import { CircuitBreaker, type CircuitState } from '../circuit-breaker';

function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('CircuitBreaker', () => {
  it('starts in closed state and allows requests', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });

  it('opens after threshold consecutive failures within window', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('transitions to half-open after halfOpenAfterMs', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.state).toBe('open');

    clock.advance(30_000);
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.state).toBe('half-open');
  });

  it('half-open success closes the breaker; failure reopens it', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    for (let i = 0; i < 5; i++) breaker.recordFailure();
    clock.advance(30_000);
    breaker.canRequest(); // transition to half-open
    expect(breaker.state).toBe('half-open');

    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');

    // Now reopen
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    expect(breaker.state).toBe('open');
    clock.advance(30_000);
    breaker.canRequest();
    expect(breaker.state).toBe('half-open');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
  });

  it('recordSuccess in closed resets the failure counter', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    for (let i = 0; i < 4; i++) breaker.recordFailure();
    breaker.recordSuccess();
    // After reset, need 5 more failures to open
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');
  });

  it('failures outside the rolling window do not count', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
    });

    for (let i = 0; i < 4; i++) breaker.recordFailure();
    clock.advance(60_001);
    breaker.recordFailure();
    expect(breaker.state).toBe('closed');
  });

  it('onStateChange fires exactly once per transition with (next, prev)', () => {
    const clock = makeClock();
    const transitions: Array<[CircuitState, CircuitState]> = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
      onStateChange: (next, prev) => transitions.push([next, prev]),
    });

    // closed → open
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    // open → half-open
    clock.advance(30_000);
    breaker.canRequest();
    // assert canRequest in stable state does not fire callback
    breaker.canRequest();
    breaker.canRequest();
    // half-open → closed
    breaker.recordSuccess();
    // closed → ... rebuild path to half-open → open
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    // closed → open (transition 4)
    // wait, let me retrace: after recordSuccess we're closed. 5 failures bring us to open.
    // Now advance to half-open, then fail to open again. That's 6 transitions.
    // Plan says "exactly 4 times" for cycle closed→open→half-open→closed→half-open→open
    // So we need: closed→open (1), open→half-open (2), half-open→closed (3), closed→half-open is impossible
    // The plan's cycle: closed→open→half-open→closed→half-open→open has 5 arrows. Let me re-read.
    // "run pełen cykl (closed→open→half-open→closed→half-open→open), assert że callback wywołany DOKŁADNIE 4 razy"
    // Hmm: 5 transitions in the chain. But it says 4. Probably treating closed→half-open as not possible — go direct closed→open.
    // So actual sequence: closed→open, open→half-open, half-open→closed, closed→open, open→half-open, half-open→open.
    // That's 6 transitions. The plan likely has off-by-one. Let me just assert correctness of each transition recorded.
    clock.advance(30_000);
    breaker.canRequest(); // open → half-open
    breaker.recordFailure(); // half-open → open

    expect(transitions).toEqual([
      ['open', 'closed'],
      ['half-open', 'open'],
      ['closed', 'half-open'],
      ['open', 'closed'],
      ['half-open', 'open'],
      ['open', 'half-open'],
    ]);
  });

  it('reset() returns breaker to closed and clears failure counters', () => {
    const clock = makeClock();
    const transitions: Array<[CircuitState, CircuitState]> = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
      onStateChange: (next, prev) => transitions.push([next, prev]),
    });

    for (let i = 0; i < 5; i++) breaker.recordFailure();
    expect(breaker.state).toBe('open');

    breaker.reset();
    expect(breaker.state).toBe('closed');
    expect(breaker.canRequest()).toBe(true);

    // Counters cleared: need 5 fresh failures to reopen.
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('open');

    expect(transitions).toEqual([
      ['open', 'closed'],
      ['closed', 'open'],
      ['open', 'closed'],
    ]);
  });

  it('reset() from closed state is a no-op for state transitions', () => {
    const transitions: Array<[CircuitState, CircuitState]> = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      onStateChange: (next, prev) => transitions.push([next, prev]),
    });

    breaker.reset();
    expect(breaker.state).toBe('closed');
    expect(transitions).toEqual([]);
  });

  it('canRequest in stable state does not fire onStateChange', () => {
    const clock = makeClock();
    let calls = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      windowMs: 60_000,
      halfOpenAfterMs: 30_000,
      now: clock.now,
      onStateChange: () => {
        calls += 1;
      },
    });

    breaker.canRequest();
    breaker.canRequest();
    breaker.canRequest();
    expect(calls).toBe(0);
  });
});
