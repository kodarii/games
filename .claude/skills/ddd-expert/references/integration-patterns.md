# Integration Patterns for DDD Systems

Covers reliable integration with external systems: payment providers, email/SMS services,
shipping carriers, and any third-party API. These patterns solve the fundamental tension
between domain consistency and external system calls.

---

## The Core Problem: Dual Write

The most common integration mistake. You want to:

1. Save order to your database
2. Publish `OrderPlaced` event to a message broker
3. Call payment gateway

If step 1 succeeds but steps 2 or 3 fail — your system is inconsistent. This is the
**dual write problem**. Every integration pattern below is ultimately about solving this.

---

## Transactional Outbox Pattern

**When to use:** Any time you need to reliably publish an event or call an external system
after a domain state change. Especially: triggering emails, publishing to Kafka/RabbitMQ,
notifying payment processor.

**How it works:**

1. In the same DB transaction that saves the aggregate, write the outgoing message to an
   `outbox` table (same DB, same transaction)
2. A separate **Relay** process polls the outbox and forwards messages to the broker/API
3. On success, mark the outbox record as processed (or delete it)

```
┌──────────────────────────────────┐
│  Application Service             │
│  BEGIN TRANSACTION               │
│    save(order)                   │  ← domain state
│    outbox.insert(OrderPlaced)    │  ← same transaction
│  COMMIT                          │
└──────────────────────────────────┘
         ↓ (async, separate process)
┌──────────────────────────────────┐
│  Outbox Relay                    │
│  poll outbox WHERE sent = false  │
│  publish to broker / call API    │
│  mark as sent                    │
└──────────────────────────────────┘
```

**Outbox table schema (minimal):**

```sql
CREATE TABLE outbox (
  id          UUID PRIMARY KEY,
  event_type  VARCHAR NOT NULL,       -- e.g. 'OrderPlaced'
  payload     JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL,
  sent_at     TIMESTAMP,              -- null = not yet sent
  attempts    INT DEFAULT 0
);
```

**Key properties:**

- At-least-once delivery guaranteed (relay retries on failure)
- Must pair with idempotency on the consumer side
- Works with any relational DB; also possible with MongoDB (transactions) or DynamoDB (streams)

**Alternatives to polling:**

- **CDC (Change Data Capture)** via Debezium — reads DB transaction log directly, lower latency,
  no polling overhead. Preferred for high-throughput systems.

---

## Idempotency Pattern

**When to use:** Any external call that must not be executed twice — payments, email sends,
SMS, inventory reservations.

**The rule:** Every outgoing call carries an **idempotency key**. If the same key is received
twice, the provider returns the same result without executing the action again.

### For payment providers (Stripe, PayU, Przelewy24)

```
POST /v1/payment-intents
Idempotency-Key: order-7f3a-attempt-1   ← stable, deterministic key

// If network times out, retry with the SAME key
// Provider deduplicates, no double charge
```

**Key generation strategy:**

- Use `{aggregate_id}-{command_id}` or `{aggregate_id}-{event_id}`
- Must be stable across retries — don't use random UUID per attempt
- Store the key alongside the outbox record

### For your own endpoints

```sql
CREATE TABLE idempotency_keys (
  key         VARCHAR PRIMARY KEY,
  response    JSONB,
  created_at  TIMESTAMP
);
```

Check before processing; return stored response if key exists.

---

## Saga Pattern

**When to use:** A business process that spans multiple aggregates or bounded contexts,
where each step can fail and needs compensation.

Classic examples:

- **Order fulfillment**: Place order → Reserve inventory → Charge payment → Schedule shipment
- **User registration**: Create account → Send verification email → Provision resources
- **Refund**: Initiate refund → Reverse payment → Restore inventory → Notify customer

### Two Flavors

#### Choreography (event-driven)

Each context reacts to events from the previous step and emits its own events.

```
OrderContext          InventoryContext       PaymentContext
    │                      │                     │
    ├─ OrderPlaced ────────►│                     │
    │                      ├─ InventoryReserved ─►│
    │                      │                     ├─ PaymentCharged
    │◄──────────────────────┼─────────────────────┤
    │ OrderConfirmed        │                     │
```

**Good for:** Simple, linear flows with few steps.
**Bad for:** Complex flows — hard to see the whole process, compensations get messy.

#### Orchestration (saga coordinator)

A dedicated **Saga** object drives the process, issuing commands and reacting to results.

