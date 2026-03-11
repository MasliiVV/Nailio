# 📋 Development Backlog

> Повний список задач з пріоритетами, залежностями та описами.

---

## Priority Legend

| Priority | Значення | Правило |
|---|---|---|
| **P0** | Блокер — без цього система не працює | Обов'язково в MVP |
| **P1** | Важливо — ключовий функціонал | Бажано в MVP |
| **P2** | Покращення — user experience, polish | Після MVP |
| **P3** | Nice-to-have — додатковий функціонал | Backlog |

---

## Infrastructure & Setup

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 1 | NestJS project scaffolding + ESLint + Prettier | P0 | 1 | — | 2h |
| 2 | Docker Compose (postgres, redis, pgbouncer, minio, nginx) | P0 | 1 | — | 4h |
| 3 | Prisma schema + initial migration | P0 | 1 | #1 | 8h |
| 4 | btree_gist extension + exclusion constraint | P0 | 1 | #3 | 2h |
| 5 | Environment configuration (.env, validation) | P0 | 1 | #1 | 2h |
| 6 | Logger setup (structured JSON logging) | P1 | 1 | #1 | 2h |
| 7 | Health check endpoint | P1 | 1 | #1 | 1h |
| 8 | CI/CD pipeline (GitHub Actions: lint, test, build) | P1 | 6 | #1 | 4h |
| 9 | Monitoring setup (Prometheus + Grafana) | P2 | Post-MVP | #2 | 8h |

---

## Multi-Tenancy

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 10 | AsyncLocalStorage setup (@nestjs/cls) | P0 | 1 | #1 | 2h |
| 11 | Prisma Client Extension (auto tenant_id filter) | P0 | 1 | #3, #10 | 8h |
| 12 | TenantGuard middleware (JWT → tenant context) | P0 | 1 | #10, #15 | 4h |
| 13 | Cross-tenant integration tests | P0 | 6 | #11, #12 | 8h |
| 14 | BullMQ worker tenant context handling | P1 | 2 | #10, #11 | 4h |

---

## Authentication

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 15 | Telegram initData HMAC-SHA256 validation | P0 | 1 | #1 | 4h |
| 16 | JWT generation (access 1h + refresh 30d) | P0 | 1 | #15 | 4h |
| 17 | Refresh token rotation (Redis-backed) | P0 | 1 | #16 | 4h |
| 18 | Role resolution (master vs client from botId) | P0 | 1 | #15, #3 | 4h |
| 19 | @Roles() decorator + RolesGuard | P0 | 1 | #18 | 2h |
| 20 | Admin auth (email/password, bcrypt) | P1 | Post-MVP | #1 | 4h |
| 21 | Auth rate limiting (@nestjs/throttler) | P1 | 1 | #1 | 2h |

---

## Bot Infrastructure

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 22 | Bot module (CRUD + token encryption AES-256-GCM) | P0 | 1 | #3 | 6h |
| 23 | Webhook routing (POST /webhook/{botId}) | P0 | 1 | #22 | 4h |
| 24 | Webhook secret token verification | P0 | 1 | #23 | 2h |
| 25 | Bot auto-setup (setWebhook, setChatMenuButton, setMyCommands, setMyDescription) | P0 | 1 | #22 | 4h |
| 26 | Bot token Redis cache (decrypt → cache 1h) | P1 | 1 | #22 | 2h |
| 27 | Bot commands handler (/start, /book, /my_bookings, /help) | P1 | 1 | #23 | 6h |
| 28 | Platform bot setup | P0 | 1 | #22 | 2h |
| 29 | Bot reconnect flow (re-validate token) | P2 | 3 | #22 | 2h |
| 30 | Bot deactivation on expired subscription | P1 | 5 | #22, #55 | 2h |

---

## Master Onboarding

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 31 | Onboarding wizard API (validate-token, connect, status) | P0 | 1 | #22, #25 | 6h |
| 32 | Onboarding checklist (JSONB in tenants) | P1 | 1 | #3 | 2h |
| 33 | Onboarding video integration (embedded player) | P2 | 3 | — | 2h |
| 34 | AI video production (Synthesia, uk+en) | P2 | Post-MVP | — | 8h |
| 35 | QR code generation for bot link | P2 | 3 | #22 | 2h |

---

## Services

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 36 | Services CRUD API | P0 | 1 | #3, #11 | 4h |
| 37 | Service soft-delete (is_active flag) | P0 | 1 | #36 | 1h |
| 38 | Service validation (name, price > 0, duration > 0) | P0 | 1 | #36 | 1h |
| 39 | Service ordering (sort_order field) | P2 | 3 | #36 | 2h |

