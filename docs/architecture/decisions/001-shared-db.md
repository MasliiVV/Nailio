# ADR-001: Shared Database with tenant_id

> **Status:** Accepted  
> **Date:** 2026-03-11  
> **Decision:** Використовувати shared database з `tenant_id` колонкою замість database-per-tenant

---

## Context

Система Manik — multi-tenant SaaS для б'юті-майстрів. Кожен майстер = один tenant. Потрібно забезпечити ізоляцію даних між tenants при мінімальній вартості інфраструктури.

Очікуване навантаження: 1000 tenants, 100K клієнтів.

## Options Considered

### Option A: Database per tenant
- Кожен tenant отримує окрему PostgreSQL базу
- Повна ізоляція на рівні DB
- 1000 tenants = 1000 баз даних

### Option B: Schema per tenant
- Одна БД, але кожен tenant в окремому PostgreSQL schema
- 1000 schemas в одній БД

### Option C: Shared database з tenant_id (обрано)
- Одна БД, один schema, `tenant_id` колонка на кожній таблиці
- Ізоляція на рівні application

## Decision

**Option C — Shared database з tenant_id**

## Rationale

1. **Вартість:** 1 PostgreSQL instance замість 1000. Економія ~$500-2000/міс на інфраструктурі
2. **Операційна простота:** одна БД = один backup, один моніторинг, одна точка відмови
3. **Міграції:** одна міграція застосовується одразу для всіх tenants
4. **Connection pooling:** один PgBouncer pool, а не 1000
5. **Розмір даних:** при 1000 tenants кожен має в середньому 100 клієнтів і ~18K bookings/рік — дані маленькі, shared DB ефективно використовує ресурси
6. **Prisma ORM:** нативно працює з shared DB; database-per-tenant потребує динамічних datasources

## Risks & Mitigations

| Ризик | Мітигація |
|---|---|
| Cross-tenant data leak | Prisma Extension + Integration tests |
| Noisy neighbor | Індекси з tenant_id leading column, PgBouncer limits |
| Per-tenant backup/restore | Неможливо → прийнятний trade-off для цього масштабу |
| Compliance (data residency) | Не актуально для українського ринку |

## Consequences

- Всі таблиці (крім `users`) мають `tenant_id` колонку
- Всі індекси починаються з `tenant_id`
- Prisma Client Extension автоматично додає `tenant_id` фільтр
- Per-tenant restore неможливий (тільки full DB restore)
