# ADR-003: Prisma Extension замість PostgreSQL RLS

> **Status:** Accepted  
> **Date:** 2026-03-11  
> **Decision:** Використовувати Prisma Client Extension для tenant isolation замість PostgreSQL Row-Level Security

---

## Context

Потрібно забезпечити ізоляцію даних між tenants у shared database. Два основні підходи: PostgreSQL RLS (database-level) або application-level filtering.

## Options Considered

### Option A: PostgreSQL Row-Level Security (RLS)
- Database-enforced: `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant'))`
- Потребує `SET app.tenant = X` на кожному з'єднанні

### Option B: Prisma Client Extension (обрано)
- Application-level: middleware додає `WHERE tenant_id = X` до кожного запиту
- Tenant context через AsyncLocalStorage

## Decision

**Option B — Prisma Client Extension**

## Rationale

1. **Prisma + RLS несумісність:** Prisma використовує connection pooling, а RLS потребує `SET` на рівні з'єднання. З PgBouncer в transaction mode — `SET` не гарантовано працює між запитами
2. **Prisma не підтримує RLS нативно:** Немає вбудованого механізму для `SET` per-request. Потрібні `$queryRaw` хаки
3. **Прозорість:** Prisma Extension видно в коді, легко дебажити. RLS — "магія" на рівні DB, складніше діагностувати проблеми
4. **Тестування:** Application-level filtering легко тестувати unit-тестами. RLS потребує integration tests з реальною DB
5. **Flexibility:** Extension можна легко вимкнути для admin queries (global analytics), з RLS потрібно обходити через superuser

## Risks & Mitigations

| Ризик | Мітигація |
|---|---|
| Забули додати tenant_id фільтр | Prisma Extension додає автоматично, не потрібно пам'ятати |
| Баг в extension = data leak | Integration tests на cross-tenant access |
| Немає DB-level захисту | Прийнятно для нашого threat model |
| Raw SQL queries обходять extension | Код-рев'ю + заборона `$queryRaw` без явного tenant_id |

## Consequences

- Tenant isolation — на рівні Prisma Client Extension
- AsyncLocalStorage (`@nestjs/cls`) зберігає tenant_id per-request
- Таблиця `users` виключена з extension (глобальна)
- Для BullMQ workers — явне встановлення tenant context з job data
- Integration tests обов'язкові: створити 2 tenants, перевірити ізоляцію
