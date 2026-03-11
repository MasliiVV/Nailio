# 🔑 Permissions & Role Matrix

> Повна матриця дозволів для всіх ролей. Read-only mode при неоплаченій підписці.

---

## Ролі

| Роль | Опис | Створення |
|---|---|---|
| `platform_admin` | Адміністратор платформи | Seed / invite |
| `master` | Майстер (власник тенанту) | Реєстрація через onboarding |
| `client` | Клієнт майстра | Запуск бота майстра + /start |

---

## Role Resolution Flow

```
POST /auth/telegram { initData, botId? }
  │
  ├─ botId is NULL (admin panel) → platform_admin (email/password, окрема auth)
  │
  ├─ botId is PLATFORM_BOT → check users.role
  │    ├─ role = master → JWT { role: master, tenantId }
  │    └─ role = NULL → create master, new tenant → JWT { role: master, tenantId }
  │
  └─ botId is MASTER_BOT → resolve tenantId from bot
       ├─ clients record exists → JWT { role: client, tenantId, clientId }
       └─ No client record → create client → JWT { role: client, tenantId, clientId }
```

---

## NestJS Guards & Decorators

### Implementation

```typescript
// Guards stack:
// 1. JwtAuthGuard         — validates JWT, extracts user
// 2. RolesGuard           — checks @Roles('master') decorator
// 3. SubscriptionGuard    — checks @RequiresActiveSubscription() decorator

@Roles('master')                    // only masters can access
@RequiresActiveSubscription()       // blocks if subscription expired
@Controller('services')
export class ServicesController { ... }
```

### Decorators

| Decorator | Опис |
|---|---|
| `@Public()` | Без JWT (webhooks, health check) |
| `@Roles('master')` | Доступ тільки для ролі master |
| `@Roles('client')` | Доступ тільки для ролі client |
| `@Roles('master', 'client')` | Обидві ролі |
| `@RequiresActiveSubscription()` | Блокує при expired subscription (read-only mode) |

---

## Full Permission Matrix

### Auth & Profile

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| POST /auth/telegram | ✅ | ✅ | — | ✅ |
| POST /auth/refresh | ✅ | ✅ | — | ✅ |
| GET /profile | ✅ | ✅ | — | ✅ |
| PUT /profile | ✅ | ✅ | — | ❌ |
| POST /auth/admin/login | — | — | ✅ | — |

### Services (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /services | ✅ | ✅ | — | ✅ |
| GET /services/:id | ✅ | ✅ | — | ✅ |
| POST /services | ✅ | — | — | ❌ |
| PUT /services/:id | ✅ | — | — | ❌ |
| DELETE /services/:id | ✅ | — | — | ❌ |

### Schedule (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /schedule | ✅ | — | — | ✅ |
| PUT /schedule | ✅ | — | — | ❌ |
| POST /schedule/overrides | ✅ | — | — | ❌ |
| DELETE /schedule/overrides/:id | ✅ | — | — | ❌ |

### Bookings

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /bookings/slots | ✅ | ✅ | — | ✅ |
| GET /bookings | ✅ | ✅ | — | ✅ |
| GET /bookings/:id | ✅ | ✅ | — | ✅ |
| POST /bookings | ✅ | ✅ | — | ❌ |
| PATCH /bookings/:id/cancel | ✅ | ✅* | — | ✅** |
| PATCH /bookings/:id/complete | ✅ | — | — | ❌ |
| PATCH /bookings/:id/no-show | ✅ | — | — | ❌ |

> \* Client може скасувати тільки свої букінги, за ≥ 3 години до початку
> \*\* Client може скасувати існуючі букінги навіть у read-only mode

### Clients CRM (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /clients | ✅ | — | — | ✅ |
| GET /clients/:id | ✅ | — | — | ✅ |
| PUT /clients/:id/notes | ✅ | — | — | ❌ |
| GET /clients/:id/history | ✅ | — | — | ✅ |

### Analytics (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /analytics/dashboard | ✅ | — | — | ✅ |

### Finance (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /finance/transactions | ✅ | — | — | ✅ |
| GET /finance/summary | ✅ | — | — | ✅ |
| POST /finance/transactions | ✅ | — | — | ❌ |

### Settings (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /settings | ✅ | — | — | ✅ |
| PUT /settings/branding | ✅ | — | — | ❌ |
| PUT /settings/general | ✅ | — | — | ❌ |

