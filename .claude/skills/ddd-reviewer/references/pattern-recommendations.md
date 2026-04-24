# Pattern Recommendations — Kiedy Co Stosować

Ten plik zawiera mapowanie: **problem w kodzie → wzorzec który go rozwiązuje → realne korzyści**.
Używaj go podczas review gdy znajdziesz błąd i chcesz zaproponować konkretne rozwiązanie.

---

## 1. Anemic Domain Model → Rich Domain Model + Value Objects

**Symptom w kodzie:**

```java
// Serwis wie wszystko, encja nic nie robi
public class OrderService {
    public void applyDiscount(Order order, BigDecimal percent) {
        BigDecimal discount = order.getTotal().multiply(percent).divide(BigDecimal.valueOf(100));
        order.setTotal(order.getTotal().subtract(discount));
        order.setDiscountApplied(true);
    }
}
public class Order {
    private BigDecimal total;
    private boolean discountApplied;
    // same getters/setters
}
```

**Wzorzec: Rich Domain Model**

```java
public class Order {
    private Money total;
    private boolean discountApplied;

    public void applyDiscount(Percentage discount) {
        if (this.discountApplied) throw new DomainException("Discount already applied");
        if (discount.isAbove(Percentage.of(50))) throw new DomainException("Max discount is 50%");
        this.total = this.total.subtract(discount.of(this.total));
        this.discountApplied = true;
        registerEvent(new DiscountApplied(this.id, discount));
    }
}
```

**Realne korzyści:**

- Reguły biznesowe żyją przy danych, którymi zarządzają → nie mogą się rozjechać
- Invarianty są zawsze egzekwowane — nie da się zapomnieć o wywołaniu walidacji
- Testowanie aggregate = testowanie reguł biznesowych, bez mocków serwisów
- Domain expert czyta kod i go rozumie — metody mówią językiem biznesu

---

## 2. Prymitywy zamiast konceptów domenowych → Value Objects

**Symptom w kodzie:**

```java
public class Customer {
    private String email;        // String? Co za String?
    private String phoneNumber;  // Jaki format?
    private BigDecimal balance;  // W jakiej walucie?
    private String status;       // Jakie wartości są legalne?
}
```

**Wzorzec: Value Objects z walidacją i semantyką**

```java
public class Customer {
    private Email email;          // walidacja w konstruktorze, immutable
    private PhoneNumber phone;    // normalizacja formatu
    private Money balance;        // waluta + kwota nierozłączne
    private CustomerStatus status; // enum z dozwolonymi przejściami
}

public record Email(String value) {
    public Email {
        if (!value.matches("^[\\w-.]+@[\\w-]+\\.[a-z]{2,}$"))
            throw new InvalidEmailException(value);
        value = value.toLowerCase();
    }
}
```

**Realne korzyści:**

- Impossible states są niemożliwe do reprezentowania w systemie typów
- Walidacja raz, wszędzie — nie możesz skonstruować nieprawidłowego obiektu
- Czytelność: `Money balance` mówi więcej niż `BigDecimal balance`
- Refaktoring jest bezpieczniejszy — kompilator łapie niezgodności typów
- Porównania przez wartość, nie referencję — `email1.equals(email2)` działa intuicyjnie

---

## 3. Logika w Application Service → Domain Service / Policy Object

**Symptom w kodzie:**

```java
public class LoanApplicationService {
    public boolean approveLoan(LoanApplication application) {
        // 40 linii if-else z regułami biznesowymi
        if (application.getCreditScore() < 600) return false;
        if (application.getDebtToIncomeRatio() > 0.43) return false;
        if (application.getEmploymentMonths() < 24 && application.getCreditScore() < 720) return false;
        // ...
    }
}
```

**Wzorzec: Specification Pattern + Policy Object**

```java
// Każda reguła to oddzielny, nazwany obiekt
public class MinimumCreditScoreSpecification implements LoanSpecification {
    private final int minimumScore;
    public boolean isSatisfiedBy(LoanApplication app) {
        return app.creditScore().isAtLeast(minimumScore);
    }
    public String violationReason() { return "Credit score below minimum " + minimumScore; }
}

public class LoanApprovalPolicy {
    private final List<LoanSpecification> requirements;

    public ApprovalResult evaluate(LoanApplication application) {
        var violations = requirements.stream()
            .filter(spec -> !spec.isSatisfiedBy(application))
            .map(LoanSpecification::violationReason)
            .toList();
        return violations.isEmpty()
            ? ApprovalResult.approved()
            : ApprovalResult.rejected(violations);
    }
}

// Application service staje się trywialny
public class LoanApplicationService {
    public ApprovalResult approveLoan(LoanApplicationId id) {
        var application = repository.findById(id);
        var result = approvalPolicy.evaluate(application);
        application.recordDecision(result);
        repository.save(application);
        return result;
    }
}
```

