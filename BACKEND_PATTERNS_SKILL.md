# Backend Design Patterns Skill: problem first, pattern second

> **What this is:** a working guide to ten backend design patterns: Repository, Factory, Singleton, Strategy, Observer, Builder, Adapter, Decorator, CQRS and Circuit Breaker. It is written for **any backend**. §3 maps each pattern to this repo's Medusa v2 extension points and real files.
>
> **The one rule:** start from the **problem** you have, never from the pattern you'd like to use. A pattern that solves no current problem is complexity you pay for every day. ("You don't need to memorize the textbook definition … what matters is understanding the problem behind the pattern.")
>
> **In this repo**, `CLAUDE.md` and `MEDUSA_SKILL.md` win over this file. In Medusa code, use the framework's own mechanism for each pattern (§3). Never hand-roll a parallel one, and never write a Medusa API from memory: confirm it on the evidence ladder (`MEDUSA_SKILL.md` §0).

---

## 1. Symptom → pattern (start here)

Find your symptom, check the "Don't when" column, and only then read the pattern in §2.

| You notice… | Pattern | Don't when… |
|---|---|---|
| One class runs queries **and** validation, business rules and responses; it's hard to test without a database | **Repository** | The framework already gives you a data-access layer (an ORM service or module service): use it, don't wrap it again |
| `new XProvider()` is written in many places; adding a provider means editing many files | **Factory** | There is only one implementation and no real prospect of a second |
| Several copies of something that must be shared (config, logger, cache client, DB pool) | **Singleton** (via DI) | You'd use it as a global variable to avoid passing dependencies. A DI container usually already gives you one instance |
| One method keeps growing `if/else` branches for variants of the same operation (discounts, shipping, tax, auth, payment) | **Strategy** | There are two stable branches that rarely change: an `if` is clearer |
| A service calls five other services after its main action, and every new side effect edits it | **Observer** (events) | The follow-up must succeed **in the same transaction** as the action, and the caller must know right away if it failed. Use a workflow step or a direct call instead |
| A constructor or function takes 10+ parameters, many optional; arguments get mixed up | **Builder** (or one options object) | Few fields: a typed options object is simpler |
| Each external API has its own field names and formats, and those differences leak through your code | **Adapter** | There is a single integration you fully control and its shape already matches yours |
| Caching, logging, metrics, auth and rate limits keep getting edited into a core service | **Decorator** / middleware | One small concern in one place: just write it there |
| Reads and writes have very different load, shape or scaling needs | **CQRS** | A simple CRUD app. Here it adds layers with no benefit |
| A slow or down dependency makes your own app slow or down (threads and connections stuck on timeouts) | **Circuit breaker** | The call is rare, already fast-failing, or has no fallback that's better than an error |

**Patterns combine.** A real checkout uses an adapter (payment provider) chosen by a factory or strategy, behind a circuit breaker, inside a workflow that publishes an event (observer), with middleware (decorator) around the route.

---

## 2. The ten patterns

Each section covers the problem, the shape of the solution, a framework-neutral TypeScript sketch, what goes wrong, and how to test it.

### 2.1 Repository: separate data access from business logic
- **Problem:** one class knows too much about the database and too much about the business, so it's hard to test and to change.
- **Shape:** the service asks the repository "get customer", "save order". The repository owns queries and storage details.
- **Sketch:**
  ```ts
  interface OrderRepository { findById(id: string): Promise<Order | null>; save(o: Order): Promise<void> }
  class OrderService {
    constructor(private orders: OrderRepository) {}
    async markPaid(id: string) {
      const o = await this.orders.findById(id)
      if (!o) throw new NotFound(id)
      o.status = "paid"
      await this.orders.save(o)
    }
  }
  ```
- **Pitfalls:** a "generic repository" that just re-exposes every ORM method, which adds a layer with no isolation; leaking ORM types out of the repository.
- **Test:** give the service an in-memory or mock repository; test the business rules without a database.