### Subscription (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /subscription | ✅ | — | — | ✅ |
| POST /subscription/checkout | ✅ | — | — | ✅*** |
| POST /subscription/cancel | ✅ | — | — | ✅ |

> \*\*\* Checkout доступний у read-only mode щоб майстер міг оплатити і відновити доступ

### Bot Onboarding (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| POST /onboarding/bot | ✅ | — | — | ❌ |
| GET /onboarding/status | ✅ | — | — | ✅ |
| POST /onboarding/validate-token | ✅ | — | — | ❌ |

### Payment Settings (Master)

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /payment-settings | ✅ | — | — | ✅ |
| PUT /payment-settings | ✅ | — | — | ❌ |

### Client Payment

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| POST /payments/create | — | ✅ | — | ❌ |
| GET /payments/:id/status | — | ✅ | — | ✅ |

### Admin Panel

| Endpoint | Master | Client | Admin | Read-Only Mode |
|---|---|---|---|---|
| GET /admin/tenants | — | — | ✅ | — |
| GET /admin/tenants/:id | — | — | ✅ | — |
| PATCH /admin/tenants/:id | — | — | ✅ | — |
| GET /admin/metrics | — | — | ✅ | — |
| GET /admin/subscriptions | — | — | ✅ | — |

---

## Read-Only Mode

### Коли активується

```
Subscription status = 'expired'
  Тобто: trial закінчився БЕЗ оплати
  АБО:   grace period (7 днів) пройшов без успішної оплати
```

### Що дозволено в Read-Only

| Дія | Дозволено? | Для кого |
|---|---|---|
| Переглядати послуги | ✅ | Master + Client |
| Переглядати розклад | ✅ | Master |
| Переглядати букінги | ✅ | Master + Client |
| Переглядати клієнтів | ✅ | Master |
| Переглядати аналітику | ✅ | Master |
| Переглядати підписку | ✅ | Master |
| Оплатити підписку | ✅ | Master |
| Скасувати букінг | ✅ | Client (існуючі) |
| Створити букінг | ❌ | — |
| Змінити послуги | ❌ | — |
| Змінити розклад | ❌ | — |
| Змінити налаштування | ❌ | — |
| Додати бота | ❌ | — |

### Guard Implementation

```typescript
@Injectable()
export class SubscriptionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiresActive = this.reflector.get<boolean>(
      'requiresActiveSubscription',
      context.getHandler()
    );
    
    if (!requiresActive) return true;

    const request = context.switchToHttp().getRequest();
    const { role, tenantId } = request.user;
    
    // Clients: subscription check only blocks booking creation
    // Admin: no subscription concept
    if (role === 'platform_admin') return true;
    
    const tenant = await this.tenantService.findById(tenantId);
    const subscription = tenant.subscription;
    
    if (!subscription) return false;
    
    return ['trial', 'active', 'past_due'].includes(subscription.status);
    // 'expired' → return false → 403 Forbidden
  }
}
```

### Client-Side UX in Read-Only

```
Client opens Mini App with expired subscription:
  → Sees existing bookings (read-only list)
  → "Book" button disabled
  → Banner: "Запис тимчасово недоступний / Booking temporarily unavailable"
  → Can cancel existing bookings via button

Master opens Mini App with expired subscription:
  → Sees all data (read-only)
  → Banner: "Підписка закінчилась. Оновіть для продовження роботи"
  → "Оплатити" button → subscription checkout page
  → All edit buttons disabled/hidden
```

---

## Cross-Tenant Security Tests

```typescript
describe('Cross-Tenant Protection', () => {
  it('master A cannot see master B services', async () => {
    const res = await request(app)
      .get(`/services/${masterBServiceId}`)
      .set('Authorization', `Bearer ${masterAToken}`);
    
    expect(res.status).toBe(404); // NOT 403 (to not leak existence)
  });

  it('client of master A cannot book with master B', async () => {
    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${clientOfMasterAToken}`)
      .send({ serviceId: masterBServiceId, date: '...' });
    
    expect(res.status).toBe(404);
  });

  it('Prisma Extension adds tenant_id automatically', async () => {
    const services = await prisma.service.findMany();
    // Should only return services for current tenant from AsyncLocalStorage
    expect(services.every(s => s.tenantId === currentTenantId)).toBe(true);
  });
});
```