**Realne korzyści:**

- Każda reguła ma nazwę — domain expert może wskazać konkretną regułę i ją zmienić
- Dodanie/usunięcie reguły = dodanie/usunięcie jednej klasy, nie modyfikacja if-chaina
- Każda reguła testowana osobno — unit testy są mikroskopijne i szybkie
- Można dynamicznie konfigurować zestaw reguł (np. różne polityki dla różnych rynków)
- `ApprovalResult.rejected(violations)` zwraca WSZYSTKIE powody odrzucenia naraz, nie tylko pierwszy

---

## 4. Cross-aggregate transaction → Domain Events + Eventual Consistency

**Symptom w kodzie:**

```java
@Transactional
public void placeOrder(PlaceOrderCommand cmd) {
    Order order = orderRepository.save(new Order(...));
    inventory.reserve(cmd.getItems());          // drugi aggregate w tej samej transakcji!
    loyalty.addPoints(cmd.getCustomerId(), ...); // trzeci aggregate!
    emailService.sendConfirmation(...);          // side effect w transakcji!
}
```

**Wzorzec: Domain Events + Aggregate per Transaction**

```java
// Aggregate emituje event po zmianie stanu
public class Order {
    public static Order place(CustomerId customerId, List<OrderItem> items) {
        var order = new Order(customerId, items);
        order.registerEvent(new OrderPlaced(order.id, customerId, items, order.total));
        return order;
    }
}

// Application service: jeden aggregate, jeden save
@Transactional
public void placeOrder(PlaceOrderCommand cmd) {
    var order = Order.place(cmd.customerId(), cmd.items());
    orderRepository.save(order);
    eventPublisher.publishAll(order.popEvents()); // via Outbox!
}

// Inne contexty reagują asynchronicznie
@EventHandler
public void on(OrderPlaced event) { inventory.reserve(event.items()); }

@EventHandler
public void on(OrderPlaced event) { loyalty.addPoints(event.customerId(), event.total()); }
```

**Realne korzyści:**

- Każdy aggregate zmienia się w osobnej transakcji → brak distributed lock, brak deadlocków
- Failure jest izolowany — jeśli inventory.reserve() zawiedzie, order już istnieje i można retry
- Łatwe dodawanie nowych reakcji na event bez modyfikacji istniejącego kodu (Open/Closed)
- Konteksty są naprawdę odizolowane — inventory nie wie o istnieniu loyalty i odwrotnie
- System jest audytowalny — każde zdarzenie domenowe jest zapisane z timestampem

---

## 5. Brak ACL / cross-context import → Anti-Corruption Layer

**Symptom w kodzie:**

```java
// W module Shipping bezpośrednio używamy modelu z Orders
import com.company.orders.domain.Order;
import com.company.orders.domain.Address;

public class ShippingService {
    public Shipment createShipment(Order order) {
        return new Shipment(
            order.getDeliveryAddress(),  // Address z Orders
            order.getCustomer().getName()
        );
    }
}
```

**Wzorzec: Anti-Corruption Layer**

```java
// Shipping ma własny model konceptów które go dotyczą
public record ShipmentRequest(
    RecipientName recipient,
    ShippingAddress destination,
    List<PackageItem> items,
    ShippingPriority priority
) {}

// ACL tłumaczy — żyje w warstwie infrastruktury Shipping context
public class OrderToShipmentTranslator {
    public ShipmentRequest translate(OrderShippingData data) {
        return new ShipmentRequest(
            RecipientName.of(data.customerName()),
            ShippingAddress.from(data.deliveryAddress()),
            data.items().stream().map(this::toPackageItem).toList(),
            ShippingPriority.STANDARD
        );
    }
}

// ShippingService operuje wyłącznie na własnym modelu
public class ShippingService {
    public Shipment createShipment(ShipmentRequest request) { ... }
}
```

**Realne korzyści:**

- Zmiana modelu Orders nie propaguje się automatycznie do Shipping — tylko ACL wymaga aktualizacji
- Shipping może ewoluować własną koncepcję adresu niezależnie (np. dodać "pier code" dla portów)
- Testy Shipping nie wymagają instancji Orders — tylko `ShipmentRequest`
- Jeśli Orders zostanie zastąpiony innym systemem, zmieniasz tylko ACL

---

## 6. Bezpośrednie wywołanie infrastruktury → Ports & Adapters

**Symptom w kodzie:**

