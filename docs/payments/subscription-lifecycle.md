# 🔄 Subscription Lifecycle

> State machine підписок. Trial → Active → Past Due → Expired. BullMQ cron jobs для billing, retry, grace period.

---

## State Machine

```
                    ┌──────────────┐
        New Tenant  │              │
       ──────────►  │    TRIAL     │  7 days, no card required
                    │              │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  ACTIVE  │ │ PAST_DUE │ │ EXPIRED  │
        │          │ │ (grace)  │ │(read-only)│
        └──────┬───┘ └──────┬───┘ └──────────┘
               │            │            ▲
               │            │            │
               │   Payment  │  Grace     │ 7 days
               │   failed   │  ended     │ no payment
               ├───────────►│───────────►│
               │            │            │
               │   Retry OK │            │
               │◄───────────┤            │
               │                         │
               │   Payment OK            │
               │◄────────────────────────┤
               │                         │
        ┌──────┴───┐               ┌─────┴─────┐
        │CANCELLED │               │   ACTIVE   │
        │(end of   │               │ (renewed)  │
        │ period)  │               └───────────-┘
        └──────────┘
```

---

## States

| State | Опис | Тривалість | Дозволи |
|---|---|---|---|
| `trial` | Безкоштовний пробний | 7 днів | Повний доступ |
| `active` | Оплачено | 30 днів (period) | Повний доступ |
| `past_due` | Платіж не пройшов | До 7 днів (grace) | Повний доступ |
| `expired` | Grace завершено | Безстроково | Read-only |
| `cancelled` | Майстер скасував | До кінця оплаченого періоду | Повний доступ |

---

## Flows

### 1. New Registration → Trial

```
POST /auth/telegram (new master)
  │
  ├─ Check: user has no existing tenant with status 'expired'
  │  (anti-abuse: one trial per telegram_id)
  │
  ├─ Create tenant
  ├─ Create subscription:
  │    status: 'trial'
  │    trial_ends_at: NOW() + 7 days
  │    provider: NULL
  │    card_token: NULL
  │
  └─ Schedule BullMQ job:
       queue: 'subscriptions'
       job: 'check-trial-end'
       data: { subscriptionId }
       delay: 7 days
       + reminder job at day 5 (2 days before end)
       + reminder job at day 6 (1 day before end)
```

### 2. Trial → First Payment

```
Master clicks "Subscribe" (day 1-7 of trial):
  │
  ├─ POST /subscription/checkout
  │    body: { provider: 'monobank' | 'liqpay' }
  │
  ├─ Server:
  │    1. Get exchange rate USD→UAH (cached 1h)
  │    2. Calculate: amount_uah = 10 * rate
  │    3. Create invoice via provider:
  │       - saveCard/recurringbytoken = true (tokenize)
  │       - webhookUrl, redirectUrl
  │    4. Create subscription_payment (status: 'pending')
  │    5. Return { paymentUrl }
  │
  ├─ Client redirected to payment page
  │
  ├─ Webhook arrives (success):
  │    1. Verify signature
  │    2. Update subscription_payment (status: 'success')
  │    3. Save card token (encrypted)
  │    4. Update subscription:
  │       status: 'active'
  │       provider: chosen
  │       current_period_start: NOW()
  │       current_period_end: NOW() + 30 days
  │    5. Cancel trial-end job
  │    6. Schedule next billing job (in 30 days)
  │    7. Notify master: "Підписку активовано!"
  │
  └─ Webhook arrives (failed):
       1. Update subscription_payment (status: 'failed')
       2. Notify master: "Оплата не пройшла"
       3. No state change (still trial)
```

### 3. Monthly Renewal (Auto-charge)

```
BullMQ cron job: 'charge-subscription'
  runs at: current_period_end
  │
  ├─ Get subscription + card_token
  ├─ Get exchange rate USD→UAH
  ├─ Charge card token:
  │    Monobank: POST /api/merchant/wallet/payment
  │    LiqPay:   POST /api/request { action: 'pay', card_token }
  │
  ├─ Create subscription_payment record
  │
  ├─ Success:
  │    1. subscription_payment.status = 'success'
  │    2. subscription:
  │       current_period_start = NOW()
  │       current_period_end = NOW() + 30 days
  │    3. Schedule next billing (30 days)
  │    4. Notify: "Підписку продовжено на наступний місяць"
  │
  └─ Failed:
       1. subscription_payment.status = 'failed'
       2. subscription:
          status = 'past_due'
          grace_ends_at = NOW() + 7 days
       3. Schedule retry job (attempt 2, delay: 24h)
       4. Notify: "Оплата не пройшла. Спробуємо ще раз через 24 години."
```

### 4. Payment Retry (Grace Period)

```
Grace period: 7 days, 3 attempts total

Day 0: First charge failed → status = past_due
Day 1: Retry attempt 2
Day 3: Retry attempt 3
Day 7: Grace period ends → status = expired

BullMQ job: 'retry-subscription-payment'
  │
  ├─ Charge card token again
  │
  ├─ Success:
  │    1. subscription.status = 'active'
  │    2. subscription.grace_ends_at = NULL
  │    3. current_period_start/end updated
  │    4. Schedule next billing
  │    5. Notify: "Оплату проведено успішно!"
  │
  └─ Failed:
       ├─ attempt < 3:
       │    Schedule next retry (delay: 48h)
       │    Notify: "Оплата не пройшла. Наступна спроба через 2 дні."
       │
       └─ attempt = 3:
            Schedule expiration job (at grace_ends_at)
            Notify: "Останню спробу оплати не вдалось. Оновіть картку до {date}."
```

### 5. Subscription Expiration

