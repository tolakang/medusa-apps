# Side-by-Side Comparison — Commerce Scenarios on Medusa

> Planning document. Medusa baseline: **v2.21.1** (checked 2026-09-24).
> Each scenario maps to one category folder = one business project, holding its backend, storefront and (where needed) portal or app, each with its own Dockerfile and env.

| # | Scenario | Folder | Deployables |
|---|---|---|---|
| 1 | Marketplace (vendors sell their own products) | `marketplace/` | backend, storefront, vendor-portal |
| 2A | Wholesale (sellers buy from you in bulk) | `wholesale/` | backend, storefront (B2B) |
| 2B | Reseller network (sellers sell your products, you ship) | `reseller/` | backend, storefront (multi-tenant), seller-portal |
| 3 | Booking services (appointments, classes, tickets, rentals) | `booking-services/` | backend, storefront |
| 4 | Ecommerce (direct to consumer) | `ecommerce/` | backend, storefront |
| 5 | POS (physical shop checkout) | `pos/` | backend, storefront, pos-app |

---

## 1. Full comparison

| | 1. Marketplace | 2A. Wholesale | 2B. Reseller | 3. Booking services | 4. Ecommerce (D2C) | 5. POS |
|---|---|---|---|---|---|---|
| **What's sold** | Vendors' goods | Your goods, in bulk | Your goods, via sellers | Time / capacity (appointments, classes, tickets, rentals) | Your goods | Your goods, in person |
| **Your customer** | Consumer + vendors | Business sellers | Consumer (sellers are partners) | Consumer / client | Consumer | Walk-in customer |
| **Catalog owner** | Each vendor | You | You | You (services, staff, venues) | You | You (shared with online) |
| **"Stock" means** | Vendor's inventory | Your inventory | Your inventory | Available slots / seats | Your inventory | Shop's inventory |
| **Fulfillment** | Vendor ships | You ship in bulk | You ship to end customer (dropship) | Service delivered at a time and place | You ship | Customer takes it away |
| **Money flow** | Consumer → you → vendor (minus commission) | Seller → you (often on credit) | Consumer → you → seller commission | Deposit or full payment upfront, refund on cancel | Consumer → you | Cash / card / QR at the counter |
| **Your revenue** | Commission / fees | Product margin | Margin minus commission | Service fee | Product margin | Product margin |
| **Key custom object** | Vendor, parent + child orders | Company, Employee, Quote | Seller ↔ Sales channel, Commission | Resource, Schedule, Booking (slot) | none (core only) | Register, Shift |
| **Pricing** | Vendor sets | Tiered price lists, quotes, MOQ | You set (optional seller markup) | Per service / duration / staff / peak | Price lists, promotions | Same as online or shop-specific |
| **Extra UI to build** | Vendor portal | Buyer portal | Seller portal + seller storefronts | Booking calendar + staff schedule | Storefront | POS app (tablet / web) |
| **Official Medusa recipe** | Marketplace | B2B (+ ERP) | Omnichannel + custom | Ticket Booking + custom | Ecommerce | POS |
| **Built-in coverage** | Low | Medium | Medium | Low (no scheduling in core) | High | Medium (backend yes, app no) |
| **Difficulty** | High | Medium | Medium–High | Medium–High | Low | Medium |
| **Biggest risks** | Payouts, vendor quality, split orders, disputes | Credit risk, price-list complexity | Commission accuracy, stock promised across channels | Double-booking, no-shows, time zones | Traffic & marketing (not tech) | Offline mode, hardware, cash reconciliation |

---

## 2. Easy-to-confuse pairs

- **Marketplace vs Reseller** — Marketplace: *many catalogs → one store*. Reseller: *one catalog → many stores*. Marketplace vendors own stock and ship; resellers never touch stock.
- **Wholesale vs Reseller** — Wholesale sellers *buy* your stock and resell it themselves. Resellers only *sell* it; you ship to their customer and pay them commission.
- **Ecommerce vs POS** — same backend features; POS adds a counter app, registers, shifts and cash handling. Stock is per shop (stock location).
- **Booking vs Ecommerce** — booking sells *time*, so availability replaces inventory and a cart item must *hold* a slot until checkout.

---

## 3. Which one fits

| If your business… | Start with |
|---|---|
| Sells its own products online to consumers | 4. Ecommerce |
| Has physical shops too | 4. Ecommerce, then 5. POS |
| Sells time: salon, spa, clinic, classes, tours, events | 3. Booking services |
| Sells in bulk to shops / distributors | 2A. Wholesale |
| Wants many partners selling your products while you ship | 2B. Reseller |
| Is a platform where others list and ship their own goods | 1. Marketplace |

---

## 4. Combining scenarios

Every folder's `backend/` is a **full Medusa backend**: core commerce (catalog, cart, checkout, orders, payments, inventory, admin) **plus** the scenario's custom modules. So:

- **One business = one app = one database.** When a business needs two scenarios, add the second scenario's module to the same app. Do **not** deploy two apps and try to sync them — they would have separate customers, inventory and orders.
- Example: a retail brand with shops deploys the `pos/` project: `pos/backend` already contains everything in `ecommerce/backend`, and `pos/storefront` + `pos/pos-app` both talk to it.

| Business | Combination (inside one app) |
|---|---|
| Retail brand with shops | Ecommerce + POS (+ Multi-Region if several countries) |
| Spa / salon / clinic | Booking + POS (walk-ins) + Ecommerce (retail products, gift cards) |
| Events company | Booking (tickets) + Ecommerce (merch) + Bundled Products |
| Brand with distributors | Ecommerce + Wholesale (+ Reseller) |
| Service marketplace (many salons / tutors) | Marketplace + Booking — hardest combination |

Custom modules are written to be self-contained (own models, own links to core), so moving one into another app is a copy + register + migrate operation.