```
OrderSaga (coordinator)
  → sends: ReserveInventory command
  ← receives: InventoryReserved or InventoryUnavailable
  → sends: ChargePayment command
  ← receives: PaymentCharged or PaymentFailed
  → on failure: sends: ReleaseInventory (compensation)
```

**Good for:** Complex flows, clear visibility, explicit compensation logic.
**Implementation:** The Saga is typically a persisted state machine (stored in DB).

```
saga_state table:
  saga_id, saga_type, current_step, status, payload, updated_at
```

### Compensation (Rollback)

Sagas don't use DB rollback — they use **compensating transactions**: domain actions that
undo previous steps.

| Step | Forward Action     | Compensating Action |
| ---- | ------------------ | ------------------- |
| 1    | `ReserveInventory` | `ReleaseInventory`  |
| 2    | `ChargePayment`    | `RefundPayment`     |
| 3    | `ScheduleShipment` | `CancelShipment`    |

**Rule:** Every saga step that modifies state must have a defined compensation.

---

## ACL for External Systems

Payment providers, email services, and shipping carriers have their own data models. An
**Anti-Corruption Layer** translates between their model and your domain language.

### Payment ACL Example

Stripe has `PaymentIntent`, `Charge`, `Customer` — your domain has `Payment`, `Order`.

```
// ACL — lives in infrastructure layer
class StripePaymentAdapter implements PaymentGateway {

  charge(command: ChargePaymentCommand): PaymentResult {
    const stripeIntent = this.stripe.paymentIntents.create({
      amount: command.amount.inCents(),
      currency: command.amount.currency.code,
      idempotency_key: command.idempotencyKey,
      metadata: { orderId: command.orderId.value }
    });

    // Translate Stripe result → your domain type
    return stripeIntent.status === 'succeeded'
      ? PaymentResult.success(stripeIntent.id)
      : PaymentResult.failed(stripeIntent.last_payment_error?.message);
  }
}
```

Your domain never sees `PaymentIntent` or Stripe-specific fields. If you switch to PayU,
only the adapter changes.

### Email ACL Example

```
// Domain interface — in domain layer
interface NotificationService {
  sendOrderConfirmation(order: Order): void;
}

// ACL implementation — in infrastructure layer
class SendGridNotificationAdapter implements NotificationService {
  sendOrderConfirmation(order: Order): void {
    this.sendgrid.send({
      to: order.customerEmail.value,
      templateId: 'd-xxxx',
      dynamicTemplateData: {
        orderId: order.id.value,
        total: order.total.format()
      }
    });
  }
}
```

---

## Webhook Handling

Webhooks from payment providers (payment confirmed, chargeback) arrive asynchronously.
Treat them as **external events** that need translation into domain events.

**Webhook processing flow:**

1. Receive webhook → store raw payload immediately (don't process inline)
2. Return 200 fast — provider will retry if you're slow
3. Process stored webhooks asynchronously via worker
4. Verify signature before processing (prevent spoofing)
5. Deduplicate by provider's event ID (idempotency)

```
POST /webhooks/stripe
  → verify Stripe-Signature header
  → store in webhook_inbox table { provider, event_id, payload, received_at }
  → return 200

Worker:
  → poll webhook_inbox WHERE processed = false
  → translate to domain event (ACL)
  → publish to internal event bus
  → mark processed
```

---

## Choosing Integration Style

| Scenario                                | Recommended Pattern                            |
| --------------------------------------- | ---------------------------------------------- |
| Send email after order placed           | Outbox → event → email service adapter         |
| Charge payment (must not double-charge) | Outbox + idempotency key to payment gateway    |
| Multi-step: reserve → pay → ship        | Orchestration Saga                             |
| Simple notification chain               | Choreography                                   |
| Integrate with legacy ERP               | ACL (translate their model, don't let it leak) |
| Receive webhooks from Stripe/PayU       | Webhook inbox + async processor                |
| High-volume event publishing            | Outbox + CDC (Debezium) instead of polling     |

---

## Real-World Integration Examples

### Przelewy24 / PayU (Polish payment gateways)

- Both support idempotency via transaction reference ID — always set it
- Payments are often asynchronous (redirect flow) — use webhook inbox for confirmation
- Map their `status` codes (e.g. P24's `status=1`) in the ACL, not in domain logic

### SendGrid / Mailgun

- Use template IDs, not raw HTML in domain code
- Send via outbox — don't call synchronously in the request/response cycle
- Track delivery via webhook (bounces, opens) in a separate Notification context

### Twilio (SMS)

- MessageSid is your idempotency anchor
- Rate limits are real — queue via outbox, don't call inline
