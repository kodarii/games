# Bun + HonoJS + Drizzle + Better-Auth — Wzorce Enterprise

## Struktura projektu

```
src/
├── index.ts              # entry point — Bun.serve + Hono
├── app.ts                # budowanie instancji Hono z middleware
├── db/
│   ├── schema.ts         # Drizzle schema
│   ├── index.ts          # instancja db
│   └── migrations/       # drizzle-kit migrations
├── auth/
│   └── index.ts          # Better-Auth konfiguracja
├── middleware/
│   ├── correlation.ts    # correlation ID
│   ├── logger.ts         # request logging
│   └── errors.ts         # global error handler
├── routes/
│   └── ...               # route handlers
└── lib/
    └── errors.ts         # hierarchia wyjątków
```

---

## 1. Setup — Bun.serve z Hono

```typescript
// src/index.ts
import { app } from './app';
import { db } from './db';
import { logger } from './lib/logger';

const PORT = parseInt(process.env.PORT || '3000');

// Walidacja konfiguracji przed startem
validateEnv(['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL']);

// Sprawdź połączenie z bazą przed akceptacją ruchu
await checkDatabaseConnection();

// Bun.serve — nie app.listen() jak w Express/Node!
const server = Bun.serve({
  port: PORT,
  fetch: app.fetch, // Hono integruje się przez fetch handler
  error(error) {
    logger.error('Unhandled server error', {
      error: error.message,
      stack: error.stack,
    });
    return new Response('Internal Server Error', { status: 500 });
  },
});

logger.info(`Server running on port ${PORT}`);

// Graceful shutdown — Bun obsługuje sygnały
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

async function shutdown(server: ReturnType<typeof Bun.serve>) {
  logger.info('Shutting down gracefully...');
  server.stop(true); // true = czekaj na in-flight requesty
  await db.$client.end(); // zamknij connection pool (node-postgres)
  logger.info('Shutdown complete');
  process.exit(0);
}

function validateEnv(keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function checkDatabaseConnection() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      logger.info('Database connected');
      return;
    } catch (err) {
      logger.warn(`DB connection attempt ${attempt}/5 failed`, { err });
      if (attempt === 5) {
        logger.fatal('Cannot connect to database — exiting');
        process.exit(1);
      }
      await Bun.sleep(1000 * attempt);
    }
  }
}
```

---

## 2. Hono App — Middleware Stack

```typescript
// src/app.ts
import { Hono } from 'hono';
import { correlationMiddleware } from './middleware/correlation';
import { requestLoggerMiddleware } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { ordersRoutes } from './routes/orders';

// Typ dla zmiennych na kontekście Hono (type-safe!)
type Variables = {
  correlationId: string;
  userId?: string;
  sessionId?: string;
};

export const app = new Hono<{ Variables: Variables }>();

// ─── Middleware (kolejność ma znaczenie!) ───────────────────────────────────

// 1. Correlation ID — musi być pierwszy
app.use('*', correlationMiddleware);

// 2. Request logging
app.use('*', requestLoggerMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────

app.route('/health', healthRoutes);
app.route('/auth', authRoutes); // Better-Auth handler
app.route('/api/v1/orders', ordersRoutes);

// ─── Error handlers (muszą być po routes) ─────────────────────────────────

app.onError(errorHandler); // złapie wszystkie nieobsłużone wyjątki
app.notFound(notFoundHandler);
```

---

## 3. Middleware — Correlation ID i Logging

```typescript
// src/middleware/correlation.ts
import type { Context, Next } from 'hono';

export async function correlationMiddleware(c: Context, next: Next) {
  const correlationId = c.req.header('x-correlation-id') || crypto.randomUUID();

  c.set('correlationId', correlationId);
  c.header('x-correlation-id', correlationId); // zwróć w response

  await next();
}
```