```java
public class NotificationDomainService {
    private final SendGridClient sendGrid = new SendGridClient(API_KEY); // infra w domenie!

    public void notifyCustomer(Customer customer, String message) {
        sendGrid.send(new SendGridEmail(customer.getEmail().getValue(), message));
    }
}
```

**Wzorzec: Port (interfejs w domenie) + Adapter (implementacja w infrastrukturze)**

```java
// Port — interfejs w warstwie domenowej/aplikacyjnej
public interface CustomerNotificationPort {
    void notify(CustomerId customerId, NotificationMessage message);
}

// Adapter — implementacja w infrastrukturze
public class SendGridNotificationAdapter implements CustomerNotificationPort {
    private final SendGridClient sendGrid;

    @Override
    public void notify(CustomerId customerId, NotificationMessage message) {
        var customer = customerRepository.findById(customerId);
        sendGrid.send(new SendGridEmail(customer.email().value(), message.content()));
    }
}

// Domain service zależy od portu, nie od SendGrid
public class NotificationDomainService {
    private final CustomerNotificationPort notifications;

    public void notifyCustomer(CustomerId id, String message) {
        notifications.notify(id, NotificationMessage.of(message));
    }
}
```

**Realne korzyści:**

- Unit test domeny używa fake/stub implementacji portu — SendGrid nie jest potrzebny
- Zmiana dostawcy emaili (SendGrid → Postmark) = nowy adapter, zero zmian w domenie
- W testach integracyjnych możesz użyć InMemoryNotificationAdapter i sprawdzić co zostało wysłane
- Domena nie ma zależności od żadnej biblioteki zewnętrznej → migrowalna, czysta

---

## 7. Dual Write → Transactional Outbox Pattern

**Symptom w kodzie:**

```java
@Transactional
public void confirmOrder(OrderId id) {
    Order order = repository.findById(id);
    order.confirm();
    repository.save(order);              // zapis do DB
    eventBus.publish(new OrderConfirmed(id)); // publish do brokera — co jeśli to zawiedzie?
}
```

**Wzorzec: Transactional Outbox**

```java
// W tej samej transakcji co zmiana stanu — zapisz event do outbox table
@Transactional
public void confirmOrder(OrderId id) {
    Order order = repository.findById(id);
    order.confirm();
    repository.save(order);
    outboxRepository.store(OutboxMessage.from(order.popEvents())); // ta sama transakcja DB!
}

// Osobny proces (scheduler/CDC) odczytuje outbox i publikuje do brokera
@Scheduled(fixedDelay = 1000)
public void publishPendingEvents() {
    outboxRepository.findUnpublished().forEach(msg -> {
        eventBus.publish(msg.payload());
        outboxRepository.markPublished(msg.id());
    });
}
```

**Realne korzyści:**

- Gwarancja at-least-once: event zawsze dotrze do brokera, nawet po crashu aplikacji
- Brak okna failure między zapisem do DB a publishem do brokera
- Outbox jest naturalnym audit logiem eventów domenowych
- Można użyć CDC (Debezium) zamiast schedulera dla jeszcze wyższej niezawodności

---

## 8. Fat Repository / Query Sprawl → CQRS + Read Models

**Symptom w kodzie:**

```java
public interface OrderRepository {
    Order findById(OrderId id);
    List<Order> findByCustomerId(CustomerId id);
    List<Order> findByStatusAndDateRange(OrderStatus status, LocalDate from, LocalDate to);
    List<Order> findPendingOlderThan(Duration duration);
    OrderSummary getSummaryForCustomer(CustomerId id);  // projekcja?!
    Map<OrderStatus, Long> countByStatus();             // raportowanie?!
    List<Order> findForDashboard(DashboardFilter filter); // co to w ogóle jest?
}
```

**Wzorzec: CQRS — oddziel write model od read modeli**

```java
// Write side: repozytorium aggregate'u — tylko to co potrzebne do zapisu
public interface OrderRepository {
    Order findById(OrderId id);         // do komend
    void save(Order order);
}

// Read side: dedykowane query handlery / read model repositories
public interface OrderQueryService {
    CustomerOrderHistoryView getOrderHistory(CustomerId id, Pagination page);
    OrderDashboardView getDashboard(DashboardFilter filter);
    OrderStatusReport getStatusReport(DateRange range);
}

// Read models są zdenormalizowane pod konkretny widok UI
public record CustomerOrderHistoryView(
    List<OrderSummaryItem> orders,
    Money totalSpent,
    int orderCount
) {}
```

**Realne korzyści:**

