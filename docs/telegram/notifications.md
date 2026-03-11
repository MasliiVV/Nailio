# 🔔 Notifications

> Система нагадувань через Telegram. Типи, шаблони, BullMQ jobs, retry, edge cases.

---

## Канал доставки

**Тільки Telegram** — клієнти гарантовано мають Telegram (прийшли через Mini App). SMS не використовується.

Повідомлення надсилаються через Bot API конкретного бота майстра (`sendMessage`).

---

## Типи нотифікацій

| Тип | Кому | Коли | Trigger |
|---|---|---|---|
| `confirmation` | Клієнту | Одразу при створенні букінгу | Booking created |
| `new_booking` | Майстру | Одразу при створенні (клієнтом) | Booking created by client |
| `reminder_24h` | Клієнту | За 24 год до запису | Delayed job |
| `reminder_1h` | Клієнту | За 1 год до запису | Delayed job |
| `cancellation` | Клієнту / Майстру | Одразу при скасуванні | Booking cancelled |
| `reschedule` | Клієнту | Одразу при перенесенні | Booking rescheduled |

---

## Шаблони повідомлень (uk/en)

### Confirmation (клієнту)

**uk:**
```
✅ Запис підтверджено!

📋 {serviceName}
📅 {date} о {time}
⏱ {duration} хв
💰 {price} грн

Якщо потрібно скасувати — зробіть це не пізніше ніж за {cancellationWindow} год.
```

**en:**
```
✅ Booking confirmed!

📋 {serviceName}
📅 {date} at {time}
⏱ {duration} min
💰 {price} UAH

To cancel, please do so at least {cancellationWindow} hours in advance.
```

### New Booking (майстру)

**uk:**
```
📅 Новий запис!

👤 {clientName}
📋 {serviceName}
📅 {date} о {time}
📱 {clientPhone}
```

### Reminder 24h (клієнту)

**uk:**
```
🔔 Нагадування

Завтра у вас запис:
📋 {serviceName}
📅 {date} о {time}

До зустрічі! 💅
```

**en:**
```
🔔 Reminder

You have an appointment tomorrow:
📋 {serviceName}
📅 {date} at {time}

See you! 💅
```

### Reminder 1h (клієнту)

**uk:**
```
⏰ Через 1 годину у вас запис:

📋 {serviceName}
📅 Сьогодні о {time}
```

### Cancellation (клієнту)

**uk:**
```
❌ Запис скасовано

📋 {serviceName}
📅 {date} о {time}

Причина: {reason}

Щоб записатися знову, натисніть кнопку нижче.
```

### Cancellation (майстру)

**uk:**
```
❌ Клієнт скасував запис

👤 {clientName}
📋 {serviceName}
📅 {date} о {time}
Причина: {reason}
```

---

## Архітектура (BullMQ)

```
┌───────────────┐     ┌──────────────┐     ┌───────────────┐
│  API Server   │     │    Redis     │     │  Worker       │
│               │     │   (BullMQ)   │     │               │
│  Booking      │     │              │     │  Notification │
│  created      │────>│  Queue:      │────>│  Processor    │
│               │     │  notifications│    │               │
│  Booking      │     │              │     │  1. Check     │
│  cancelled    │────>│  Delayed     │     │     booking   │
│               │     │  jobs for    │     │     status    │
│               │     │  reminders   │     │  2. Check     │
│               │     │              │     │     bot_blocked│
└───────────────┘     └──────────────┘     │  3. Render    │
                                            │     template  │
                                            │  4. Send via  │
                                            │     Bot API   │
                                            │  5. Update    │
                                            │     status    │
                                            └───────────────┘
```

### Job Creation (при створенні букінгу)

```
Booking created at 2026-03-15T14:00:00+02:00

→ Job 1: confirmation (delay: 0, immediate)
  → Send confirmation to client
  → Send new_booking to master

→ Job 2: reminder_24h (delay: until 2026-03-14T14:00:00+02:00)
  → Scheduled to fire 24h before

→ Job 3: reminder_1h (delay: until 2026-03-15T13:00:00+02:00)
  → Scheduled to fire 1h before
```

### Job Processing

```
Worker picks up job:
  1. Load booking from DB (with client + tenant + bot)
  2. Check booking.status:
     - If 'cancelled' → mark notification as 'cancelled', skip
  3. Check client.bot_blocked:
     - If true → mark notification as 'cancelled', skip
  4. Determine language:
     - client → users.language_code → 'uk' or 'en' (fallback: 'uk')
  5. Render template with variables
  6. Decrypt bot_token (from Redis cache or DB)
  7. Call Telegram Bot API sendMessage
  8. Handle response:
     - 200 OK → notification.status = 'sent', sent_at = NOW()
     - 403 → client.bot_blocked = true, notification.status = 'failed'
     - 429 → retry after retry_after seconds
     - Other error → notification.status = 'failed', notification.error = message
```

---

## Retry Strategy

| Параметр | Значення |
|---|---|
| Max attempts | 3 |
| Backoff type | Exponential |
| Initial delay | 30 sec |
| Delays | 30s → 60s → 120s |
| Non-retryable errors | 403 (bot blocked), 400 (bad request) |

---

## Edge Cases

### 1. Букінг скасовано після створення reminder jobs

```
Booking cancelled
  → Remove all pending BullMQ jobs for this booking (by job_id from notifications table)
  → Mark pending notifications as 'cancelled'
  → Create new cancellation notification job (immediate)
```

### 2. Клієнт заблокував бота

```
sendMessage returns 403 Forbidden
  → client.bot_blocked = true
  → notification.status = 'failed'
  → Stop scheduling future notifications for this client+tenant
  → If client opens Mini App again → bot_blocked resets to false
```

### 3. Language fallback

```
client.language_code:
  'uk' → Ukrainian template
  'en' → English template
  'ru' → Ukrainian template (fallback)
  null → Ukrainian template (fallback)
  any other → Ukrainian template (fallback)
```

### 4. Expired subscription

```
Subscription expired → read-only mode
  BUT: notifications for existing bookings CONTINUE to fire
  Only creation of NEW bookings (and their notifications) is blocked
```

### 5. Master deletes their Telegram message history

Не впливає на роботу нотифікацій — `sendMessage` працює незалежно від історії.

---

## Моніторинг

| Метрика | Алерт |
|---|---|
| Failed notifications rate | > 5% за годину |
| Queue depth | > 1000 pending jobs |
| Processing time | > 5 sec per job |
| Bot blocked rate | > 10% за тиждень (per tenant) |

---

## Subscription Reminders (Billing)

Окремі нотифікації для майстра про підписку:

| День | Повідомлення |
|---|---|
| Trial day 5 | "⏳ Ваш пробний період закінчується через 2 дні. Оформіть підписку, щоб продовжити роботу." |
| Trial day 7 | "⚠️ Пробний період закінчився. Оформіть підписку для продовження." |
| Grace day 1 | "💳 Оплата не пройшла. Ми спробуємо ще раз." |
| Grace day 4 | "⚠️ Останній шанс оплатити підписку. Через 3 дні акаунт буде обмежено." |
| Grace day 7 | "🔒 Ваш акаунт переведено в режим перегляду. Оплатіть підписку для відновлення." |