```typescript
// src/middleware/logger.ts
import type { Context, Next } from 'hono';
import { logger } from '../lib/logger';

export async function requestLoggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const correlationId = c.get('correlationId');

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  const logFn =
    status >= 500 ? logger.error : status >= 400 ? logger.warn : logger.info;

  logFn.call(logger, 'Request completed', {
    correlationId,
    method: c.req.method,
    path: c.req.path,
    status,
    durationMs: duration,
    userAgent: c.req.header('user-agent'),
  });
}
```

---

## 4. Global Error Handler — Hono

```typescript
// src/middleware/errors.ts
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppError, InfrastructureError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(err: Error, c: Context) {
  const correlationId = c.get('correlationId') ?? 'unknown';

  // HTTPException — Hono's własne (np. z auth middleware)
  if (err instanceof HTTPException) {
    return c.json(
      {
        type: `https://api.example.com/errors/http`,
        title: err.message,
        status: err.status,
        traceId: correlationId,
      },
      err.status,
    );
  }

  // Błędy domenowe — znane, spodziewane
  if (err instanceof AppError) {
    logger.warn('Application error', {
      correlationId,
      code: err.code,
      message: err.message,
      path: c.req.path,
    });
    return c.json(
      {
        type: `https://api.example.com/errors/${err.code}`,
        title: err.title,
        status: err.statusCode,
        detail: err.message,
        traceId: correlationId,
      },
      err.statusCode as any,
    );
  }

  // Błędy infrastrukturalne
  if (err instanceof InfrastructureError) {
    logger.error('Infrastructure error', {
      correlationId,
      service: err.service,
      error: err.message,
      stack: err.stack,
    });
    return c.json(
      {
        type: 'https://api.example.com/errors/service-unavailable',
        title: 'Service temporarily unavailable',
        status: 503,
        traceId: correlationId,
      },
      503,
    );
  }

  // Nieoczekiwany błąd — bug
  logger.error('Unhandled error', {
    correlationId,
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  return c.json(
    {
      type: 'https://api.example.com/errors/internal',
      title: 'Internal server error',
      status: 500,
      traceId: correlationId,
    },
    500,
  );
}

export function notFoundHandler(c: Context) {
  return c.json(
    {
      type: 'https://api.example.com/errors/not-found',
      title: 'Route not found',
      status: 404,
      instance: c.req.path,
    },
    404,
  );
}
```

---

## 5. Drizzle ORM — Schema i Transakcje

```typescript
// src/db/schema.ts
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  total: integer('total').notNull(), // w groszach/centach, nigdy float!
  createdAt: timestamp('created_at').defaultNow().notNull(),
  version: integer('version').notNull().default(0), // optimistic locking
});