```
BullMQ job: 'expire-subscription'
  runs at: grace_ends_at
  │
  ├─ subscription.status = 'expired'
  ├─ subscription.card_token = NULL (clear)
  ├─ Notify master:
  │    "Підписка закінчилась. Ваш бот працює в режимі
  │     перегляду. Оновіть підписку для повного доступу."
  │
  └─ Bot mini app → read-only mode
```

### 6. Reactivation (from expired)

```
Master clicks "Subscribe" when expired:
  │
  ├─ Same flow as first payment (Step 2)
  ├─ New card tokenization required
  ├─ On success:
  │    status: 'active'
  │    new period_start/period_end
  │    Full access restored
  │
  └─ Bot resumes normal operation
```

### 7. Voluntary Cancellation

```
Master clicks "Cancel Subscription":
  │
  ├─ POST /subscription/cancel
  │
  ├─ subscription:
  │    cancelled_at = NOW()
  │    (status remains 'active' until period end!)
  │
  ├─ Cancel next billing job
  │
  ├─ Schedule expiration at current_period_end
  │
  ├─ Notify: "Підписку скасовано. Доступ збережеться до {period_end}."
  │
  └─ At period_end:
       status = 'expired'
       Read-only mode
```

---

## Notification Timeline

| Момент | Сповіщення (UK) | Сповіщення (EN) |
|---|---|---|
| Trial день 5 | 🔔 Ваш пробний період закінчується через 2 дні. Оформіть підписку! | 🔔 Your trial ends in 2 days. Subscribe now! |
| Trial день 6 | ⚠️ Завтра закінчується пробний період. Після цього бот перейде в режим перегляду. | ⚠️ Trial ends tomorrow. Bot will switch to read-only mode. |
| Trial закінчився | 🔴 Пробний період закінчився. Оформіть підписку для продовження роботи. | 🔴 Trial ended. Subscribe to continue. |
| Оплата успішна | ✅ Підписку активовано! Наступна оплата: {next_date} | ✅ Subscription activated! Next payment: {next_date} |
| Оплата не пройшла | ❌ Оплата не пройшла. Спробуємо ще раз через 24 години. | ❌ Payment failed. Will retry in 24 hours. |
| Retry 2 failed | ❌ Повторна оплата не пройшла. Наступна спроба через 2 дні. | ❌ Retry failed. Next attempt in 2 days. |
| Last retry failed | 🚨 Останню спробу оплати не вдалось. Оновіть картку до {grace_end}. | 🚨 Final retry failed. Update card by {grace_end}. |
| Expired | 🔴 Підписка закінчилась. Бот працює в режимі перегляду. | 🔴 Subscription expired. Bot in read-only mode. |
| Renewed | ✅ Підписку продовжено! Наступна оплата: {next_date} | ✅ Subscription renewed! Next payment: {next_date} |
| Cancelled | ℹ️ Підписку скасовано. Доступ до {period_end}. | ℹ️ Subscription cancelled. Access until {period_end}. |

---

## BullMQ Jobs

| Job Name | Queue | Trigger | Data |
|---|---|---|---|
| `check-trial-end` | subscriptions | Delayed (7d) | { subscriptionId } |
| `trial-reminder` | subscriptions | Delayed (5d, 6d) | { subscriptionId, daysLeft } |
| `charge-subscription` | subscriptions | Delayed (30d) | { subscriptionId } |
| `retry-subscription-payment` | subscriptions | Delayed (24h/48h) | { subscriptionId, attempt } |
| `expire-subscription` | subscriptions | Delayed (grace_ends_at) | { subscriptionId } |
| `subscription-reminder` | notifications | Delayed | { tenantId, type } |

### Job Options

```typescript
{
  attempts: 1,                    // billing jobs should NOT auto-retry
  removeOnComplete: { age: 604800 }, // 7 days
  removeOnFail: { age: 2592000 },    // 30 days (for debugging)
}
```

---

## Exchange Rate Service

```typescript
@Injectable()
class ExchangeRateService {
  // Monobank public API (no auth needed)
  private readonly API_URL = 'https://api.monobank.ua/bank/currency';
  private readonly CACHE_TTL = 3600; // 1 hour
  
  async getUsdToUah(): Promise<number> {
    // Check Redis cache first
    const cached = await this.redis.get('exchange:USD:UAH');
    if (cached) return parseFloat(cached);
    
    // Fetch from Monobank
    const rates = await fetch(this.API_URL);
    const usdUah = rates.find(r => 
      r.currencyCodeA === 840 && r.currencyCodeB === 980
    );
    
    const rate = usdUah.rateSell; // e.g., 41.50
    await this.redis.setex('exchange:USD:UAH', this.CACHE_TTL, rate.toString());
    
    return rate;
  }
  
  async convertUsdToUah(amountUsd: number): Promise<{
    amountUah: number;
    rate: number;
  }> {
    const rate = await this.getUsdToUah();
    return {
      amountUah: Math.round(amountUsd * rate * 100) / 100,
      rate,
    };
  }
}
```

---

## Edge Cases

| Кейс | Рішення |
|---|---|
| Card declined permanently | After 3 retries → expired. Master re-subscribes with new card |
| Exchange rate changes between display and charge | Use rate at charge time. Store in subscription_payments.exchange_rate |
| Double webhook | Idempotent: check subscription_payments.provider_payment_id uniqueness |
| Master changes provider | Cancel current → new checkout with new provider → new tokenization |
| Refund request | Manual via admin panel. Provider refund API + update subscription_payment |
| Trial abuse (re-registration) | Check users.telegram_id → deny if has expired tenant |
| Server downtime during billing | BullMQ persists jobs in Redis. On restart, jobs execute |
| Timezone issues | All dates in UTC. Display converted per user timezone (from Telegram) |