### 2.2 Factory: one place decides which implementation to create
- **Problem:** object creation is scattered, so every new implementation means edits everywhere.
- **Shape:** callers ask for "a payment provider"; the factory picks one from configuration or rules.
- **Sketch:**
  ```ts
  function createPaymentProvider(cfg: Config): PaymentProvider {
    switch (cfg.payments.provider) {
      case "stripe": return new StripeProvider(cfg.stripe)
      case "paypal": return new PaypalProvider(cfg.paypal)
      default: throw new Error(`Unknown provider ${cfg.payments.provider}`)
    }
  }
  ```
- **The real point:** keep creation **in one place**. The factory class itself matters less.
- **Pitfalls:** a factory that also holds business logic; reading env deep inside code instead of at the composition root.

### 2.3 Singleton: one shared instance, managed by DI
- **Problem:** several instances of something that must be shared (config, logger, cache, connection pool).
- **Shape:** prefer a **dependency-injection container** that registers it with a single (singleton) lifetime. Avoid a hand-written `getInstance()`.
- **Pitfalls:** used as a global variable, which hides dependencies, leaks state between tests and makes code hard to test. A singleton is also **per process**: with two replicas there are two "singletons". Shared state across replicas belongs in Redis or a database.
- **Ask "why?" first:** is one instance actually needed, or just convenient?

### 2.4 Strategy: one rule per class, chosen at runtime
- **Problem:** `price()` contains every discount rule as `if/else`, and keeps growing.
- **Shape:** `interface DiscountStrategy { applies(ctx): boolean; apply(ctx): Money }`, with `PremiumDiscount`, `StudentDiscount` and `FestivalPricing`. Select by context; a new rule is a new class.
- **Also fits:** authentication methods, payment processing, shipping calculation, tax rules, recommendations.
- **Pitfalls:** strategies that depend on each other's order without saying so; a "strategy" with a single implementation.

### 2.5 Observer: publish an event, let others react
- **Problem:** `placeOrder()` updates inventory, sends email, adds loyalty points, records analytics, alerts the warehouse… and grows with each request.
- **Shape:** the service publishes `order.placed`; independent subscribers react. A new behaviour (e.g. "send a coupon after purchase") is a new subscriber, and the order code is untouched.
- **Delivery guarantees matter** (in-process events, Kafka, RabbitMQ, Azure Service Bus, AWS SNS, Google Pub/Sub):
  - **at-least-once** delivery means subscribers must be **idempotent** (dedupe by an idempotency key, e.g. `order-placed:email:<order id>`);
  - **ordering** isn't guaranteed across subscribers;
  - a failed subscriber must not undo the order. Decide whether it retries, alerts, or both.
- **Don't:** use an event when the caller needs the result now, or when the work must be atomic with the action. That's a workflow step or a transaction.

### 2.6 Builder: build complex objects step by step
- **Problem:** a constructor with 10–15 parameters is easy to misuse (wrong order, unclear meaning).
- **Shape:** `new UserProfile.Builder().name(n).email(e).phone(p).build()`, where `build()` validates required fields. In TypeScript, a **typed options object** plus a validation function (e.g. a zod schema) is usually the idiomatic equivalent.
- **Pitfalls:** a builder for a three-field object; a `build()` that doesn't validate.

### 2.7 Adapter: translate external systems into one interface
- **Problem:** every provider has its own fields (`customerId` vs `id`), casing, formats (JSON vs XML), status codes and errors, and these differences spread through the code.
- **Shape:** your app talks to `interface Provider`; one adapter per external system translates in both directions. When a provider changes its API, only its adapter changes.
- **Put in the adapter:** auth and signing, field mapping, status mapping, error translation into your error types, timeouts.
- **Test:** fake the provider's HTTP calls only, and assert the translation. Keep the real signing and hashing tested against the provider's published samples.

