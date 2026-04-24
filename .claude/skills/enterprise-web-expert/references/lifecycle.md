# Cykl życia aplikacji i Crash Recovery — Implementacje

> **Stack użytkownika: Bun + Hono** — pełny setup `Bun.serve()`, graceful shutdown przez `server.stop(true)`, walidacja env, health check endpoint i obsługa sygnałów są w `references/stack-bun-hono.md` (sekcje 1 i 8). Poniżej: szczegółowe wzorce crash recovery, checkpointing i Kubernetes.

## Startup — walidacja przed akceptacją ruchu (Bun)

```typescript
// src/index.ts — pełna sekwencja startu
validateEnv(['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL']);

await connectDatabaseWithRetry(); // fail fast jeśli baza niedostępna
await runMigrations(); // drizzle-kit migrate

const server = Bun.serve({
  port: PORT,
  fetch: app.fetch, // Hono handler
  error(error) {
    logger.error('Bun server error', { error: error.message });
    return new Response('Internal Server Error', { status: 500 });
  },
});

// Rejestruj sygnały PO uruchomieniu serwera
process.on('SIGTERM', () => shutdown(server));
process.on('SIGINT', () => shutdown(server));
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  shutdown(server);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal('Unhandled rejection', { reason });
  shutdown(server);
});

async function connectDatabaseWithRetry() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      logger.info('Database connected');
      return;
    } catch (err) {
      logger.warn(`DB connection attempt ${attempt}/5 failed`);
      if (attempt === 5) {
        logger.fatal('Cannot connect to DB');
        process.exit(1);
      }
      await Bun.sleep(1000 * attempt);
    }
  }
}

async function shutdown(server: ReturnType<typeof Bun.serve>) {
  logger.info('Graceful shutdown starting...');
  server.stop(true); // czeka na in-flight requesty (Bun API)
  await db.$client.end(); // zamknij connection pool
  process.exit(0);
}
```

## Health Check Endpoints

```typescript
// Liveness probe — czy proces żyje?
// Kubernetes wywołuje co 10s; jeśli fail → restart kontenera
app.get('/health/live', (req, res) => {
  // NIE sprawdzaj bazy danych tu! Tylko czy proces jest zdrowy
  res
    .status(200)
    .json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness probe — czy gotowy do ruchu?
// Kubernetes wywołuje przed wysłaniem ruchu; jeśli fail → brak ruchu (nie restart)
app.get('/health/ready', async (req, res) => {
  const checks: Record<
    string,
    { status: 'ok' | 'error'; latencyMs?: number; error?: string }
  > = {};

  // Database check
  const dbStart = Date.now();
  try {
    await db.raw('SELECT 1');
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.database = { status: 'error', error: (e as Error).message };
  }

  // Redis check
  const redisStart = Date.now();
  try {
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
  } catch (e) {
    checks.redis = { status: 'error', error: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not-ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Startup probe — czy aplikacja się uruchomiła? (Kubernetes)
// Używaj zamiast liveness w czasie wolnego startu (np. DB migrations)
app.get('/health/startup', (req, res) => {
  res
    .status(appStarted ? 200 : 503)
    .json({ status: appStarted ? 'started' : 'starting' });
});
```

## Graceful Shutdown

```typescript
function setupGracefulShutdown(server: http.Server) {
  let isShuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 30_000; // 30 sekund

  async function shutdown(signal: string) {
    if (isShuttingDown) return; // Tylko raz
    isShuttingDown = true;

    logger.info(`Received ${signal} — starting graceful shutdown`);

    // Timeout awaryjny — jeśli shutdown trwa zbyt długo
    const forceShutdown = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // 1. Przestań akceptować nowe żądania
      server.close(() => {
        logger.info('HTTP server closed — no new connections');
      });

      // 2. Poczekaj na in-flight requesty
      await waitForInflightRequests();

      // 3. Zatrzymaj konsumentów kolejek (najpierw — przestań pobierać)
      await messageConsumer.stop();
      logger.info('Message consumer stopped');

      // 4. Zamknij połączenia z bazą
      await db.destroy();
      logger.info('Database pool closed');

      // 5. Zamknij Redis
      await redis.quit();
      logger.info('Redis connection closed');

      clearTimeout(forceShutdown);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error });
      clearTimeout(forceShutdown);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM')); // Kubernetes/systemd
  process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C

  // Nieobsłużone wyjątki — loguj i zakończ
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    // Nie wznawiaj — stan procesu jest nieznany
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled promise rejection', { reason, promise });
    shutdown('unhandledRejection');
  });
}

// Śledzenie in-flight requestów
let inflightRequests = 0;

app.use((req, res, next) => {
  inflightRequests++;
  res.on('finish', () => inflightRequests--);
  res.on('close', () => inflightRequests--);
  next();
});

async function waitForInflightRequests(timeoutMs = 25_000) {
  const start = Date.now();
  while (inflightRequests > 0) {
    if (Date.now() - start > timeoutMs) {
      logger.warn(
        `Still ${inflightRequests} in-flight requests after ${timeoutMs}ms`,
      );
      break;
    }
    await sleep(100);
  }
}
```

