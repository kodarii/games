# Event Storming Facilitation Guide

Event Storming is a collaborative workshop technique for rapidly exploring complex domains.
Invented by Alberto Brandolini. Run it when you need to: discover domain events, find
bounded contexts, align teams on shared understanding.

---

## Session Formats

### Big Picture Event Storming

Goal: Explore the entire business domain at high level.
Duration: 4–8 hours
Participants: Domain experts + developers (mixed)
Output: Timeline of domain events, hotspots, context candidates

### Process-Level Event Storming

Goal: Deep-dive a specific process or subdomain.
Duration: 2–4 hours
Output: Aggregates, commands, policies, read models for one area

### Design-Level Event Storming

Goal: Design a specific feature in detail.
Duration: 1–3 hours
Output: Aggregate design, event flows, API surface

---

## The Sticky Note Legend

| Color         | Represents        | Example                        |
| ------------- | ----------------- | ------------------------------ |
| 🟠 Orange     | Domain Event      | `OrderPlaced`, `PaymentFailed` |
| 🔵 Blue       | Command           | `PlaceOrder`, `CancelShipment` |
| 🟡 Yellow     | Aggregate         | `Order`, `Shipment`            |
| 🩷 Pink/Lilac | Policy / Reaction | "Whenever X, then Y"           |
| 🟣 Purple     | Read Model / View | `OrderSummaryView`             |
| 🔴 Red        | Hotspot / Problem | Disagreement, unknown, risk    |
| 🟢 Green      | External System   | Payment Gateway, CRM           |
| 👤 Beige      | Actor / User      | Customer, Warehouse Staff      |

---

## Step-by-Step Facilitation

### Phase 1: Chaotic Exploration (Orange only)

1. Give everyone orange stickies + markers
2. Rule: write Domain Events only — things that happened, past tense, business language
3. Everyone places events simultaneously on a long timeline
4. No structure yet — duplicates welcome
5. Aim: 50–200 events in 30–45 min

**Good event naming:**

- ✅ `InvoiceGenerated`, `ShipmentDelayed`, `CustomerVerified`
- ❌ `UpdateDatabase`, `HandleRequest`, `ProcessData`

### Phase 2: Enforce the Timeline

1. Facilitator + team arrange events left-to-right chronologically
2. Find duplicates — keep the better-named one, discard others
3. Identify **pivotal events** — major moments the business cares about
4. Note **temporal markers**: "end of month", "after approval"

### Phase 3: Add Commands (Blue)

For each domain event, ask: "What caused this to happen?"

- Place a blue Command sticky before the orange Event
- Commands are user intentions: `PlaceOrder` → `OrderPlaced`
- One command doesn't always map 1:1 to one event (commands can fail)

### Phase 4: Add Actors and External Systems

- Who/what triggers the command? (Actor in beige, System in green)
- Systems that react to events? (also green)

### Phase 5: Add Aggregates (Yellow)

- Group command+event pairs around the aggregate that handles them
- The aggregate name should be a domain noun
- Ask: "What is the thing that enforces the rules here?"

### Phase 6: Identify Policies (Pink)

- "Whenever [Event], then [Command]" = a Policy
- Often automated business rules
- Example: "Whenever `PaymentConfirmed`, then `ReserveInventory`"
- Policies are cross-cutting — often cross-context

### Phase 7: Add Read Models (Purple)

- What information does an actor need to make the decision to issue a command?
- These become your query models / projections

### Phase 8: Hotspot Review (Red)

- Walk through red hotspots with domain experts
- Resolve disagreements or capture open questions
- Hotspots often reveal: missing events, process gaps, naming conflicts

---

## Identifying Bounded Contexts from Event Storming

After the session, look for:

1. **Naming conflicts** — same word meaning different things in different parts of the timeline
   → probably a context boundary

2. **Natural groupings** — clusters of events around a common aggregate or team
   → candidate bounded context

3. **External system integrations** — usually at context boundaries

4. **Policy reactions** — policies between clusters often indicate integration points

5. **Different paces of change** — fast-changing vs. stable clusters often separate contexts

---

## Common Facilitation Problems

| Problem                                               | Solution                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Developers write technical events (`DatabaseUpdated`) | Redirect: "What does the business care about?"              |
| Domain experts go silent                              | Ask: "What would make you call your boss at midnight?"      |
| Scope creep                                           | Time-box each phase strictly                                |
| One person dominates                                  | Sticky notes are silent, parallel — reinforce this          |
| Events are too fine-grained                           | Ask: "Does the business track this separately?"             |
| No hotspots found                                     | Hotspots are being suppressed — create psychological safety |

---

## Translating Event Storming Output to DDD Model

After the workshop:

1. **Aggregates** → map to DDD Aggregates (refine with invariant analysis)
2. **Event clusters** → candidate Bounded Contexts
3. **Policies crossing clusters** → integration events between contexts
4. **Read Models** → CQRS projections / query models
5. **External Systems** → ACL candidates
6. **Hotspots** → backlog items for domain expert interviews
