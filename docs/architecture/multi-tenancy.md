# 🔐 Multi-Tenancy Architecture

> Модель ізоляції даних у системі Manik. Shared database з `tenant_id` + application-level enforcement.

---

## Обрана модель

**Shared Database, Shared Schema, tenant_id column**

Одна база даних PostgreSQL для всіх майстрів. Кожна таблиця (крім `users`) має поле `tenant_id`. Ізоляція забезпечується на рівні додатку (Prisma Client Extension + NestJS middleware).

### Чому саме ця модель

| Критерій | Shared DB + tenant_id | DB per tenant | Schema per tenant |
|---|---|---|---|
| Вартість | ✅ Найнижча | ❌ Висока | 🟡 Середня |
| Складність ops | ✅ Низька | ❌ Висока (1000 DB) | ❌ Висока |
| Міграції | ✅ Один раз | ❌ 1000 разів | ❌ 1000 разів |
| Ізоляція | 🟡 Application-level | ✅ Повна | ✅ Повна |
| Масштабування | ✅ Просто | 🟡 Elastic pools | 🟡 Складно |
| **Наш вибір** | ✅ **Так** | ❌ | ❌ |

→ Детальне обґрунтування: [ADR-001: Shared Database](decisions/001-shared-db.md)

---

## Tenant Resolution Flow

```
Incoming Request
  │
  ▼
┌─────────────────────────────────┐
│  NestJS Middleware              │
│  TenantMiddleware               │
│                                 │
│  1. Extract JWT from header     │
│  2. Decode → get tenant_id      │
│  3. Store in AsyncLocalStorage  │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  Prisma Client Extension        │
│                                 │
│  Intercepts ALL queries:        │
│  - findMany → adds WHERE        │
│    tenant_id = ctx.tenant_id    │
│  - create → sets tenant_id      │
│  - update → adds WHERE          │
│  - delete → adds WHERE          │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│  PostgreSQL                     │
│  No RLS (see ADR-003)           │
└─────────────────────────────────┘
```

---

## AsyncLocalStorage (CLS Context)

NestJS використовує `@nestjs/cls` (Continuation Local Storage) для зберігання tenant context протягом усього lifecycle запиту:

```
Request → TenantMiddleware → CLS.set('tenant_id', ...) →
  → Controller → Service → Prisma Extension → CLS.get('tenant_id') →
  → Response
```

**Переваги:**
- Автоматичне propagation через async/await ланцюжки
- Не потрібно передавати `tenantId` як параметр у кожен метод
- Працює з BullMQ workers (потрібно явно встановити context при обробці job)

---

## Prisma Client Extension

Замість PostgreSQL RLS (див. [ADR-003](decisions/003-no-rls.md)) використовується Prisma Client Extension:

### Що робить extension:

1. **Query interceptor** — додає `where: { tenant_id }` до кожного `findMany`, `findFirst`, `findUnique`, `update`, `delete`
2. **Create interceptor** — автоматично встановлює `tenant_id` при `create`
3. **Виключення** — таблиця `users` не має `tenant_id`, extension її ігнорує

### Таблиці без tenant_id (глобальні):
- `users` — глобальна auth таблиця

### Таблиці з tenant_id:
- Всі інші (tenants, masters, clients, services, bookings, etc.)

---

## Cross-Tenant Protection

### Рівень 1: Prisma Extension (автоматичний)
- Кожен запит автоматично фільтрується по `tenant_id`
- Неможливо випадково отримати дані іншого tenant

### Рівень 2: API Guards (явний)
- `TenantGuard` перевіряє що `tenant_id` з JWT == tenant_id ресурсу
- Для endpoints що приймають `id` параметр — додаткова перевірка ownership

### Рівень 3: Integration Tests
- Тести що створюють 2+ tenant'и і перевіряють що:
  - Tenant A не бачить bookings Tenant B
  - Tenant A не може редагувати clients Tenant B
  - Tenant A не отримує notifications Tenant B

---

## BullMQ Worker Tenant Context

Workers працюють поза HTTP request lifecycle, тому потрібно явно встановлювати tenant context:

```
Job data: { tenant_id, booking_id, ... }
  │
  ▼
Worker picks up job
  → CLS.set('tenant_id', job.data.tenant_id)
  → Process job (Prisma queries автоматично фільтруються)
  → Clear context
```

---

## Масштабування

### Поточний рівень (до 1000 tenants)
- Один PostgreSQL instance з PgBouncer
- Один Redis instance
- Достатня продуктивність для ~18M рядків bookings/рік

### Майбутнє (1000+ tenants)
- PostgreSQL read replicas для аналітики
- Table partitioning `bookings` по місяцях
- Sharding по tenant_id (Citus extension) — якщо потрібно
- Redis Cluster для черг