## Crash Recovery — Wzorce

### Bezpieczny restart po crashu — checkpointing

```typescript
// Długo trwająca operacja z checkpointingiem
class DataMigrationJob {
  async run(jobId: string) {
    const checkpoint = await redis.get(`checkpoint:${jobId}`);
    const lastProcessedId = checkpoint ? parseInt(checkpoint) : 0;

    logger.info('Starting migration', { jobId, resumingFrom: lastProcessedId });

    const batchSize = 100;
    let cursor = lastProcessedId;
    let processed = 0;

    while (true) {
      const records = await db('old_records')
        .where('id', '>', cursor)
        .orderBy('id')
        .limit(batchSize);

      if (records.length === 0) break;

      await processRecords(records);
      cursor = records[records.length - 1].id;
      processed += records.length;

      // Zapisz checkpoint
      await redis.set(`checkpoint:${jobId}`, cursor.toString());
      logger.info('Checkpoint saved', { jobId, cursor, processed });
    }

    await redis.del(`checkpoint:${jobId}`);
    logger.info('Migration complete', { jobId, totalProcessed: processed });
  }
}
```

### Message Consumer — commit offset po przetworzeniu

```typescript
// ❌ ZŁE — auto-commit; jeśli crash przed przetworzeniem → utrata wiadomości
// consumer.subscribe({ fromBeginning: false }) — auto commit

// ✓ POPRAWNE — manual commit po udanym przetworzeniu
consumer.run({
  autoCommit: false, // ← kluczowe
  eachMessage: async ({ topic, partition, message, heartbeat }) => {
    try {
      // 1. Przetwórz wiadomość
      await processMessage(message);

      // 2. Commit dopiero po sukcesie
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        },
      ]);
    } catch (error) {
      // NIE commit — wiadomość zostanie ponowiona po restarcie
      logger.error('Failed to process message', {
        error,
        offset: message.offset,
      });
      // Opcjonalnie: jeśli błąd nie jest przejściowy → DLQ
    }
  },
});
```

## Kubernetes — Lifecycle Hooks i Konfiguracja

```yaml
# deployment.yaml — pełna konfiguracja lifecycle
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60 # Czas na graceful shutdown
      containers:
        - name: api
          lifecycle:
            preStop:
              exec:
                command: ['/bin/sh', '-c', 'sleep 5'] # Czas na deregistrację z load balancera

          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3

          startupProbe:
            httpGet:
              path: /health/startup
              port: 3000
            failureThreshold: 30 # 30 * 10s = 5 minut na startup
            periodSeconds: 10

          resources:
            requests:
              memory: '256Mi'
              cpu: '100m'
            limits:
              memory: '512Mi' # OOMKill przy przekroczeniu
              cpu: '500m'
```

## Structured Logging — konfiguracja

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }), // string zamiast number
  },
  base: {
    service: process.env.SERVICE_NAME,
    version: process.env.SERVICE_VERSION,
    environment: process.env.NODE_ENV,
  },
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.authorization', '*.cookie'],
    censor: '***REDACTED***',
  },
  // W produkcji: JSON; w dev: ładny format
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
});

// Middleware do propagacji correlation ID
app.use((req, res, next) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || generateId();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  // Child logger z correlation ID w każdym logu
  req.logger = logger.child({
    correlationId,
    path: req.path,
    method: req.method,
  });
  next();
});
```