- Write model jest mały, skupiony — aggregate nie musi ładować danych których nie potrzebuje
- Read models są zoptymalizowane pod konkretny query — mogą mieć własne indeksy, projekcje, cache
- Możliwość oddzielnych baz danych: write do PostgreSQL, read z Elasticsearch lub widoków
- Repository aggregate'u nie rośnie w nieskończoność — każdy nowy widok = nowy query service
- Read modele nie muszą być spójne natychmiast — eventual consistency dla dashboardów jest akceptowalna

---

## 9. Saga / Process Manager — dla długich procesów cross-context

**Kiedy stosować:** Masz proces który wymaga skoordynowania kilku bounded contextów i każdy krok może zawieść.

**Symptom braku Sagi:**

```java
// Application service staje się orchestratorem który zna wszystkie contexty
public void processOrder(OrderId id) {
    inventory.reserve(id);    // co jeśli to się powiedzie...
    payment.charge(id);       // ...a to zawiedzie?
    shipping.schedule(id);    // jak cofnąć inventory.reserve()?
}
```

**Wzorzec: Saga z kompensacjami**

```java
public class OrderFulfillmentSaga {
    // Stan Sagi — persystowany między krokami
    private SagaState state;

    // Każdy krok ma kompensację
    @SagaEventHandler
    public void on(OrderPlaced event) {
        state = RESERVING_INVENTORY;
        commandGateway.send(new ReserveInventory(event.orderId(), event.items()));
    }

    @SagaEventHandler
    public void on(InventoryReserved event) {
        state = CHARGING_PAYMENT;
        commandGateway.send(new ChargePayment(event.orderId(), event.amount()));
    }

    @SagaEventHandler
    public void on(PaymentFailed event) {
        // Kompensacja: cofnij rezerwację inventory
        commandGateway.send(new ReleaseInventoryReservation(event.orderId()));
        commandGateway.send(new CancelOrder(event.orderId(), "Payment failed"));
    }
}
```

**Realne korzyści:**

- Każdy krok jest idempotentny — retry jest bezpieczny
- Kompensacje są explicite zdefiniowane — wiadomo co się dzieje przy failure
- Stan Sagi jest persystowany — restart aplikacji nie psuje w-toku procesów
- Bounded contexty są izolowane — Saga komunikuje się przez eventy, nie bezpośrednie wywołania

---

## 10. Shared Kernel vs Oddzielny Koncept — kiedy duplikować

**Dylemat:** Dwa konteksty używają "Address". Czy współdzielić klasę?

**Reguła:**

- Jeśli Address ma **tę samą semantykę** w obu kontekstach i **te same pola** → Shared Kernel (ostrożnie!)
- Jeśli Address ma **różne znaczenie** (DeliveryAddress vs BillingAddress) → **duplikuj jako oddzielne Value Objects**

```
Shared Kernel:      OrderContext ←→ ShippingContext (ten sam adres dostawy)
Oddzielne VO:       BillingAddress (ma NIP, kraj VAT) vs DeliveryAddress (ma piętro, kod dostawy)
```

**Kiedy Shared Kernel jest OK:**

- Niewielki, stabilny zestaw konceptów (Money, DateRange, CountryCode)
- Oba contexty są własnością **tego samego zespołu**
- Zmiana shared kernel wymaga koordynacji obu contextów — to jest explicite koszt

**Kiedy NIE używać Shared Kernel:**

- Różne zespoły, różne deploymenty
- Koncepty mają różną semantykę mimo podobnych nazw
- Chcesz by contexty ewoluowały niezależnie

---

## Mapa: Problem → Wzorzec

| Problem w kodzie                                    | Wzorzec                              | Sekcja |
| --------------------------------------------------- | ------------------------------------ | ------ |
| Logika biznesowa w serwisach, encje to worki danych | Rich Domain Model                    | §1     |
| `String email`, `BigDecimal price` bez semantyki    | Value Objects                        | §2     |
| If-chain reguł biznesowych w serwisie               | Specification + Policy Object        | §3     |
| Wiele agregatów w jednej transakcji                 | Domain Events + Eventual Consistency | §4     |
| Import modelu z innego bounded context              | Anti-Corruption Layer                | §5     |
| `new SendGridClient()` wewnątrz domeny              | Ports & Adapters                     | §6     |
| `save()` + `publish()` w sekwencji bez gwarancji    | Transactional Outbox                 | §7     |
| Repository z 15 metodami find\*()                   | CQRS + Read Models                   | §8     |
| Serwis koordynujący 4 inne contexty                 | Saga / Process Manager               | §9     |
| Dwa contexty współdzielą tę samą klasę              | Shared Kernel lub duplikacja VO      | §10    |
