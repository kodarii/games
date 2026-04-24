# Context Map Relationship Patterns

Nine relationship patterns from Evans + Vernon. In a large system, every context boundary
should be labeled with one of these.

---

## 1. Shared Kernel

Two contexts share a small, explicitly agreed-upon subset of the domain model.

- **Use when**: Two teams are tightly coupled by organizational reality, and extraction is
  impractical short-term
- **Cost**: Changes to the kernel require coordination between both teams
- **Signal to use**: `---- Shared Kernel ----` notation in context map

```
graph LR
  BillingContext <-.->|Shared Kernel: Money, Currency| TaxContext
```

---

## 2. Customer / Supplier

Upstream (supplier) produces; downstream (customer) consumes. Downstream can negotiate
requirements with upstream.

- **Use when**: Clear producer/consumer relationship, downstream has some influence
- **Works well**: When teams have a formal planning process together
- **Breaks down**: When upstream ignores downstream needs

```
graph LR
  InventoryContext -->|U| OrderContext
  OrderContext -->|D| InventoryContext
  note: "Customer/Supplier"
```

---

## 3. Conformist

Downstream conforms to upstream's model with no negotiation power.

- **Use when**: Using third-party or legacy systems where you can't influence the model
- **Cost**: Downstream's model is polluted by upstream concepts
- **Common case**: Integrating with a SaaS platform (Salesforce, SAP, etc.)

---

## 4. Anti-Corruption Layer (ACL)

Downstream creates a translation layer to protect its own model from the upstream model.

- **Use when**: Upstream model is messy, legacy, or conceptually misaligned
- **Benefit**: Downstream preserves its own ubiquitous language
- **Cost**: Extra translation code to maintain

```
graph LR
  LegacyERP -->|ACL| OrderContext
```

ACL contains: Adapters, Translators, Facades — all in the downstream context.

---

## 5. Open Host Service (OHS)

Upstream publishes a formal, stable API (protocol) for multiple downstreams to use.

- **Use when**: One upstream serves many consumers
- **Usually paired with**: Published Language

---

## 6. Published Language

A shared, well-documented language/schema (JSON schema, Protobuf, OpenAPI) used for integration.

- **Use when**: OHS needs a stable, versioned contract
- **Pair with**: OHS on the upstream side

```
graph LR
  ProductCatalog -->|OHS / Published Language| SearchContext
  ProductCatalog -->|OHS / Published Language| RecommendationContext
```

---

## 7. Separate Ways

Two contexts have no integration whatsoever — teams solve the problem independently.

- **Use when**: Integration cost exceeds the benefit of sharing
- **Warning sign**: Often a last resort or deliberate domain split

---

## 8. Big Ball of Mud

Legacy reality — poorly defined boundaries, no clear ownership.

- **Document it honestly** on the context map when it exists
- Don't pretend it's something it isn't
- Plan the extraction strategy

---

## 9. Partnership

Two contexts succeed or fail together — tight coordination required.

- **Use when**: Two teams are co-developing interdependent features
- **Cost**: High coordination overhead; should be temporary
- **Goal**: Eventually move to Customer/Supplier or ACL

---

## Reading a Context Map

A complete context map for a large system should show:

- All bounded contexts (named boxes)
- All integration points (arrows with labeled relationship type)
- Direction of influence (upstream → downstream)
- Where ACLs exist (translation boundaries)
- Where events flow vs. synchronous calls

### Example: E-Commerce Platform (simplified)

```
graph TD
  Identity[Identity & Access]
  Catalog[Product Catalog\nOHS/PL]
  Order[Order Management]
  Payment[Payment\nACL wraps Stripe]
  Inventory[Inventory]
  Shipping[Shipping\nConformist → carrier APIs]
  Notification[Notification]

  Identity -->|OHS/PL| Order
  Identity -->|OHS/PL| Payment
  Catalog -->|OHS/PL| Order
  Order -->|Customer/Supplier| Inventory
  Order -->|Customer/Supplier| Payment
  Order -->|events| Notification
  Order -->|Customer/Supplier| Shipping
  Shipping -->|Conformist| Shipping
```
