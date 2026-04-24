# Error Handling — Wzorce i Implementacje

## Global Error Handler — HonoJS

> Pełna implementacja `onError` i hierarchia wyjątków jest w `references/stack-bun-hono.md` (sekcje 4 i 9).

```typescript
// Krótkie przypomnienie struktury w Hono:
app.onError((err, c) => {
  const correlationId = c.get('correlationId') ?? 'unknown';

  if (err instanceof AppError) {
    logger.warn('Application error', { correlationId, code: err.code });
    return c.json(
      {
        type: `.../${err.code}`,
        status: err.statusCode,
        traceId: correlationId,
      },
      err.statusCode as any,
    );
  }
  if (err instanceof InfrastructureError) {
    logger.error('Infrastructure error', {
      correlationId,
      service: err.service,
      stack: err.stack,
    });
    return c.json(
      { type: '.../service-unavailable', status: 503, traceId: correlationId },
      503,
    );
  }
  // Nieoczekiwany bug
  logger.error('Unhandled error', {
    correlationId,
    error: err.message,
    stack: err.stack,
  });
  alertOnCriticalError(err); // Slack/PagerDuty/etc.
  return c.json(
    { type: '.../internal', status: 500, traceId: correlationId },
    500,
  );
});
```

### Hierarchia wyjątków

```typescript
// errors/index.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public title: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(
      'not-found',
      'Resource not found',
      `${resource} with ID ${id} not found`,
      404,
    );
  }
}

export class ValidationError extends AppError {
  constructor(public fields: Record<string, string>) {
    super(
      'validation-error',
      'Validation failed',
      'Request validation failed',
      422,
    );
  }
}

export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      'insufficient-funds',
      'Insufficient funds',
      `Required: ${required}, Available: ${available}`,
      422,
    );
  }
}

export class InfrastructureError extends Error {
  constructor(
    public cause: Error,
    public service: string,
  ) {
    super(`${service} infrastructure error: ${cause.message}`);
    this.name = 'InfrastructureError';
  }
}
```

## Structured Logging — strategia

### Pola, które ZAWSZE powinny być w logu

```typescript
interface LogContext {
  correlationId: string; // ID żądania — propaguj przez cały system
  userId?: string; // ID użytkownika (jeśli zalogowany)
  sessionId?: string; // ID sesji
  service: string; // nazwa serwisu
  version: string; // wersja deployu
  environment: string; // production/staging/dev
  timestamp: string; // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  // + kontekst domenowy zależny od operacji
}
```

### Poziomy logowania — co gdzie

| Poziom | Kiedy                                    | Przykłady                                                            |
| ------ | ---------------------------------------- | -------------------------------------------------------------------- |
| DEBUG  | Szczegóły flow, pomocne przy debugowaniu | "Processing payment", "Cache miss for key X"                         |
| INFO   | Ważne zdarzenia biznesowe                | "Order created", "User logged in", "Payment successful"              |
| WARN   | Spodziewane problemy, recovery możliwy   | "Retry attempt 2/3", "Rate limit approaching", "Slow query detected" |
| ERROR  | Błędy wymagające uwagi, operacja failed  | "Payment failed", "Database connection lost"                         |
| FATAL  | System nie może działać                  | "Cannot connect to DB on startup", "Out of memory"                   |

### Co NIE powinno trafiać do logów

- Hasła, tokeny, API keys
- Numery kart kredytowych, dane osobowe (GDPR!)
- Pełne request body z wrażliwymi polami (maskuj przed logowaniem)

```typescript
function sanitizeForLog(body: any): any {
  const sensitive = ['password', 'token', 'secret', 'cardNumber', 'cvv'];
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) =>
      sensitive.some((s) => k.toLowerCase().includes(s)) ? [k, '***'] : [k, v],
    ),
  );
}
```

## Circuit Breaker dla wywołań zewnętrznych

```typescript
// Używając biblioteki `opossum` (Node.js)
import CircuitBreaker from 'opossum';

const paymentCircuitBreaker = new CircuitBreaker(callPaymentService, {
  timeout: 3000, // żądanie timeout po 3s
  errorThresholdPercentage: 50, // otwórz po 50% błędów
  resetTimeout: 30000, // próba zamknięcia po 30s
  volumeThreshold: 5, // min 5 żądań przed oceną
});

paymentCircuitBreaker.on('open', () => {
  logger.error('Payment service circuit breaker OPEN — failing fast');
  alertTeam('Payment service circuit breaker opened');
});

paymentCircuitBreaker.on('halfOpen', () => {
  logger.info('Payment service circuit breaker HALF-OPEN — testing');
});

paymentCircuitBreaker.on('close', () => {
  logger.info('Payment service circuit breaker CLOSED — recovered');
});

// Fallback gdy circuit otwarty
paymentCircuitBreaker.fallback(() => {
  throw new InfrastructureError(new Error('Circuit open'), 'PaymentService');
});
```

## Dead Letter Queue — monitoring

```typescript
// Przykład z AWS SQS
async function processDLQ() {
  const messages = await sqs.receiveMessage({ QueueUrl: DLQ_URL }).promise();

  for (const msg of messages.Messages || []) {
    const body = JSON.parse(msg.Body);
    const approximateReceiveCount = parseInt(
      msg.Attributes?.ApproximateReceiveCount || '0',
    );

    logger.error('Message in DLQ', {
      messageId: msg.MessageId,
      body,
      receiveCount: approximateReceiveCount,
      // Dodaj alarm jeśli DLQ nie jest pusta
    });

    // Wyślij alert do zespołu
    await alertChannel('dlq-alerts', {
      message: 'Message in DLQ requires manual intervention',
      messageId: msg.MessageId,
      payload: body,
    });
  }
}

// Metryka: monitoruj rozmiar DLQ i alarmuj gdy > 0
```
