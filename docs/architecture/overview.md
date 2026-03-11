# 🏗 Системна архітектура

> High-level огляд системи Manik — компоненти, tech stack, data flow, deployment.

---

## Діаграма компонентів

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS (Telegram)                       │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │  Client App  │    │  Master App  │    │  Admin Panel │     │
│   │  (Mini App)  │    │  (Mini App)  │    │  (Web SPA)   │     │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
└──────────┼───────────────────┼───────────────────┼─────────────┘
           │                   │                   │
           │    Telegram       │                   │
           │    WebApp         │                   │ HTTPS
           │    initData       │                   │ JWT
           ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│                      NGINX / TRAEFIK                         │
│              (Reverse Proxy, SSL, Rate Limiting)             │
└──────────────────────────┬───────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│   API Server     │ │  Webhook     │ │  Admin API       │
│   /api/v1/*      │ │  Handler     │ │  /api/admin/*    │
│                  │ │  /webhook/*  │ │                  │
│   NestJS         │ │              │ │  NestJS          │
└────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
              ┌─────────────┼──────────────┐
              ▼             ▼              ▼
┌──────────────────┐ ┌────────────┐ ┌────────────────┐
│   PostgreSQL     │ │   Redis    │ │  BullMQ Worker │
│                  │ │            │ │                │
│   - Main DB      │ │  - Cache   │ │  - Notifs      │
│   - PgBouncer    │ │  - Sessions│ │  - Analytics   │
│                  │ │  - Queues  │ │  - Subscriptions│
└──────────────────┘ └────────────┘ └────────────────┘
                                           │
                                           ▼
                                    ┌────────────┐
                                    │ Telegram   │
                                    │ Bot API    │
                                    └────────────┘

┌──────────────────┐
│  Object Storage  │
│  (S3 / MinIO)    │
│  - Logos         │
│  - Avatars       │
└──────────────────┘

┌──────────────────┐
│  CDN             │
│  (Cloudflare)    │
│  - Mini App SPA  │
│  - Static assets │
└──────────────────┘
```

---

## Tech Stack

### Backend
| Компонент | Технологія | Обґрунтування |
|---|---|---|
| **Framework** | NestJS (TypeScript) | Модульність, DI, guards, interceptors, Swagger з коробки |
| **ORM** | Prisma | Type-safe queries, auto-migrations, schema-first |
| **Database** | PostgreSQL 16 | JSONB, exclusion constraints, надійність |
| **Connection Pool** | PgBouncer | Ефективне використання з'єднань при горизонтальному масштабуванні |
| **Cache / Queue** | Redis 7 | Кеш, сесії, BullMQ черги |
| **Job Queue** | BullMQ | Delayed jobs, cron, retries, rate limiting |
| **API Format** | REST (JSON) | Простота, Swagger docs, широка підтримка |

### Frontend
| Компонент | Технологія | Обґрунтування |
|---|---|---|
| **Mini App** | React 18 + TypeScript + Vite | Швидкий build, HMR, tree-shaking |
| **Telegram SDK** | @telegram-apps/sdk-react | Офіційна бібліотека для Telegram Mini Apps |
| **UI Kit** | @telegram-apps/telegram-ui | Native Telegram look & feel |
| **State** | TanStack Query (React Query) | Server state management, кешування, refetch |
| **i18n** | react-intl (FormatJS) | ICU Message Syntax, uk/en, автоформатування |
| **Routing** | React Router 6 | Client-side routing, lazy loading |

### Admin Panel
| Компонент | Технологія | Обґрунтування |
|---|---|---|
| **Framework** | React + TypeScript | Спільний стек з Mini App |
| **UI** | Ant Design | Готові компоненти для адмін-панелей |
| **Auth** | Email/password + JWT | Окрема auth система (не через Telegram) |

### Infrastructure
| Компонент | Технологія | Обґрунтування |
|---|---|---|
| **Containerization** | Docker + Docker Compose | Єдине середовище dev/staging/prod |
| **Reverse Proxy** | Nginx | SSL termination, rate limiting, static serving |
| **Object Storage** | MinIO (self-hosted S3) | Логотипи, аватари |
| **CDN** | Cloudflare Pages | Статичні ресурси Mini App |
| **SSL** | Let's Encrypt (certbot) | Безкоштовні сертифікати |
| **Monitoring** | Prometheus + Grafana | Метрики, alerting |
| **Logging** | Pino + Loki | Structured logging, centralized |

---

## Data Flow

### 1. Client Booking Flow
```
Client opens Mini App
  → Telegram passes initData
  → POST /api/auth/telegram (initData + start_param)
  → Backend validates HMAC-SHA256 with bot_token
  → Resolves tenant from slug (start_param)
  → Resolves role (client)
  → Returns JWT + client profile
  → Client selects service + date/time
  → POST /api/v1/bookings
  → Backend checks slot availability (working_hours + overrides - existing bookings)
  → INSERT booking (with exclusion constraint protection)
  → Enqueue notifications (confirmation now + reminder_24h + reminder_1h)
  → Return booking to client
  → Send Telegram confirmation to client
  → Send Telegram notification to master
```

### 2. Webhook Processing Flow
```
Telegram sends update to POST /webhook/{botId}
  → Nginx routes to API server
  → Verify X-Telegram-Bot-Api-Secret-Token header
  → Resolve tenant from botId (Redis cache → DB fallback)
  → Parse update type (message / callback_query / etc.)
  → Handle command (/start → send Mini App button)
  → Respond with 200 OK (< 1 sec)
```

### 3. Notification Flow
```
BullMQ Scheduler (cron every minute)
  → Find notifications where scheduled_at <= NOW() AND status = 'pending'
  → For each notification:
    → Check booking.status (skip if cancelled)
    → Check client.bot_blocked (skip if true)
    → Render message template (uk/en based on client.language_code)
    → Decrypt bot_token from Redis cache
    → Call Telegram Bot API sendMessage
    → Update notification.status = 'sent'
    → On error: retry (3 attempts, exponential backoff)
    → On 403 (bot blocked): mark client.bot_blocked = true, status = 'failed'
```

---

## Модулі NestJS

```
src/
├── app.module.ts                 — Root module
├── common/
│   ├── guards/                   — AuthGuard, RoleGuard, SubscriptionGuard
│   ├── interceptors/             — TenantInterceptor, LoggingInterceptor
│   ├── filters/                  — HttpExceptionFilter
│   ├── decorators/               — @CurrentUser, @CurrentTenant, @Roles
│   └── middleware/               — TenantMiddleware
├── modules/
│   ├── auth/                     — Telegram auth, JWT, refresh tokens
│   ├── tenants/                  — Tenant CRUD, branding, settings
│   ├── masters/                  — Master profile
│   ├── clients/                  — Client CRUD, CRM
│   ├── services/                 — Service CRUD
│   ├── schedule/                 — Working hours, overrides
│   ├── bookings/                 — Booking CRUD, slot availability engine
│   ├── transactions/             — Payment tracking
│   ├── notifications/            — Notification queue, templates, sending
│   ├── analytics/                — Daily aggregation, dashboard data
│   ├── subscriptions/            — Subscription engine, billing
│   ├── payments/                 — PaymentProvider strategy, Mono/LiqPay
│   ├── telegram/                 — Webhook handler, bot management
│   ├── admin/                    — Admin Panel API
│   └── storage/                  — File upload (logos, avatars)
├── prisma/
│   ├── schema.prisma             — Database schema
│   ├── migrations/               — SQL migrations
│   └── seed.ts                   — Dev seed data
└── workers/
    ├── notification.worker.ts    — BullMQ notification processor
    ├── analytics.worker.ts       — Daily aggregation
    └── subscription.worker.ts    — Billing scheduler
```

---

## Deployment Architecture

```
Production Server (VPS)
├── docker-compose.yml
│   ├── api          — NestJS API (2 instances, load balanced)
│   ├── worker       — BullMQ Worker (1 instance)
│   ├── postgres     — PostgreSQL 16
│   ├── pgbouncer    — Connection pooler
│   ├── redis        — Redis 7
│   ├── nginx        — Reverse proxy + SSL
│   └── minio        — Object storage
│
├── CDN (external)
│   └── Mini App SPA (React build)
│
└── Monitoring
    ├── prometheus
    └── grafana
```

---

## Estimated Load (1000 masters, 100K clients)

| Метрика | Значення |
|---|---|
| Bookings per day | ~50,000 (50 per master avg) |
| API requests per day | ~500,000 |
| Webhook events per day | ~20,000 |
| Notifications per day | ~150,000 (3 per booking) |
| DB rows (bookings, 1 year) | ~18M |
| DB rows (clients) | ~100K |
| DB size (estimated, 1 year) | ~5-10 GB |
| Redis memory | ~500 MB |
