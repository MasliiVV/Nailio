# 💅 Manik — Telegram Mini App Platform for Beauty Masters

> SaaS-платформа для майстрів манікюру та інших б'юті-майстрів. Telegram Mini App для управління записами клієнтів, аналітикою, фінансами та комунікацією.

---

## 📋 Зміст документації

### Архітектура
- [Системний огляд](architecture/overview.md) — компоненти, tech stack, data flow
- [Multi-tenancy](architecture/multi-tenancy.md) — модель ізоляції даних, Prisma extension

### Architecture Decision Records (ADR)
- [ADR-001: Shared Database](architecture/decisions/001-shared-db.md) — чому shared DB замість DB-per-tenant
- [ADR-002: NestJS](architecture/decisions/002-nestjs.md) — чому NestJS як backend framework
- [ADR-003: No RLS](architecture/decisions/003-no-rls.md) — чому Prisma extension замість PostgreSQL RLS

### База даних
- [Схема бази даних](database/schema.md) — ER-модель, таблиці, поля, індекси, constraints
- [Backup & Recovery](database/backup-restore.md) — стратегія бекапів, disaster recovery

### API
- [API Overview](api/overview.md) — принципи, версіонування, формат відповідей
- [Аутентифікація](api/authentication.md) — Telegram initData → HMAC-SHA256 → JWT
- [Endpoints](api/endpoints.md) — повний список endpoints з параметрами

### Telegram
- [Bot Architecture](telegram/bot-architecture.md) — multi-bot система, webhook routing
- [Mini App](telegram/mini-app.md) — launch flow, auth, role detection, branding
- [Notifications](telegram/notifications.md) — нагадування, шаблони, BullMQ

### Безпека
- [Security Overview](security/overview.md) — auth, encryption, rate limiting
- [Permissions](security/permissions.md) — ролі, permission matrix, read-only mode

### Платежі
- [Payments Overview](payments/overview.md) — Monobank + LiqPay, Strategy pattern
- [Subscription Lifecycle](payments/subscription-lifecycle.md) — trial → active → expired

### Deployment
- [Docker](deployment/docker.md) — Docker Compose setup, services, env vars

### Гайди
- [Master Onboarding](guides/master-onboarding.md) — UX flow, відео-сценарій, AI tools

### Планування
- [Roadmap](roadmap.md) — 6 фаз розробки
- [Backlog](backlog.md) — dev task backlog з пріоритетами

---

## 🏗 Проєктна модель

| Сутність | Опис |
|---|---|
| **Платформа** | SaaS система (цей проєкт) |
| **Майстер (Master)** | Б'юті-майстер — tenant у системі |
| **Клієнт (Client)** | Кінцевий користувач, що записується до майстра |

Кожен майстер отримує:
- Власного Telegram бота
- Власний Mini App інтерфейс
- Власну базу клієнтів
- Власну аналітику та фінанси
- Брендований дизайн (лого, кольори, тексти)

Вся система працює на єдиній SaaS платформі — **multi-tenant architecture**.

---

## 💰 Монетизація

| Параметр | Значення |
|---|---|
| Тариф | $10/міс (єдиний план) |
| Trial | 7 днів безкоштовно (без картки) |
| Оплата | Monobank або LiqPay (на вибір майстра) |
| Grace period | 7 днів після невдалої оплати |
| Read-only mode | Після grace — обмеження функцій |

---

## 🌍 Мультимовність

Підтримувані мови: **Українська (uk)**, **English (en)**

Мова визначається автоматично з `Telegram.WebApp.initData.user.language_code`.

---

## 📊 Масштаб

Система спроєктована на:
- **1 000** майстрів
- **100 000** клієнтів
- **~50 000** записів на день
- **~500 000** API запитів на день
