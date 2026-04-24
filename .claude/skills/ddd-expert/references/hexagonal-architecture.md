# Ports & Adapters (Hexagonal Architecture)

Coined by Alistair Cockburn. The core idea: your application has a domain at the centre,
and the outside world (HTTP, DB, message broker, email provider) connects to it only through
well-defined interfaces — **ports**. Concrete implementations of those interfaces are **adapters**.

The dependency rule is absolute: **domain and application layers never depend on infrastructure**.
Infrastructure depends on the domain — never the other way around.

---

## The Three Layers

```
┌─────────────────────────────────────────────┐
│                INFRASTRUCTURE               │  ← Adapters live here
│  HTTP controllers, DB repositories,         │
│  message consumers, email clients,          │
│  payment SDK wrappers                       │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │           APPLICATION                 │  │  ← Use case orchestration
│  │  Application Services, Command        │  │
│  │  Handlers, Query Handlers, Sagas      │  │
│  │                                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │           DOMAIN                │  │  │  ← Pure business logic
│  │  │  Aggregates, Entities, Value    │  │  │
│  │  │  Objects, Domain Services,      │  │  │
│  │  │  Domain Events, Policies,       │  │  │
│  │  │  Port interfaces (secondary)    │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Primary Ports (Driving Side)

Primary ports are **use case interfaces** — they define what the application can do.
They are **called by** the outside world (HTTP, CLI, event consumer, test).

```typescript
// Primary port — defined in application layer
interface PlaceOrderUseCase {
  execute(command: PlaceOrderCommand): PlaceOrderResult;
}

// Primary adapter — defined in infrastructure layer
class PlaceOrderHttpController {
  constructor(private useCase: PlaceOrderUseCase) {}

  post(req: Request, res: Response) {
    const command = PlaceOrderCommand.fromRequest(req.body);
    const result = this.useCase.execute(command);
    res.json(result.toResponse());
  }
}
```

**Other primary adapters:** CLI commands, message consumer handlers, scheduled job triggers,
test fixtures calling use case directly.

---

## Secondary Ports (Driven Side)

Secondary ports are **interfaces the domain/application requires from infrastructure**.
The domain defines the interface; infrastructure provides the implementation.

```typescript
// Secondary port — defined in DOMAIN layer
interface OrderRepository {
  findById(id: OrderId): Order | null;
  save(order: Order): void;
}

interface PaymentGateway {
  charge(command: ChargePaymentCommand): PaymentResult;
}

interface NotificationService {
  sendOrderConfirmation(order: Order): void;
}

interface Clock {
  now(): Instant; // even time is a port — makes tests deterministic
}

// Secondary adapter — defined in INFRASTRUCTURE layer
class PostgresOrderRepository implements OrderRepository {
  // ... JPA/Sequelize/Prisma implementation
}

class StripePaymentGateway implements PaymentGateway {
  // ... Stripe SDK calls, result translation
}
```

**Key insight:** The domain owns the interface contract. The infrastructure conforms to it —
not the other way around. This is the Dependency Inversion Principle applied architecturally.

---

## Package / Module Structure

Enforce boundaries through package structure. One common layout per bounded context:

```
order-context/
├── domain/
│   ├── model/
│   │   ├── Order.ts
│   │   ├── OrderLine.ts
│   │   └── OrderId.ts
│   ├── events/
│   │   └── OrderPlaced.ts
│   ├── policies/
│   │   └── OrderCancellationPolicy.ts
│   └── ports/                          ← secondary port interfaces live here
│       ├── OrderRepository.ts
│       ├── PaymentGateway.ts
│       └── NotificationService.ts
├── application/
│   ├── PlaceOrderUseCase.ts            ← primary port interface + implementation
│   ├── CancelOrderUseCase.ts
│   └── commands/
│       └── PlaceOrderCommand.ts
└── infrastructure/
    ├── persistence/
    │   └── PostgresOrderRepository.ts  ← implements domain port
    ├── payment/
    │   └── StripePaymentGateway.ts     ← implements domain port
    ├── messaging/
    │   └── RabbitMQEventPublisher.ts
    └── http/
        └── OrderController.ts          ← primary adapter
```

**Rule of thumb:** No `import` from `infrastructure/` should appear in `domain/` or `application/`.
This can be enforced via linting rules (e.g. `eslint-plugin-boundaries`, ArchUnit in Java).

---

## Testing Benefits

Hexagonal architecture makes testing trivially easy at every layer:

```typescript
// Domain test — zero infrastructure
test('order cannot be placed with empty items', () => {
  const order = Order.create(customerId);
  expect(() => order.place([])).toThrow(DomainError);
});

// Application test — fake adapters (in-memory)
test('place order sends confirmation email', () => {
  const repo = new InMemoryOrderRepository();
  const notifications = new SpyNotificationService();
  const useCase = new PlaceOrderUseCase(repo, notifications);

  useCase.execute(new PlaceOrderCommand(...));

  expect(notifications.sentConfirmations).toHaveLength(1);
});

// Integration test — real adapter, real DB
test('order persisted to postgres', () => {
  // Only here do you need a real DB
});
```

The ratio should be: **many domain tests → many application tests with fakes → few integration tests**.

---

## Common Layer Violations to Flag

| Violation                      | Example                                                      | Fix                                     |
| ------------------------------ | ------------------------------------------------------------ | --------------------------------------- |
| Domain imports infrastructure  | `import { PrismaClient } from '@prisma/client'` in aggregate | Move to adapter, inject via port        |
| Domain type in port            | `findById(): Promise<PrismaOrder>`                           | Port returns domain type `Order`        |
| HTTP concept in application    | `execute(req: Request)` in use case                          | Map to command object in adapter        |
| Framework annotation in domain | `@Entity`, `@Column` on aggregate                            | Use separate persistence model + mapper |
| Infrastructure in domain test  | Test that hits DB to test a business rule                    | Use in-memory fake                      |

---

## Hexagonal vs Clean Architecture vs Onion

All three enforce the same core rule: **domain at centre, no outward dependencies**.
The names differ; the principle is identical.

- **Hexagonal** (Cockburn): emphasises ports and adapters explicitly
- **Clean Architecture** (Martin): emphasises use case layer, entity/interactor distinction
- **Onion Architecture** (Palermo): emphasises concentric rings, domain model as innermost

When someone mentions any of these, apply the same dependency inversion analysis.
