# Domain Policy Patterns

Business rules and policies are first-class domain citizens. When they live as unnamed
if-chains inside application services, they are invisible to domain experts, impossible
to test in isolation, and inevitably duplicated. This reference covers patterns for making
policies explicit, composable, and testable.

---

## Why Explicit Policies Matter

Bad: business rule buried anonymously

```typescript
// Application service — no one can find this rule, and it'll be copy-pasted elsewhere
if (
  order.total.amount > 1000 &&
  customer.loyaltyYears >= 2 &&
  !order.hasPromoCode()
) {
  order.applyDiscount(new Percentage(10));
}
```

Good: named domain policy

```typescript
const policy = new LoyaltyDiscountPolicy();
if (policy.isEligible(customer, order)) {
  order.applyDiscount(policy.discountFor(customer));
}
```

Now the rule has a name, lives in the domain, can be tested in isolation, and domain
experts can find it.

---

## Specification Pattern

A **Specification** is a named, composable predicate — a boolean business rule encapsulated
as an object. From Evans' blue book.

```typescript
interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}
```

### Simple Specification

```typescript
class IsEligibleForExpressShipping implements Specification<Order> {
  isSatisfiedBy(order: Order): boolean {
    return (
      order.total.isGreaterThan(Money.of(200, 'PLN')) &&
      order.shippingAddress.isInEUCountry()
    );
  }
}
```

### Composite Specifications

```typescript
class AndSpecification<T> implements Specification<T> {
  constructor(
    private left: Specification<T>,
    private right: Specification<T>,
  ) {}
  isSatisfiedBy(c: T) {
    return this.left.isSatisfiedBy(c) && this.right.isSatisfiedBy(c);
  }
}

class NotSpecification<T> implements Specification<T> {
  constructor(private spec: Specification<T>) {}
  isSatisfiedBy(c: T) {
    return !this.spec.isSatisfiedBy(c);
  }
}

// Usage — composing rules from named building blocks
const eligibleForDiscount = new IsLoyalCustomer()
  .and(new HasMinimumOrderValue(Money.of(500, 'PLN')))
  .and(new NotSpecification(new HasActivePromoCode()));
```

### When to Use Specifications

- Validation before a domain operation
- Filtering collections (find all orders satisfying X)
- Business rule that needs a name and independent tests
- Rules that are combined in multiple ways across the domain

---

## Policy Pattern (Explicit Domain Policy)

A **Policy** is a named object that encapsulates a business decision — often with
injectable behaviour or configuration.

```typescript
// Policy interface — secondary port in domain
interface RefundPolicy {
  isRefundable(order: Order, requestedAt: Instant): boolean;
  maxRefundAmount(order: Order): Money;
}

// Domain policy implementation
class StandardRefundPolicy implements RefundPolicy {
  private readonly refundWindowDays = 30;

  isRefundable(order: Order, requestedAt: Instant): boolean {
    const daysSincePlaced = order.placedAt.daysUntil(requestedAt);
    return (
      daysSincePlaced <= this.refundWindowDays &&
      order.status === OrderStatus.DELIVERED &&
      !order.wasAlreadyRefunded()
    );
  }

  maxRefundAmount(order: Order): Money {
    return order.total; // full refund
  }
}

// Alternative policy for subscription customers
class SubscriptionRefundPolicy implements RefundPolicy {
  isRefundable(order: Order, requestedAt: Instant): boolean {
    return true; // subscribers always eligible
  }
  maxRefundAmount(order: Order): Money {
    return order.total.percentage(new Percentage(50));
  }
}
```

Injecting the policy into the use case:

```typescript
class RequestRefundUseCase {
  constructor(
    private orders: OrderRepository,
    private refundPolicy: RefundPolicy, // injected — strategy pattern
    private refunds: RefundRepository,
  ) {}

  execute(command: RequestRefundCommand): void {
    const order = this.orders.findById(command.orderId);
    if (!this.refundPolicy.isRefundable(order, command.requestedAt)) {
      throw new RefundNotEligibleError();
    }
    const refund = Refund.create(
      order,
      this.refundPolicy.maxRefundAmount(order),
    );
    this.refunds.save(refund);
  }
}
```

