# 🗺️ Roadmap

> 6 фаз розробки. ~14-18 тижнів до production-ready MVP.

---

## Overview

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
  Core       Booking     Clients    Analytics   Payments     Polish
 3 weeks     3 weeks     2 weeks    2 weeks     3 weeks     2 weeks
```

**Total estimated: 15-18 тижнів** (1 full-stack developer)

---

## Phase 1: Core Infrastructure (3 weeks)

> Фундамент: auth, multi-tenancy, bot connection, base API.

### Week 1: Project Setup + Auth

| Task | Опис | Priority |
|---|---|---|
| Project scaffolding | NestJS + Prisma + PostgreSQL + Redis + Docker Compose | P0 |
| Database schema | Prisma schema, initial migration, btree_gist extension | P0 |
| Tenant isolation | Prisma Client Extension + AsyncLocalStorage (@nestjs/cls) | P0 |
| Auth module | Telegram initData → HMAC-SHA256 → JWT (access + refresh) | P0 |
| User/Master/Client models | Auto-create on first auth, role resolution | P0 |

### Week 2: Bot Infrastructure

| Task | Опис | Priority |
|---|---|---|
| Bot module | Token encryption (AES-256-GCM), CRUD operations | P0 |
| Webhook routing | POST /webhook/{botId}, secret token verification | P0 |
| Bot auto-setup | setWebhook, setChatMenuButton, setMyCommands | P0 |
| Platform bot | /start command, Mini App menu button | P0 |
| Bot commands | /start, /book, /my_bookings, /help handlers | P1 |

### Week 3: Master Onboarding

| Task | Опис | Priority |
|---|---|---|
| Onboarding wizard API | validate-token, bot connect, status | P0 |
| Services CRUD | Create/Read/Update/Delete + soft-delete | P0 |
| Working hours | Weekly schedule + slot_duration | P0 |
| Schedule overrides | Day-off, custom hours for specific dates | P1 |
| Tenant settings | Branding (JSONB), general settings | P1 |

**Milestone: Master can register, connect bot, add services, set schedule.**

---

## Phase 2: Booking System (3 weeks)

> Ключовий функціонал: слоти, бронювання, календар.

### Week 4: Slot Engine

| Task | Опис | Priority |
|---|---|---|
| Slot generation algorithm | Available slots based on schedule + existing bookings | P0 |
| Exclusion constraint | PostgreSQL EXCLUDE USING gist for double-booking | P0 |
| Buffer time | Configurable break between bookings | P1 |
| GET /bookings/slots | API endpoint with date range support | P0 |

### Week 5: Booking CRUD

| Task | Опис | Priority |
|---|---|---|
| Create booking | POST /bookings (client + master flows) | P0 |
| Snapshot data | service_name_snapshot, price_at_booking, duration_at_booking | P0 |
| Cancel booking | PATCH /bookings/:id/cancel (with 3h policy) | P0 |
| Complete / No-show | PATCH /bookings/:id/complete, no-show | P1 |
| Booking list | GET /bookings (filtered by date, status, client) | P0 |

### Week 6: Calendar + Mini App Booking Flow

| Task | Опис | Priority |
|---|---|---|
| Client booking flow | Service selection → date → slot → confirm | P0 |
| Master calendar view | Day/week view with booking cards | P0 |
| Booking details | View, cancel, complete actions | P0 |
| My bookings (client) | Upcoming + history list | P1 |

**Milestone: Clients can book via Mini App. Master sees calendar.**

---

## Phase 3: Client Management (2 weeks)

> CRM для майстра: клієнти, нотатки, історія.

### Week 7: Clients CRM

| Task | Опис | Priority |
|---|---|---|
| Client list | GET /clients with search, sort, pagination | P0 |
| Client profile | Visit count, total spent, last visit, notes | P0 |
| Client history | All bookings for specific client | P0 |
| Client notes | Master's private notes per client | P1 |
| Client onboarding | Auto-create on first bot /start | P0 |

### Week 8: Mini App UX Polish

| Task | Опис | Priority |
|---|---|---|
| Branding system | CSS custom properties from tenant branding | P1 |
| i18n setup | react-intl, uk/en, lazy loading | P1 |
| Empty states | Illustrations for no services, no bookings, etc. | P2 |
| Error handling | Global error boundary, offline state | P1 |
| Loading states | Skeletons, optimistic updates | P2 |

**Milestone: Master has full CRM. Branded Mini App with i18n.**

---

## Phase 4: Analytics & Finance (2 weeks)

> Дашборд, транзакції, звіти.

### Week 9: Analytics

| Task | Опис | Priority |
|---|---|---|
| Analytics module | BullMQ daily aggregation job | P1 |
| Dashboard API | GET /analytics/dashboard (bookings, revenue, clients) | P1 |
| Dashboard UI | Cards: today's bookings, month revenue, new clients | P1 |
| Daily stats | analytics_daily table population | P1 |

### Week 10: Finance

| Task | Опис | Priority |
|---|---|---|
| Transactions | Manual income/expense records | P1 |
| Finance summary | Total income, expenses, net by period | P1 |
| Finance UI | Transaction list + summary cards | P1 |
| Export (future) | Placeholder for CSV export | P3 |

**Milestone: Master sees analytics dashboard and financial overview.**

---

## Phase 5: Payments & Subscriptions (3 weeks)

> Монетизація: підписки, платіжна інтеграція.

### Week 11: Subscription Engine

| Task | Опис | Priority |
|---|---|---|
| Subscription module | State machine (trial → active → past_due → expired) | P0 |
| Trial flow | 7-day trial, anti-abuse check | P0 |
| BullMQ billing jobs | check-trial, charge, retry, expire | P0 |
| Exchange rate service | Monobank public API, Redis cache | P0 |
| Read-only mode | @RequiresActiveSubscription guard | P0 |

### Week 12: Payment Providers

| Task | Опис | Priority |
|---|---|---|
| PaymentProvider interface | Strategy Pattern abstraction | P0 |
| Monobank provider | Create invoice, verify webhook, charge token | P0 |
| LiqPay provider | Create checkout, verify webhook, charge token | P0 |
| Card tokenization | Save card for recurring charges | P0 |
| Subscription UI | Status, plan, payment history, checkout, cancel | P0 |

### Week 13: Client Payments (Optional)

| Task | Опис | Priority |
|---|---|---|
| Payment settings | Master connects own Mono/LiqPay | P1 |
| Client payment flow | "Pay Online" button → hosted page → webhook | P1 |
| Payment status | booking.payment_status tracking | P1 |
| Subscription reminders | Trial reminders (day 5, 6), payment failures | P0 |

**Milestone: Platform monetized. Masters pay $10/month. Optional client payments.**

---

## Phase 6: Notifications & Polish (2 weeks)

> Сповіщення, тестування, hardening.

### Week 14: Notifications

| Task | Опис | Priority |
|---|---|---|
| Notification module | BullMQ delayed jobs for all notification types | P0 |
| Booking notifications | Confirmation, reminder (24h, 1h), cancellation | P0 |
| Subscription notifications | Trial reminders, payment status, expiration | P0 |
| Job cancellation | Remove BullMQ jobs when booking cancelled | P0 |
| Templates | uk/en templates for all notification types | P0 |

### Week 15: Testing & Hardening

| Task | Опис | Priority |
|---|---|---|
| Cross-tenant tests | Integration tests for tenant isolation | P0 |
| Auth tests | initData validation, JWT flow, role resolution | P0 |
| Booking tests | Double-booking prevention, slot generation, edge cases | P0 |
| Payment tests | Webhook verification, state machine transitions | P0 |
| Security audit | Rate limiting, encryption, input validation review | P0 |
| Load testing | k6 scripts for API, webhook endpoints | P2 |

**Milestone: Production-ready MVP. All notifications working. Tests passing.**

---

## Post-MVP Roadmap

| Feature | Priority | Estimated |
|---|---|---|
| Admin panel (React + Ant Design) | P1 | 2 weeks |
| Monitoring (Prometheus + Grafana) | P1 | 1 week |
| Client reviews/ratings | P2 | 1 week |
| Photo gallery per master | P2 | 1 week |
| Multi-language expansion (ru, pl) | P2 | 1 week |
| Telegram Stars payment | P2 | 1 week |
| Referral program | P3 | 1 week |
| Multi-staff salon support | P3 | 3 weeks |
| Mobile app (React Native) | P3 | 6 weeks |
| Marketplace (client discovers masters) | P3 | 4 weeks |

---

## Risk Matrix

| Ризик | Ймовірність | Вплив | Мітигація |
|---|---|---|---|
| Telegram API changes | Низька | Високий | Абстрактний шар, pin API version |
| Payment provider issues | Середня | Високий | Два провайдери, fallback |
| Scale beyond 1K masters | Низька (MVP) | Середній | Horizontal scaling planned |
| Developer bandwidth | Висока | Високий | MVP-first, cut P2/P3 features |
| Security incident | Низька | Критичний | Security-first architecture |