### 2.8 Decorator: add behaviour by wrapping
- **Problem:** caching, logging, metrics, authorization, auditing and rate limiting keep being edited into the core service.
- **Shape:** wrap it: `Authz(Metrics(Logging(Caching(ProductService))))`. Each layer does one thing; combine as needed. **HTTP middleware is the same idea**, applied around request handling.
- **Pitfalls:** order matters (auth before cache, so private data isn't cached for everyone); a decorator that silently swallows errors.

### 2.9 CQRS: separate reads from writes
- **Problem:** reads and writes have very different needs. Example: millions of profile reads a day, few updates.
- **Shape:** **commands** change data (validation, invariants, transactions); **queries** only read and can be optimised separately (denormalised views, indexes, caches, even a different store).
- **Cost:** two models, and possibly eventual consistency between them.
- **Not for every app.** For CRUD it's needless complexity. Start with the light form: separate read paths from write paths in the code, over the same database.

### 2.10 Circuit breaker: fail fast when a dependency is down
- **Problem:** a third-party gateway goes down. Requests pile up waiting for timeouts and hold connections and threads, until **your** app fails too.
- **Shape:** three states.
  - **Closed:** calls pass through normally; failures are counted.
  - **Open:** after N failures in a window, calls fail **immediately** with a fallback.
  - **Half-open:** after a cool-down, a few trial calls go through. If they succeed, the breaker closes; if not, it opens again.
- **Sketch** (in-process; libraries: Resilience4j, Polly, opossum; meshes: Istio):
  ```ts
  class CircuitBreaker {
    private failures = 0; private openedAt = 0
    constructor(private threshold = 5, private coolDownMs = 30_000) {}
    async call<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
      const open = this.failures >= this.threshold
      if (open && Date.now() - this.openedAt < this.coolDownMs) return fallback()  // open
      try {
        const r = await fn()                                                       // closed or half-open trial
        this.failures = 0
        return r
      } catch (e) {
        if (++this.failures >= this.threshold) this.openedAt = Date.now()
        throw e
      }
    }
  }
  ```
- **Always combine** with a **timeout** on every call (`AbortSignal.timeout(ms)`) and, for safe operations only, a bounded **retry with backoff**. Never retry a non-idempotent payment call without an idempotency key.
- **Pitfalls:** an in-process breaker is per replica (fine for small deployments); a fallback that pretends success (e.g. marks an unpaid order as paid); one breaker shared by unrelated endpoints.

---

## 3. In this repo (Medusa v2): use the framework's mechanism

Medusa already implements most of these patterns. **Use its extension point**, cite `MEDUSA_SKILL.md`, and never build a parallel layer (plan §3.1 "official extension points only").

| Pattern | Medusa mechanism | Where it lives here | Don't |
|---|---|---|---|
| Repository | Module services generated from data models (`MedusaService`); other modules' data through **Query** | `pos/backend/src/modules/pos`, `ecommerce/backend/src/modules/wishlist`; MEDUSA_SKILL §3, §5 | wrap module services in hand-made repositories; query another module's tables directly |
| Singleton | The **Medusa container**: services resolved with `container.resolve(...)` share one lifetime | everywhere a step or route resolves a service | `new` a module service; keep module-level mutable state (per process, lost on restart, not shared across server and worker) |
| Factory + Strategy | **Module providers**, chosen in `medusa-config.ts` from env | payment `pp_payway_payway` / `pp_system_default`, notification Resend / Telegram / local, in `ecommerce/backend/medusa-config.ts`; MEDUSA_SKILL §2, §15 | `if (provider === …)` branches inside routes or workflows |
| Adapter | A provider class over an external API | `ecommerce/backend/src/modules/payway` (`client.ts` = HTTP + signing, `service.ts` = Medusa's `AbstractPaymentProvider`), `modules/resend`, `modules/telegram` | call a third-party API directly from a route |
| Observer | **Events + subscribers**; idempotency keys on notifications | `src/subscribers/order-placed.ts` → `workflows/notify-order-placed.ts` (keys `order-placed:email\|telegram:<order id>`), `subscribers/storefront-revalidate.ts`; MEDUSA_SKILL §8 | put follow-ups that must be atomic in a subscriber; those belong in the workflow |
| Builder | **Workflows** composed from steps (`createWorkflow`, `createStep`, `transform`, `when`), with compensation for rollback | `pos/backend/src/workflows/pos-checkout.ts`, `pos-in-store.ts`; MEDUSA_SKILL §6 | business logic in route handlers; async functions as workflow constructors (`guard.sh` checks this) |
| Decorator | **Middlewares** (`src/api/middlewares.ts`); validators with zod from `@medusajs/framework/zod` | `ecommerce/backend/src/api/middlewares.ts`, `upload-limits.ts`, `pos/backend/src/api/pos-auth.ts`, `pos/backend/src/api/pos/validators.ts`; MEDUSA_SKILL §7 | patch core routes; edit `node_modules` |
| CQRS (light) | Writes through **workflows**, reads through **Query** (`query.graph`, `useQueryGraphStep`) | all `/pos/*` and `/admin/pos/*` routes | add a second database or a read model before a measured need |
| Circuit breaker | **Nothing built in** (not in `MEDUSA_SKILL.md`). Today: timeouts only | PayWay `AbortSignal.timeout(10_000)` (`modules/payway/client.ts`), Telegram `REQUEST_TIMEOUT_MS` (`modules/telegram/service.ts`), storefront revalidate 5 s | add a breaker library without the evidence ladder and an owner decision; a fallback that marks a payment as succeeded |

**Repo-specific notes:**
- A **workflow step** is the place for side effects that must roll back together (e.g. pos-checkout's reservation move and its compensation). A **subscriber** is the place for things that may fail on their own (emails, alerts, cache refresh).
- **Server and worker are separate processes.** Anything singleton-like that must be shared goes to Redis (cache, locking, events) or Postgres. Never keep it in memory.
- **Idempotency** is required for anything an event or a provider callback can trigger twice: payment webhooks, notifications, reservations.

---

## 4. Review checklist (use in PR reviews and the DEV_FLOW §7.1 check)
- [ ] Is there a **real, current problem** behind each new abstraction? Name it in the PR.
- [ ] Does a framework mechanism already cover it (§3)? Then use that instead.
- [ ] **Business logic** is outside routes and controllers (workflows or services); **data access** is outside business logic.
- [ ] **External calls** sit behind an adapter, with a **timeout**, mapped errors and no secrets in logs.
- [ ] **Side effects** after an action are events or subscribers, and they're **idempotent**; atomic ones are workflow steps with compensation.
- [ ] **No new global mutable state**; shared state is in Redis or the database.
- [ ] **Variants** (providers, rules) are strategies or providers, not growing `if/else` chains.
- [ ] **Read paths and write paths** are separated in code; no CQRS infrastructure without measured need.
- [ ] Each pattern has a **test seam**: mock repository, fake provider HTTP, event emitted, breaker opens.

## 5. Anti-patterns to flag
- **Pattern-first design:** "let's add CQRS" with no read/write problem.
- **God service:** one class with queries, rules, formatting and side effects.
- **Singleton as global:** hidden dependencies, tests that leak into each other.
- **Leaky adapter:** provider field names or status codes outside the adapter.
- **Fire-and-forget without idempotency:** duplicate emails or charges on redelivery.
- **Retry storm:** retries without backoff, a cap or a breaker, which multiplies load on a failing dependency.
- **Fake success fallback:** a fallback that hides a real failure from the user or the books.

## 6. Sources
- "10 Backend Design Patterns" (video, 2026; slides and transcript provided by the owner, 2026-10-27): the problems, examples and cautions in §1–§2.
- This repo's code and `MEDUSA_SKILL.md` (verified Medusa 2.21.2 reference) for §3.
- Library names (Resilience4j, Polly, opossum, Istio) are pointers only. Adopting one in this repo goes through the evidence ladder, exact pins and an owner decision.