---

## Strategy Pattern for Domain Behaviour

When business behaviour varies by context, customer type, product category, or configuration —
use Strategy to make the variation explicit.

### Pricing Strategy

```typescript
interface PricingStrategy {
  calculatePrice(product: Product, customer: Customer, quantity: Quantity): Money;
}

class RetailPricingStrategy implements PricingStrategy { ... }
class WholesalePricingStrategy implements PricingStrategy { ... }
class PromotionalPricingStrategy implements PricingStrategy {
  constructor(private baseStrategy: PricingStrategy, private discount: Percentage) {}
  calculatePrice(...): Money {
    return this.baseStrategy.calculatePrice(...).reduce(this.discount);
  }
}
```

### Shipping Cost Strategy

```typescript
interface ShippingCostStrategy {
  calculate(order: Order, destination: Address): Money;
}

class FlatRateShipping implements ShippingCostStrategy { ... }
class WeightBasedShipping implements ShippingCostStrategy { ... }
class FreeShippingAboveThreshold implements ShippingCostStrategy { ... }
```

---

## Domain Events as Policy Triggers

Policies often react to domain events — this is the **Policy** sticky note from Event Storming
(pink). These are sometimes called **Reactors** or **Domain Event Handlers**.

```
Event:  OrderPlaced
Policy: "When order is placed AND customer is first-time buyer, send welcome discount"
Result: WelcomeDiscountIssued event
```

Implementation:

```typescript
class WelcomeDiscountPolicy implements DomainEventHandler<OrderPlaced> {
  handle(event: OrderPlaced): void {
    if (this.isFirstOrder(event.customerId)) {
      // issue discount via domain service
    }
  }
}
```

Name these explicitly — not `OrderPlacedHandler` (technical name) but `WelcomeDiscountPolicy`
(domain name).

---

## Invariant Rules vs. Policy Rules

|                      | Invariant Rule               | Policy Rule                           |
| -------------------- | ---------------------------- | ------------------------------------- |
| **Where**            | Inside aggregate             | Separate policy object                |
| **When enforced**    | Always, unconditionally      | Depends on context / configuration    |
| **Can be bypassed?** | Never                        | Sometimes (admin override, etc.)      |
| **Example**          | Order total must be positive | Discount eligibility                  |
| **Failure**          | Throws domain exception      | Returns false / emits rejection event |

```typescript
class Order {
  // INVARIANT — always enforced, throws if violated
  addLine(line: OrderLine): void {
    if (line.quantity.isZero())
      throw new DomainError('Quantity must be positive');
    this.lines.push(line);
  }
}

// POLICY — applied conditionally, injected
class MinimumOrderValuePolicy {
  isSatisfiedBy(order: Order): boolean {
    return order.total.isGreaterThan(this.minimum);
  }
}
```

---

## Naming Guide for Policies

| Anti-pattern name  | Better name                                     |
| ------------------ | ----------------------------------------------- |
| `DiscountHelper`   | `LoyaltyDiscountPolicy`                         |
| `OrderValidator`   | `OrderPlacementRules`                           |
| `CheckEligibility` | `RefundEligibilitySpecification`                |
| `PriceCalculator`  | `VolumeDiscountPricingStrategy`                 |
| `RuleEngine`       | Explicit named specifications composed together |

---

## Common Policy Smells

- **Unnamed policy** — if-chain with no class name, copy-pasted across services
- **Policy in aggregate** — aggregate checking context-dependent rules (inject policy instead)
- **God policy** — one class with 20 methods for unrelated rules (split by domain concept)
- **Missing specification** — `findAll().filter(o => o.status == 'X' && o.total > Y)` repeated
  in 3 query methods → should be a named Specification
- **Hard-coded threshold** — `if (total > 1000)` with no named constant or configurable policy
