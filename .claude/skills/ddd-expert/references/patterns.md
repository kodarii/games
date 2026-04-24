# Tactical DDD Patterns Reference

## Aggregates

An Aggregate is a cluster of domain objects (entities + value objects) treated as a single unit
for data changes. Every Aggregate has a **root entity** — the only member reachable from outside.

### Root Selection Rules

- The root is the entity whose identity gives meaning to the whole cluster
- Lifecycle of children is tied to the root (children don't exist without the root)
- Only the root is fetched/saved by a Repository

### Invariant Identification

Before defining an aggregate, ask: "What business rule requires these objects to be consistent
at the same moment?" Only co-locate things that share an invariant. Everything else is a
separate aggregate (reference by ID).

### Size Heuristics

- Prefer small aggregates (1-3 entities, a handful of value objects)
- Large aggregates become write bottlenecks and cause contention
- If you feel you need a large aggregate, look for missing domain events + eventual consistency

### Example: Order Aggregate

```
OrderId (root identity)
├── List<OrderLine> (child entities — no identity outside Order)
│   ├── ProductId (reference by ID, not object)
│   ├── Quantity (value object)
│   └── UnitPrice (value object — snapshot, not live price)
├── ShippingAddress (value object)
├── OrderStatus (value object / enum)
└── Money total (value object — derived)
```

The `Customer` is NOT inside Order — reference by `CustomerId`. It has its own lifecycle.

---

## Value Objects

A Value Object has no identity — it is defined entirely by its attributes. Two VOs with the
same attributes are equal.

### Rules

- Immutable — never change a VO in place, replace it
- Self-validating — constructor rejects invalid state
- Contains behavior relevant to the concept it models

### Examples of good Value Objects

- `Money(amount: Decimal, currency: Currency)`
- `EmailAddress(value: String)` — with format validation
- `DateRange(start: LocalDate, end: LocalDate)` — with `contains(date)`, `overlaps(other)` methods
- `Percentage(value: Decimal)` — guards against < 0 or > 100
- `PhoneNumber(value: String, countryCode: String)`

### Common mistake

Primitive obsession — using `String` for email, `Decimal` for money, `String` for status.
These miss the opportunity to encode invariants and behavior.

---

## Domain Services

Use a Domain Service when:

- An operation is significant to the domain but doesn't belong to a single entity or VO
- The operation involves multiple aggregates
- The operation requires domain knowledge but has no natural home

### Signs you need a Domain Service

- Logic sitting in Application Service that references domain concepts
- Logic duplicated across aggregates
- Logic that crosses aggregate boundaries

### Naming

Use verb phrases from the ubiquitous language:

- `TransferFundsService`
- `PricingCalculator`
- `CreditRiskEvaluator`

NOT: `OrderManager`, `OrderHelper`, `OrderProcessor`

---

## Repositories

One Repository per Aggregate Root. A Repository simulates an in-memory collection of aggregates.

### Interface Rules

- Belongs to the **domain layer** (interface defined there)
- Implementation in **infrastructure layer**
- Exposes: `findById`, `save`, `findBySpecification` (or domain-specific finders)
- Never exposes raw query objects (no `findAll().where(...)` chains in domain)

### Query Responsibility

Complex queries for read models should NOT go through the domain repository.
Use a separate **Query Model** or read-side projection — this is the CQRS split.

---

## Domain Events

### Structure

```
event OrderPlaced {
  orderId: OrderId       // always include aggregate root ID
  customerId: CustomerId
  items: List<OrderLineSnapshot>
  totalAmount: Money
  occurredOn: Instant    // when the fact happened
}
```

### When to Emit

- After the aggregate has validated and applied the change
- Before the transaction commits (for transactional outbox pattern)

### Publication Patterns

1. **In-process event bus** — synchronous, within same bounded context
2. **Transactional outbox** — write event to DB table, relay to message broker
3. **Direct message broker** — risk of lost events without outbox

---

## Application Services

Application Services orchestrate use cases. They do NOT contain domain logic.

### Responsibilities

- Load aggregate from repository
- Call aggregate method(s)
- Save aggregate
- Publish events (if not done by domain)
- Handle transactions

### Anti-pattern: Logic creep

If your application service has if-statements about domain state, that logic belongs in the
aggregate or domain service.

```python
# BAD — domain logic in application service
def place_order(command):
    order = repo.find(command.order_id)
    if order.status == "draft" and len(order.lines) > 0:  # ← domain logic!
        order.status = "placed"
        repo.save(order)

# GOOD
def place_order(command):
    order = repo.find(command.order_id)
    order.place()  # ← domain logic inside aggregate
    repo.save(order)
```