// Outbox pattern
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  publishedAt: timestamp('published_at'),
  publishAttempts: integer('publish_attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Idempotency keys
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: varchar('key', { length: 100 }).primaryKey(),
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
```

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // max connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

export const db = drizzle(pool, { schema });
```

```typescript
// Transakcja z Drizzle — atomowy zapis + outbox
import { db } from '../db';
import { orders, outboxEvents } from '../db/schema';
import { eq, and, isNull, lt } from 'drizzle-orm';

async function createOrder(userId: string, total: number) {
  return await db.transaction(async (tx) => {
    // 1. Zapis zamówienia
    const [order] = await tx
      .insert(orders)
      .values({ userId, total, status: 'pending' })
      .returning();

    // 2. Outbox event — w tej samej transakcji!
    await tx.insert(outboxEvents).values({
      aggregateType: 'Order',
      aggregateId: order.id,
      eventType: 'OrderCreated',
      payload: { orderId: order.id, userId, total },
    });

    return order;
  });
}

// Optimistic locking z Drizzle
async function updateOrderStatus(
  orderId: string,
  expectedVersion: number,
  newStatus: string,
) {
  const result = await db
    .update(orders)
    .set({ status: newStatus, version: expectedVersion + 1 })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.version, expectedVersion), // ← check wersji
      ),
    )
    .returning();

  if (result.length === 0) {
    throw new ConflictError('Order was modified concurrently — please retry');
  }
  return result[0];
}
```

---

## 6. Better-Auth — Konfiguracja i Integracja

```typescript
// src/auth/index.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as schema from '../db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      // Better-Auth tworzy własne tabele — upewnij się że są w schema
      user: schema.users,
      // session, account, verification — dodaj do schema.ts
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  session: {
    // Sesja w cookie — Better-Auth obsługuje HttpOnly, Secure, SameSite
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minut cache cookie po stronie klienta
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 dni
    updateAge: 60 * 60 * 24, // odnów sesję jeśli starsza niż 1 dzień
  },

  // Trusted origins dla CORS
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',') ?? [],
});

// Eksport typów sesji (przydatne w middleware)
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
```

```typescript
// src/routes/auth.ts — podpięcie Better-Auth do Hono
import { Hono } from 'hono';
import { auth } from '../auth';

export const authRoutes = new Hono();

// Better-Auth obsługuje /auth/* routes przez własny handler
authRoutes.on(['GET', 'POST'], '/*', (c) => {
  return auth.handler(c.req.raw);
});
```

```typescript
// src/middleware/auth-required.ts — middleware ochrony endpointów
import type { Context, Next } from 'hono';
import { auth } from '../auth';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      throw new UnauthorizedError('Authentication required');
    }

    // Zapisz na kontekście Hono — dostępne w handlerach
    c.set('userId', session.user.id);
    c.set('sessionId', session.session.id);

    await next();
  };
}

export function requireRole(role: string) {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      throw new UnauthorizedError('Authentication required');
    }

    // Better-Auth przechowuje role w session.user (możesz rozszerzyć schema)
    const userRoles: string[] = (session.user as any).roles ?? [];
    if (!userRoles.includes(role)) {
      throw new ForbiddenError(`Role '${role}' required`);
    }

    c.set('userId', session.user.id);
    await next();
  };
}
```

---

## 7. Route z Walidacją Zod i Autoryzacją Zasobową

```typescript
// src/routes/orders.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth-required';
import { db } from '../db';
import { orders } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';

export const ordersRoutes = new Hono();

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    postalCode: z.string().regex(/^\d{2}-\d{3}$/),
  }),
});

// GET /api/v1/orders/:id — autoryzacja zasobowa (IDOR prevention)
ordersRoutes.get('/:id', requireAuth(), async (c) => {
  const orderId = c.req.param('id');
  const userId = c.get('userId')!;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });

  if (!order) {
    // Zawsze 404 — nie ujawniaj że zasób istnieje ale user nie ma dostępu
    throw new NotFoundError('Order', orderId);
  }

  // Sprawdź własność — nie ufaj że orderId wystarczy!
  if (order.userId !== userId) {
    throw new NotFoundError('Order', orderId); // 404 nie 403 — nie ujawniaj
  }

  return c.json(order);
});

// POST /api/v1/orders — z walidacją Zod
ordersRoutes.post(
  '/',
  requireAuth(),
  zValidator('json', createOrderSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          type: 'https://api.example.com/errors/validation',
          title: 'Validation failed',
          status: 422,
          errors: result.error.flatten().fieldErrors,
        },
        422,
      );
    }
  }),
  async (c) => {
    const userId = c.get('userId')!;
    const body = c.req.valid('json');

    const order = await createOrderWithOutbox(userId, body);

    return c.json(order, 201);
  },
);
```

---

## 8. Health Check w Hono

```typescript
// src/routes/health.ts
import { Hono } from 'hono';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export const healthRoutes = new Hono();

// Liveness — czy proces żyje? (nie sprawdzaj zależności!)
healthRoutes.get('/live', (c) => {
  return c.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness — czy gotowy do ruchu?
healthRoutes.get('/ready', async (c) => {
  const checks: Record<
    string,
    { status: 'ok' | 'error'; latencyMs?: number; error?: string }
  > = {};

  // DB check
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (e) {
    checks.database = { status: 'error', error: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return c.json(
    {
      status: allOk ? 'ready' : 'not-ready',
      checks,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  );
});
```

---

## 9. Hierarchia wyjątków

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly title: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('not-found', 'Not Found', `${resource} '${id}' not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('unauthorized', 'Unauthorized', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('forbidden', 'Forbidden', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', 'Conflict', message, 409);
  }
}

export class ValidationError extends AppError {
  constructor(public readonly fields: Record<string, string[]>) {
    super('validation', 'Validation Failed', 'Request validation failed', 422);
  }
}

export class InfrastructureError extends Error {
  constructor(
    public readonly cause: Error,
    public readonly service: string,
  ) {
    super(`${service}: ${cause.message}`);
    this.name = 'InfrastructureError';
  }
}
```

---

## 10. Idempotency Middleware dla Hono

```typescript
// src/middleware/idempotency.ts
import type { Context, Next } from 'hono';
import { db } from '../db';
import { idempotencyKeys } from '../db/schema';
import { eq, gt } from 'drizzle-orm';

export function idempotent() {
  return async (c: Context, next: Next) => {
    const key = c.req.header('idempotency-key');
    if (!key) return next(); // opcjonalny

    const existing = await db.query.idempotencyKeys.findFirst({
      where: (t, { and, eq, gt }) =>
        and(eq(t.key, key), gt(t.expiresAt, new Date())),
    });

    if (existing) {
      return c.json(existing.responseBody, existing.responseStatus as any);
    }

    await next();

    // Zapisz odpowiedź po sukcesie
    if (c.res.status < 500) {
      const body = await c.res.clone().json();
      await db
        .insert(idempotencyKeys)
        .values({
          key,
          responseStatus: c.res.status,
          responseBody: body,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing();
    }
  };
}
```

---

## 11. Ważne różnice Bun vs Node.js

| Aspekt        | Node.js                                | Bun                                    |
| ------------- | -------------------------------------- | -------------------------------------- |
| HTTP Server   | `http.createServer()` / `app.listen()` | `Bun.serve({ fetch: app.fetch })`      |
| Sleep         | `setTimeout` / `sleep` package         | `await Bun.sleep(ms)`                  |
| File read     | `fs.readFile()`                        | `await Bun.file(path).text()`          |
| Env vars      | `process.env.X`                        | `process.env.X` (to samo)              |
| SIGTERM       | `process.on('SIGTERM', ...)`           | `process.on('SIGTERM', ...)` (to samo) |
| TypeScript    | wymaga ts-node / esbuild               | natywnie, bez kompilacji               |
| Graceful stop | `server.close()`                       | `server.stop(true)`                    |
| Test runner   | Jest / Vitest                          | `bun test` (wbudowany)                 |

**Bun-specific**: `Bun.serve()` zwraca serwer z metodą `stop(graceful: boolean)`. Gdy `graceful = true`, czeka na zakończenie aktywnych requestów przed zamknięciem.

---

## 12. Better-Auth — Gotchas i Bezpieczeństwo

**Wymagane zmienne środowiskowe:**

```bash
BETTER_AUTH_SECRET=  # min 32 znaki, losowe, przechowuj w secrets manager
BETTER_AUTH_URL=     # np. https://api.example.com (bez trailing slash)
```

**CORS z Hono + Better-Auth:**

```typescript
import { cors } from 'hono/cors';

app.use(
  '*',
  cors({
    origin: process.env.TRUSTED_ORIGINS?.split(',') ?? [],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true, // wymagane dla cookie-based sessions!
  }),
);
```

**Rozszerzenie sesji o własne pola (np. role):**

```typescript
// W konfiguracji better-auth
export const auth = betterAuth({
  // ...
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'user',
        required: false,
      },
    },
  },
});
```

**Weryfikacja sesji server-side:**

```typescript
// Zawsze weryfikuj przez auth.api.getSession() — nie ufaj session cookie bez weryfikacji
const session = await auth.api.getSession({
  headers: c.req.raw.headers, // przekaż oryginalne headery (zawierają cookie)
});
```