---

## Schedule

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 40 | Working hours CRUD (7 days + time ranges) | P0 | 1 | #3, #11 | 4h |
| 41 | Schedule overrides (day-off, custom hours per date) | P1 | 1 | #3, #11 | 4h |
| 42 | Slot duration configuration (per tenant) | P0 | 1 | #40 | 1h |
| 43 | Break time configuration | P2 | 2 | #40 | 2h |

---

## Booking System

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 44 | Slot generation algorithm | P0 | 2 | #40, #41 | 8h |
| 45 | GET /bookings/slots endpoint | P0 | 2 | #44 | 2h |
| 46 | POST /bookings (create with snapshot data) | P0 | 2 | #44, #4 | 6h |
| 47 | Booking cancellation (3h policy, client vs master) | P0 | 2 | #46 | 4h |
| 48 | Booking complete / no-show actions | P1 | 2 | #46 | 2h |
| 49 | Booking list (filter by date, status, client) | P0 | 2 | #46 | 4h |
| 50 | Double-booking prevention (exclusion constraint + app check) | P0 | 2 | #4, #46 | 4h |
| 51 | Buffer time between bookings | P2 | 2 | #44 | 2h |

---

## Clients CRM

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 52 | Client auto-create on first bot /start | P0 | 3 | #23, #3 | 2h |
| 53 | Client list API (search, sort, pagination) | P0 | 3 | #3, #11 | 4h |
| 54 | Client profile (visit_count, total_spent, last_visit) | P0 | 3 | #53, #46 | 4h |
| 55 | Client booking history | P0 | 3 | #53, #49 | 2h |
| 56 | Client notes (master's private notes) | P1 | 3 | #53 | 2h |

---

## Subscription & Payments

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 57 | Subscription module + state machine | P0 | 5 | #3 | 8h |
| 58 | Trial flow (7 days, anti-abuse) | P0 | 5 | #57 | 4h |
| 59 | @RequiresActiveSubscription guard | P0 | 5 | #57 | 4h |
| 60 | Read-only mode (client + master UX) | P0 | 5 | #59 | 4h |
| 61 | PaymentProvider interface (Strategy Pattern) | P0 | 5 | — | 2h |
| 62 | MonobankProvider implementation | P0 | 5 | #61 | 8h |
| 63 | LiqPayProvider implementation | P0 | 5 | #61 | 8h |
| 64 | Exchange rate service (USD→UAH, Redis cache) | P0 | 5 | — | 4h |
| 65 | Card tokenization flow (both providers) | P0 | 5 | #62, #63 | 6h |
| 66 | BullMQ billing jobs (charge, retry, expire) | P0 | 5 | #57, #65 | 8h |
| 67 | Subscription checkout UI | P0 | 5 | #62, #63 | 4h |
| 68 | Subscription management UI (status, history, cancel) | P1 | 5 | #57 | 4h |
| 69 | Payment settings (master's own Mono/LiqPay) | P1 | 5 | #61 | 4h |
| 70 | Client payment flow ("Pay Online") | P1 | 5 | #69 | 6h |
| 71 | Webhook handlers (Monobank ECDSA, LiqPay SHA1) | P0 | 5 | #62, #63 | 6h |

---

## Notifications

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 72 | Notification module (BullMQ delayed jobs) | P0 | 6 | #22 | 4h |
| 73 | Booking confirmation notification | P0 | 6 | #72, #46 | 2h |
| 74 | Booking reminder (24h + 1h) | P0 | 6 | #72, #46 | 4h |
| 75 | Booking cancellation notification | P0 | 6 | #72, #47 | 2h |
| 76 | Job cancellation on booking cancel | P0 | 6 | #74 | 2h |
| 77 | Subscription reminders (trial day 5, 6; payment failures) | P0 | 6 | #72, #57 | 4h |
| 78 | Notification templates (uk/en) | P0 | 6 | #72 | 4h |
| 79 | Retry strategy (3 attempts, exponential backoff) | P1 | 6 | #72 | 2h |
| 80 | Blocked bot detection (403 handling) | P1 | 6 | #72 | 2h |

---

## Analytics & Finance

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 81 | Analytics daily aggregation (BullMQ cron) | P1 | 4 | #46 | 6h |
| 82 | Dashboard API (GET /analytics/dashboard) | P1 | 4 | #81 | 4h |
| 83 | Dashboard UI (cards: bookings, revenue, clients) | P1 | 4 | #82 | 6h |
| 84 | Transactions module (manual income/expense) | P1 | 4 | #3 | 4h |
| 85 | Finance summary API | P1 | 4 | #84 | 2h |
| 86 | Finance UI (transaction list + summary) | P1 | 4 | #85 | 4h |

---

## Frontend (Mini App)

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 87 | React + Vite + TypeScript project setup | P0 | 2 | — | 2h |
| 88 | @telegram-apps/sdk-react integration | P0 | 2 | #87 | 4h |
| 89 | Auth flow (initData → API → JWT → storage) | P0 | 2 | #87, #15 | 4h |
| 90 | TanStack Query setup + API client | P0 | 2 | #87 | 4h |
| 91 | Client booking flow (service → date → slot → confirm) | P0 | 2 | #87, #45 | 8h |
| 92 | Master calendar view | P0 | 2 | #87, #49 | 8h |
| 93 | Master services management UI | P0 | 2 | #87, #36 | 4h |
| 94 | Master schedule management UI | P0 | 2 | #87, #40 | 4h |
| 95 | Client bookings list (upcoming + history) | P1 | 2 | #87, #49 | 4h |
| 96 | Branding system (CSS custom properties) | P1 | 3 | #87 | 4h |
| 97 | i18n setup (react-intl, uk/en, lazy loading) | P1 | 3 | #87 | 6h |
| 98 | Empty states & illustrations | P2 | 3 | #87 | 4h |
| 99 | Error boundary + offline state | P1 | 3 | #87 | 4h |
| 100 | Loading skeletons + optimistic updates | P2 | 3 | #87 | 4h |
| 101 | Onboarding wizard UI (7 steps) | P0 | 1 | #87, #31 | 8h |

---

## Settings & Tenant

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 102 | Tenant settings API (GET/PUT) | P1 | 1 | #3, #11 | 2h |
| 103 | Branding settings UI (logo, colors, text) | P1 | 3 | #102 | 4h |
| 104 | General settings UI (timezone, language, cancellation policy) | P1 | 3 | #102 | 4h |

---

## Admin Panel (Post-MVP)

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 105 | React + Ant Design project setup | P1 | Post-MVP | — | 4h |
| 106 | Admin auth (email/password) | P1 | Post-MVP | #20 | 4h |
| 107 | Tenant list + details | P1 | Post-MVP | #105 | 6h |
| 108 | Subscription management | P1 | Post-MVP | #105, #57 | 4h |
| 109 | Platform metrics dashboard | P2 | Post-MVP | #105 | 6h |

---

## Security & Testing

| # | Task | Priority | Phase | Dependencies | Estimate |
|---|---|---|---|---|---|
| 110 | Input validation (class-validator on all DTOs) | P0 | 1-6 | Ongoing | 4h |
| 111 | Rate limiting configuration (per-endpoint) | P1 | 1 | #21 | 2h |
| 112 | CORS configuration | P0 | 1 | #1 | 1h |
| 113 | Audit log module | P2 | 4 | #3 | 4h |
| 114 | Account deletion flow (soft-delete + PII cleanup) | P1 | 5 | #3 | 4h |
| 115 | Unit tests (services, guards, providers) | P0 | 6 | All modules | 16h |
| 116 | Integration tests (API endpoints) | P0 | 6 | All modules | 16h |
| 117 | Cross-tenant isolation tests | P0 | 6 | #13 | 8h |
| 118 | Payment flow tests (mock providers) | P0 | 6 | #62, #63 | 8h |
| 119 | Load testing (k6 scripts) | P2 | Post-MVP | — | 8h |

---

## Summary

| Priority | Tasks | Total Estimate |
|---|---|---|
| P0 | 62 tasks | ~230 hours |
| P1 | 33 tasks | ~110 hours |
| P2 | 16 tasks | ~54 hours |
| P3 | — | Future backlog |
| **Total MVP (P0+P1)** | **95 tasks** | **~340 hours ≈ 8.5 weeks** |
| **Total with P2** | **111 tasks** | **~394 hours ≈ 10 weeks** |

> ⚠️ Estimates assume 40h/week, 1 full-stack developer. Real timeline may vary by ±30%.

---

## Definition of Done

Кожна задача вважається завершеною коли:

- [ ] Код написано і працює
- [ ] Типи TypeScript — strict mode, no `any`
- [ ] Input validation на всіх endpoints
- [ ] Tenant isolation перевірено (для tenant-scoped endpoints)
- [ ] Unit test для core logic
- [ ] API documentation (Swagger decorators)
- [ ] Error handling (proper HTTP codes + error codes)
- [ ] Code review passed
