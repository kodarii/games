# Komunikacja między serwisami — Wzorce i Implementacje

## Retry z exponential backoff + jitter

```typescript
interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: (error: Error) => boolean;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, retryableErrors } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      const isRetryable = retryableErrors
        ? retryableErrors(error as Error)
        : isTransientError(error as Error);

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      // Exponential backoff z jitterem
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * baseDelayMs; // losowe 0-baseDelay ms
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      logger.warn(
        `Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`,
        {
          error: (error as Error).message,
          attempt,
          maxAttempts,
        },
      );

      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

function isTransientError(error: Error): boolean {
  // Ponów tylko przy przejściowych błędach sieciowych / rate limitach
  return (
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ECONNREFUSED') ||
    (error as any).status === 429 || // Rate limited
    (error as any).status === 503 // Service unavailable
    // NIE ponawia 400, 401, 403, 404, 422 — to błędy klienta
  );
}

// Użycie:
const result = await withRetry(() => paymentService.charge(orderId, amount), {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
});
```

## Circuit Breaker — implementacja od podstaw

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;

  constructor(
    private readonly name: string,
    private readonly options: {
      failureThreshold: number; // Ile błędów otwiera circuit
      successThreshold: number; // Ile sukcesów zamyka (w HALF_OPEN)
      resetTimeoutMs: number; // Czas przed testem
      volumeThreshold: number; // Min requestów przed oceną
    },
  ) {}

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const timeSinceFailure =
        Date.now() - (this.lastFailureTime?.getTime() || 0);

      if (timeSinceFailure < this.options.resetTimeoutMs) {
        logger.warn(`Circuit ${this.name} is OPEN — failing fast`);
        if (fallback) return fallback();
        throw new CircuitOpenError(this.name);
      }

      // Czas minął — przejdź do HALF_OPEN
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(error: Error) {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState) {
    logger.warn(`Circuit ${this.name}: ${this.state} → ${newState}`);
    metrics.gauge(
      `circuit_breaker_state`,
      newState === CircuitState.OPEN ? 1 : 0,
      {
        circuit: this.name,
      },
    );
    this.state = newState;
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// Użycie:
const paymentCircuit = new CircuitBreaker('PaymentService', {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30_000,
  volumeThreshold: 10,
});

const result = await paymentCircuit.execute(
  () => paymentService.charge(amount),
  () => {
    throw new ServiceUnavailableError(
      'Payment service temporarily unavailable',
    );
  },
);
```

## Bulkhead Pattern — izolacja zasobów

```typescript
import Semaphore from 'semaphore-async-await';

// Osobna pula "slotów" dla każdego serwisu zewnętrznego
const bulkheads = {
  payment: new Semaphore(10), // max 10 równoległych wywołań do Payment
  inventory: new Semaphore(20), // max 20 do Inventory
  notification: new Semaphore(5), // max 5 do Notification
};

async function callWithBulkhead<T>(
  service: keyof typeof bulkheads,
  fn: () => Promise<T>,
  timeoutMs: number = 3000,
): Promise<T> {
  const semaphore = bulkheads[service];
  const acquired = await semaphore.waitFor(timeoutMs);

  if (!acquired) {
    metrics.increment('bulkhead_rejected', { service });
    throw new BulkheadRejectedError(service);
  }

  try {
    return await Promise.race([
      fn(),
      sleep(timeoutMs).then(() => {
        throw new TimeoutError(service, timeoutMs);
      }),
    ]);
  } finally {
    semaphore.release();
  }
}
```

## Message Consumer — Idempotentny

```typescript
// Konsument kolejki — musi być idempotentny
class OrderCreatedConsumer {
  async handle(message: Message) {
    const { orderId, userId, total } = JSON.parse(message.body);
    const messageId = message.messageId;

    // Sprawdź czy wiadomość była już przetworzona
    const alreadyProcessed = await redis.get(`processed:${messageId}`);
    if (alreadyProcessed) {
      logger.info('Skipping duplicate message', { messageId, orderId });
      return; // ACK bez przetwarzania
    }

    try {
      await db.transaction(async (trx) => {
        // Logika biznesowa
        await notificationService.sendOrderConfirmation(userId, orderId, total);
        await trx('email_log').insert({ orderId, sentAt: new Date() });

        // Oznacz jako przetworzone (w tej samej transakcji!)
        await redis.setex(`processed:${messageId}`, 86400, '1'); // 24h TTL
      });

      await message.ack(); // Potwierdź odbiór DOPIERO po przetworzeniu
    } catch (error) {
      logger.error('Failed to process message', { messageId, orderId, error });
      await message.nack({ requeue: false }); // DLQ
    }
  }
}
```

## Timeout Strategy

```typescript
// Wrapper z timeoutem dla każdego zewnętrznego wywołania
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  serviceName: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(serviceName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

// Timeouty per typ operacji — nie jeden globalny!
const TIMEOUTS = {
  database: 3000,
  externalApi: 5000,
  fileUpload: 30000,
  heavyComputation: 60000,
};
```

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Rate limiting per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minut
  max: 100,
  store: new RedisStore({ client: redis }),
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      type: 'https://api.example.com/errors/rate-limited',
      title: 'Too Many Requests',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
  standardHeaders: true, // Zwraca RateLimit-* headers
  legacyHeaders: false,
});

// Bardziej rygorystyczny limiter dla wrażliwych endpointów
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // max 5 prób logowania per IP
  skipSuccessfulRequests: true,
  store: new RedisStore({ client: redis }),
});

app.use('/api/', generalLimiter);
app.use('/auth/login', authLimiter);
app.use('/auth/reset-password', authLimiter);
```
