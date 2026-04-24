# Transakcje i Spójność Danych — Wzorce i Implementacje

> **Stack użytkownika używa Drizzle ORM** — schema outbox, transakcje Drizzle i optimistic locking z Drizzle są w `references/stack-bun-hono.md` (sekcja 5). Poniżej: wzorce ogólne i SQL niezależny od ORM.

## Outbox Pattern — pełna implementacja

Problem: Chcesz zapisać dane w bazie I wysłać event do brokera. Jak zapewnić, że albo oba nastąpią, albo żadne?

```sql
-- Schema tabeli outbox (SQL)
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  publish_attempts INT DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at)
  WHERE published_at IS NULL;
```

```typescript
// Z Drizzle — atomowy zapis zamówienia + outbox
async function createOrder(userId: string, total: number) {
  return await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({ userId, total, status: 'pending' })
      .returning();

    await tx.insert(outboxEvents).values({
      aggregateType: 'Order',
      aggregateId: order.id,
      eventType: 'OrderCreated',
      payload: { orderId: order.id, userId, total },
    });

    return order;
    // Jeśli commit się nie powiedzie — ŻADEN zapis nie nastąpi
  });
}

// Osobny worker — publikuje eventy z outbox (Bun compatible)
async function outboxPublisher() {
  while (true) {
    const events = await db
      .select()
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.publishedAt),
          lt(outboxEvents.publishAttempts, 5),
        ),
      )
      .orderBy(outboxEvents.createdAt)
      .limit(100)
      .for('update', { skipLocked: true }); // pessimistic lock

    for (const event of events) {
      try {
        await messageBroker.publish(event.eventType, event.payload);
        await db
          .update(outboxEvents)
          .set({ publishedAt: new Date() })
          .where(eq(outboxEvents.id, event.id));
      } catch (err) {
        await db
          .update(outboxEvents)
          .set({ publishAttempts: event.publishAttempts + 1 })
          .where(eq(outboxEvents.id, event.id));
        logger.error('Failed to publish outbox event', {
          eventId: event.id,
          err,
        });
      }
    }

    await Bun.sleep(1000); // Bun native sleep
  }
}
```

## Saga Pattern — Orchestration

```typescript
// Orkiestrator Sagi - centralny koordynator
class CreateOrderSaga {
  async execute(dto: CreateOrderDTO): Promise<void> {
    const sagaId = generateId();
    let orderId: string | null = null;
    let inventoryReserved = false;
    let paymentCharged = false;

    try {
      // Krok 1: Utwórz zamówienie
      orderId = await orderService.createPendingOrder(sagaId, dto);
      logger.info('Saga step 1 completed: order created', { sagaId, orderId });

      // Krok 2: Zarezerwuj inventory
      await inventoryService.reserve(orderId, dto.items);
      inventoryReserved = true;
      logger.info('Saga step 2 completed: inventory reserved', {
        sagaId,
        orderId,
      });

      // Krok 3: Pobierz płatność
      await paymentService.charge(orderId, dto.paymentMethod, dto.total);
      paymentCharged = true;
      logger.info('Saga step 3 completed: payment charged', {
        sagaId,
        orderId,
      });

      // Sukces — potwierdź zamówienie
      await orderService.confirmOrder(orderId);
    } catch (error) {
      logger.error('Saga failed, executing compensations', {
        sagaId,
        orderId,
        error,
      });

      // Kompensacje w odwrotnej kolejności
      if (paymentCharged && orderId) {
        try {
          await paymentService.refund(orderId);
        } catch (e) {
          logger.error('COMPENSATION FAILED: payment refund', {
            sagaId,
            orderId,
            e,
          });
          // Alert! Ręczna interwencja wymagana
        }
      }

      if (inventoryReserved && orderId) {
        try {
          await inventoryService.release(orderId);
        } catch (e) {
          logger.error('COMPENSATION FAILED: inventory release', {
            sagaId,
            orderId,
            e,
          });
        }
      }

      if (orderId) {
        await orderService.cancelOrder(orderId, 'Saga compensation');
      }

      throw new SagaFailedError(sagaId, error as Error);
    }
  }
}
```

## Idempotency Keys

```typescript
// Tabela do śledzenia idempotentnych operacji
// CREATE TABLE idempotency_keys (
//   key VARCHAR(100) PRIMARY KEY,
//   response_status INT,
//   response_body JSONB,
//   created_at TIMESTAMPTZ DEFAULT NOW(),
//   expires_at TIMESTAMPTZ
// );

export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return next(); // Opcjonalny — tylko dla operacji mutujących
    }

    // Sprawdź czy operacja była już wykonana
    const existing = await db('idempotency_keys')
      .where({ key: idempotencyKey })
      .where('expires_at', '>', new Date())
      .first();

    if (existing) {
      logger.info('Idempotent replay', { idempotencyKey });
      return res.status(existing.response_status).json(existing.response_body);
    }

    // Przechwytuj odpowiedź, żeby ją zapisać
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      db('idempotency_keys')
        .insert({
          key: idempotencyKey,
          response_status: res.statusCode,
          response_body: body,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        })
        .catch((err) =>
          logger.error('Failed to save idempotency key', { err }),
        );

      return originalJson(body);
    };

    next();
  };
}

// Użycie:
router.post('/payments', idempotent(), processPaymentHandler);
```

## Poziomy izolacji transakcji — kiedy co używać

| Poziom           | Chroni przed                 | Dozwala              | Kiedy używać                                  |
| ---------------- | ---------------------------- | -------------------- | --------------------------------------------- |
| READ UNCOMMITTED | nic                          | dirty reads          | Nigdy w produkcji                             |
| READ COMMITTED   | dirty reads                  | non-repeatable reads | Domyślny w Postgres — dobry dla większości    |
| REPEATABLE READ  | dirty + non-repeatable reads | phantom reads        | Raporty, obliczenia oparte na kilku odczytach |
| SERIALIZABLE     | wszystko                     | -                    | Operacje finansowe, krytyczne inwentarze      |

```typescript
// Przykład serializable dla operacji finansowej
await db.transaction(async (trx) => {
  await trx.raw('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

  const account = await trx('accounts')
    .where({ id: accountId })
    .forUpdate() // blokada do końca transakcji
    .first();

  if (account.balance < amount) {
    throw new InsufficientFundsError(amount, account.balance);
  }

  await trx('accounts').where({ id: accountId }).decrement('balance', amount);

  await trx('transactions').insert({
    accountId,
    amount: -amount,
    type: 'debit',
  });
});
```

## Optimistic vs Pessimistic Locking

### Optimistic Locking (wersjonowanie)

```typescript
// Kolumna version w tabeli
// UPDATE products SET stock = stock - 1, version = version + 1
// WHERE id = ? AND version = ? -- fail if someone else changed it

async function decrementStock(
  productId: string,
  quantity: number,
  expectedVersion: number,
) {
  const updated = await db('products')
    .where({ id: productId, version: expectedVersion })
    .decrement('stock', quantity)
    .increment('version', 1);

  if (updated === 0) {
    throw new ConflictError(
      'Product was modified by another request — please retry',
    );
  }
}
```

### Pessimistic Locking (SELECT FOR UPDATE)

```typescript
// Blokuje wiersz do końca transakcji
const product = await trx('products')
  .where({ id: productId })
  .forUpdate() // lub .forShare() dla read-only
  .first();
```

Użyj optimistic gdy konflikty są rzadkie. Pessimistic gdy konflikty częste lub gdy operacja jest długa.
