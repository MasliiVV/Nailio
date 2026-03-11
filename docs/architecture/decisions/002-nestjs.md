# ADR-002: NestJS as Backend Framework

> **Status:** Accepted  
> **Date:** 2026-03-11  
> **Decision:** Використовувати NestJS (TypeScript) як основний backend framework

---

## Context

Потрібен backend framework для production SaaS системи з підтримкою: модульної архітектури, dependency injection, guards/middleware, WebSocket (optional), queue workers, Swagger documentation.

## Options Considered

### Option A: Express.js (raw)
- Мінімальний, гнучкий
- Немає вбудованої структури, потрібно самому все організовувати

### Option B: Fastify
- Швидкий, низький overhead
- Менша екосистема ніж Express

### Option C: NestJS (обрано)
- Opinionated, модульний, Angular-inspired
- Вбудовані: DI, Guards, Interceptors, Pipes, Filters
- Swagger генерація з декораторів

### Option D: Python FastAPI
- Async, швидкий, хороша документація
- Інший стек від фронтенду (React/TypeScript)

## Decision

**Option C — NestJS**

## Rationale

1. **TypeScript end-to-end:** Frontend (React) і Backend на одній мові → спільні типи, простіший DX
2. **Модульність:** Кожен домен (bookings, clients, notifications) — окремий NestJS Module з чітким API
3. **Guards:** `AuthGuard`, `RoleGuard`, `SubscriptionGuard` — декларативна авторизація на рівні контролерів
4. **Interceptors:** `TenantInterceptor` для tenant context, `LoggingInterceptor` для audit
5. **BullMQ інтеграція:** `@nestjs/bullmq` — офіційний пакет з декораторами
6. **Prisma інтеграція:** Добре документована, PrismaService як injectable
7. **Swagger:** `@nestjs/swagger` генерує OpenAPI spec з декораторів DTO — автоматична API документація
8. **Зрілість:** Великий community, 60K+ GitHub stars, production-proven

## Risks & Mitigations

| Ризик | Мітигація |
|---|---|
| Learning curve (DI, decorators) | Добра документація, Angular-like patterns |
| Overhead vs raw Express | Прийнятний для SaaS, не high-frequency trading |
| Opinionated structure | Перевага — менше архітектурних рішень, швидший старт |

## Consequences

- Backend структура: модулі в `src/modules/`
- Dependency Injection для всіх сервісів
- Декоратори для auth, roles, tenant context
- Auto-generated Swagger UI на `/api/docs`
