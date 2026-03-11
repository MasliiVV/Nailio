# 🗄 Схема бази даних

> Повна ER-модель системи Manik. PostgreSQL, shared database, multi-tenant з `tenant_id`.

---

## Загальні принципи

- **Primary Keys**: UUID v4 для всіх таблиць
- **Timestamps**: `TIMESTAMPTZ` (UTC) для всіх часових полів
- **Суми грошей**: `INTEGER` у найменших одиницях (копійки для UAH, центи для USD)
- **Soft delete**: через `is_active` поле замість фізичного видалення
- **Tenant isolation**: `tenant_id` на кожній таблиці (крім `users` — глобальна)
- **Enum types**: PostgreSQL native ENUM для статусів
- **JSONB**: для гнучких структур (branding, settings, tags)

---

## ER-діаграма (текстова)

```
users (global)
  │
  ├──→ masters ──→ tenants
  │                  │
  └──→ clients ──────┤
                     │
       ┌─────────────┼─────────────────┐
       │             │                 │
    services    working_hours     bookings
       │                           │   │
       │                    transactions│
       │                              │
       │                        notifications
       │
  payment_settings
       
  subscriptions ──→ subscription_payments

  analytics_daily
  audit_logs
  bots
```

---

## Таблиці

### 1. `users` — Глобальна таблиця аутентифікації

> Зберігає Telegram-ідентичність користувача. **Без tenant_id** — один user може бути клієнтом у кількох майстрів.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Унікальний ідентифікатор |
| `telegram_id` | BIGINT | UNIQUE, NOT NULL | Telegram user ID |
| `language_code` | VARCHAR(5) | DEFAULT 'uk' | Мова користувача (з Telegram) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Дата створення |

**Індекси:**
- `UNIQUE (telegram_id)` — швидкий пошук при auth

**Зв'язки:**
- `users.id` → `masters.user_id` (1:N, один user може бути master в одному tenant)
- `users.id` → `clients.user_id` (1:N, один user може бути client у багатьох tenants)

---

### 2. `tenants` — Акаунти майстрів (tenants)

> Кожен tenant = один майстер. Зберігає налаштування, брендування, статус онбордингу.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | Унікальний ідентифікатор |
| `slug` | VARCHAR(50) | UNIQUE, NOT NULL | URL-safe ідентифікатор (для start_param) |
| `display_name` | VARCHAR(100) | NOT NULL | Назва для відображення (ім'я майстра/салону) |
| `phone` | VARCHAR(20) | | Контактний телефон |
| `email` | VARCHAR(255) | | Email для білінгу |
| `timezone` | VARCHAR(50) | DEFAULT 'Europe/Kyiv' | Часовий пояс (IANA) |
| `locale` | VARCHAR(5) | DEFAULT 'uk' | Мова інтерфейсу за замовчуванням |
| `logo_url` | VARCHAR(500) | | URL логотипу (S3/MinIO) |
| `branding` | JSONB | DEFAULT '{}' | Кольори, тексти, контакти (див. структуру нижче) |
| `settings` | JSONB | DEFAULT '{}' | Налаштування (slot_step, cancellation policy) |
| `onboarding_status` | ENUM | DEFAULT 'pending_bot' | pending_bot / bot_connected / setup_complete |
| `onboarding_checklist` | JSONB | DEFAULT '{}' | Трекінг прогресу онбордингу |
| `trial_ends_at` | TIMESTAMPTZ | | Дата закінчення trial |
| `is_active` | BOOLEAN | DEFAULT true | Чи активний акаунт |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (slug)` — для резолвінгу tenant з start_param

**Структура `branding` JSONB:**
```json
{
  "primary_color": "#E91E63",
  "secondary_color": "#FCE4EC",
  "accent_color": "#AD1457",
  "background_color": "#FFFFFF",
  "welcome_text": {
    "uk": "Ласкаво просимо!",
    "en": "Welcome!"
  },
  "description": {
    "uk": "Професійний манікюр та педикюр",
    "en": "Professional manicure and pedicure"
  },
  "contacts": {
    "instagram": "@master_nails",
    "phone": "+380501234567",
    "address": "вул. Хрещатик 1, Київ"
  }
}
```

**Структура `settings` JSONB:**
```json
{
  "slot_step_minutes": 30,
  "cancellation_window_hours": 2,
  "allow_client_reschedule": true
}
```

**Структура `onboarding_checklist` JSONB:**
```json
{
  "has_services": false,
  "has_schedule": false,
  "has_branding": false,
  "has_shared_link": false
}
```

---

### 3. `masters` — Записи майстрів

> Зв'язок між user (auth) та tenant. Один tenant = один master.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, UNIQUE, NOT NULL | Один master на tenant |
| `user_id` | UUID | FK→users, NOT NULL | Зв'язок з auth-записом |
| `first_name` | VARCHAR(100) | NOT NULL | Ім'я |
| `last_name` | VARCHAR(100) | | Прізвище |
| `phone` | VARCHAR(20) | | Телефон |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (tenant_id)` — один master per tenant
- `INDEX (user_id)` — пошук tenant по user

---

### 4. `bots` — Telegram боти

> Кожен tenant має одного бота. Токен зберігається зашифрованим (AES-256-GCM).

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `bot_id` | BIGINT | UNIQUE, NOT NULL | Telegram numeric ID бота (з getMe) |
| `bot_token_encrypted` | BYTEA | NOT NULL | AES-256-GCM зашифрований токен |
| `bot_username` | VARCHAR(100) | UNIQUE, NOT NULL | @username бота |
| `webhook_secret` | VARCHAR(256) | NOT NULL | Secret для верифікації webhook |
| `is_active` | BOOLEAN | DEFAULT true | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (bot_username)` — глобальна унікальність
- `UNIQUE (bot_id)` — для auth flow
- `INDEX (tenant_id)` — пошук бота по tenant

---

### 5. `clients` — CRM-записи клієнтів

> Tenant-scoped запис клієнта. Один user може мати записи у кількох tenants.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `user_id` | UUID | FK→users, NOT NULL | Зв'язок з auth-записом |
| `first_name` | VARCHAR(100) | NOT NULL | Ім'я |
| `last_name` | VARCHAR(100) | | Прізвище |
| `phone` | VARCHAR(20) | | Телефон |
| `notes` | TEXT | | Нотатки майстра про клієнта |
| `tags` | JSONB | DEFAULT '[]' | Теги для сегментації |
| `is_blocked` | BOOLEAN | DEFAULT false | Заблокований майстром |
| `bot_blocked` | BOOLEAN | DEFAULT false | Клієнт заблокував бота |
| `last_visit_at` | TIMESTAMPTZ | | Дата останнього візиту |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (tenant_id, user_id)` — один client-запис per tenant per user
- `INDEX (tenant_id, phone)` — пошук по телефону
- `INDEX (tenant_id, created_at)` — сортування по даті

---

### 6. `services` — Послуги

> Послуги, які надає майстер. Soft-delete через `is_active`.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `name` | VARCHAR(200) | NOT NULL | Назва послуги |
| `description` | TEXT | | Опис для клієнта |
| `duration_minutes` | INTEGER | NOT NULL | Тривалість у хвилинах |
| `price` | INTEGER | NOT NULL | Ціна в копійках |
| `currency` | VARCHAR(3) | DEFAULT 'UAH' | Валюта (ISO 4217) |
| `buffer_minutes` | INTEGER | DEFAULT 0 | Буфер після послуги (прибирання, підготовка) |
| `category` | VARCHAR(100) | | Категорія (манікюр, педикюр, etc.) |
| `color` | VARCHAR(7) | | Колір для календаря (#HEX) |
| `sort_order` | INTEGER | DEFAULT 0 | Порядок відображення |
| `is_active` | BOOLEAN | DEFAULT true | Активна чи архівована |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (tenant_id, is_active, sort_order)` — список послуг для клієнта

**Бізнес-правила:**
- При деактивації (`is_active = false`) — перевірити чи немає майбутніх букінгів з цією послугою
- Фізичне видалення заборонене (є FK з bookings)

---

### 7. `working_hours` — Регулярний графік роботи

> Повторюваний тижневий графік. Дні без записів у таблиці = вихідні.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `day_of_week` | INTEGER | NOT NULL, CHECK (0-6) | 0=Понеділок, 6=Неділя |
| `start_time` | TIME | NOT NULL | Початок робочого дня |
| `end_time` | TIME | NOT NULL | Кінець робочого дня |

**Індекси:**
- `INDEX (tenant_id, day_of_week)`
- `UNIQUE (tenant_id, day_of_week)` — один запис на день тижня

**Бізнес-правила:**
- Час інтерпретується в timezone tenant'а (`tenants.timezone`)
- Відсутність запису для дня = вихідний
- `end_time` > `start_time` (constraint)

---

### 8. `working_hour_overrides` — Виключення з графіку

> Конкретні дати: зміна графіку або позначення вихідного.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `date` | DATE | NOT NULL | Конкретна дата |
| `start_time` | TIME | | Початок (NULL якщо вихідний) |
| `end_time` | TIME | | Кінець (NULL якщо вихідний) |
| `is_day_off` | BOOLEAN | DEFAULT false | Вихідний день |

**Індекси:**
- `UNIQUE (tenant_id, date)` — один override per date

**Бізнес-правила:**
- Якщо `is_day_off = true` → `start_time` і `end_time` ігноруються
- Override має пріоритет над `working_hours`

---

### 9. `bookings` — Записи (бронювання)

> Основна бізнес-сутність. Запис клієнта до майстра на конкретну послугу та час.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `client_id` | UUID | FK→clients, NOT NULL | |
| `service_id` | UUID | FK→services, NOT NULL | |
| `service_name_snapshot` | VARCHAR(200) | NOT NULL | Назва послуги на момент запису |
| `price_at_booking` | INTEGER | NOT NULL | Ціна на момент запису (копійки) |
| `duration_at_booking` | INTEGER | NOT NULL | Тривалість на момент запису (хв) |
| `start_time` | TIMESTAMPTZ | NOT NULL | Початок запису |
| `end_time` | TIMESTAMPTZ | NOT NULL | Кінець запису (включно з buffer) |
| `status` | ENUM | NOT NULL, DEFAULT 'pending' | pending / confirmed / completed / cancelled / no_show |
| `notes` | TEXT | | Коментар до запису |
| `created_by` | ENUM | NOT NULL | master / client |
| `cancelled_at` | TIMESTAMPTZ | | Коли скасовано |
| `cancel_reason` | VARCHAR(500) | | Причина скасування |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (tenant_id, start_time)` — календар, пошук по даті
- `INDEX (tenant_id, client_id)` — історія клієнта
- `INDEX (tenant_id, status, start_time)` — фільтрація по статусу

**Constraints:**
```sql
-- Захист від подвійного букінгу (потребує btree_gist extension)
EXCLUDE USING gist (
  tenant_id WITH =,
  tstzrange(start_time, end_time) WITH &&
) WHERE (status NOT IN ('cancelled'))
```

**Бізнес-правила:**
- `service_name_snapshot`, `price_at_booking`, `duration_at_booking` — знімок на момент створення, НЕ змінюється при зміні послуги
- `end_time` = `start_time` + `duration_minutes` + `buffer_minutes`
- При скасуванні: `status → cancelled`, `cancelled_at = NOW()`
- Transition rules: `pending → confirmed → completed`, `pending/confirmed → cancelled`, `confirmed → no_show`

**ENUM `booking_status`:**
```sql
CREATE TYPE booking_status AS ENUM (
  'pending',    -- створено, очікує підтвердження
  'confirmed',  -- підтверджено майстром
  'completed',  -- візит відбувся
  'cancelled',  -- скасовано
  'no_show'     -- клієнт не прийшов
);
```

**ENUM `booking_creator`:**
```sql
CREATE TYPE booking_creator AS ENUM ('master', 'client');
```

---

### 10. `transactions` — Фінансові операції

> Записи про оплату послуг клієнтами (не підписки SaaS).

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `booking_id` | UUID | FK→bookings, NULL | Зв'язок з букінгом (NULL для ручних) |
| `client_id` | UUID | FK→clients, NOT NULL | |
| `amount` | INTEGER | NOT NULL | Сума в копійках |
| `currency` | VARCHAR(3) | DEFAULT 'UAH' | Валюта |
| `payment_method` | ENUM | NOT NULL | cash / card / online |
| `status` | ENUM | NOT NULL, DEFAULT 'pending' | pending / completed / refunded |
| `external_transaction_id` | VARCHAR(255) | | ID у зовнішній системі (Mono/LiqPay) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (tenant_id, created_at)` — фінансові звіти
- `INDEX (tenant_id, booking_id)` — пошук оплати по букінгу

---

### 11. `notifications` — Повідомлення

> Трекінг усіх надісланих Telegram-повідомлень.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `booking_id` | UUID | FK→bookings, NOT NULL | |
| `client_id` | UUID | FK→clients, NOT NULL | |
| `type` | ENUM | NOT NULL | confirmation / reminder_24h / reminder_1h / cancellation / reschedule / new_booking |
| `channel` | ENUM | DEFAULT 'telegram' | telegram |
| `status` | ENUM | DEFAULT 'pending' | pending / sent / failed / cancelled |
| `job_id` | VARCHAR(255) | | BullMQ job ID (для скасування) |
| `message_text` | TEXT | | Текст надісланого повідомлення |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL | Коли має бути надіслано |
| `sent_at` | TIMESTAMPTZ | | Коли фактично надіслано |
| `error` | TEXT | | Текст помилки (якщо failed) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (status, scheduled_at)` — черга на відправку
- `INDEX (tenant_id, booking_id)` — нотифікації по букінгу

---

### 12. `subscriptions` — Підписки SaaS

> Підписка майстра на платформу. Один tenant = одна підписка.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, UNIQUE, NOT NULL | |
| `status` | ENUM | NOT NULL, DEFAULT 'trial' | trial / active / past_due / cancelled / expired |
| `payment_provider` | ENUM | | monobank / liqpay |
| `card_token_encrypted` | BYTEA | | Токен картки для recurring (зашифрований) |
| `card_last_four` | VARCHAR(4) | | Останні 4 цифри картки (для UI) |
| `wallet_id` | VARCHAR(255) | | Monobank wallet ID або LiqPay order ID |
| `amount` | INTEGER | | Сума списання (копійки UAH) |
| `currency` | VARCHAR(3) | DEFAULT 'UAH' | |
| `current_period_start` | TIMESTAMPTZ | | Початок поточного періоду |
| `current_period_end` | TIMESTAMPTZ | | Кінець поточного періоду |
| `retry_count` | INTEGER | DEFAULT 0 | Кількість спроб retry |
| `cancel_reason` | VARCHAR(500) | | Причина скасування |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (tenant_id)` — одна підписка per tenant
- `INDEX (status, current_period_end)` — cron job для charge/expire

**ENUM `subscription_status`:**
```sql
CREATE TYPE subscription_status AS ENUM (
  'trial',      -- пробний період (7 днів)
  'active',     -- оплачено, все працює
  'past_due',   -- оплата не пройшла, grace period
  'cancelled',  -- скасовано майстром
  'expired'     -- grace period закінчився → read-only mode
);
```

---

### 13. `subscription_payments` — Платежі за підписку

> Історія всіх платежів за SaaS підписку.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `subscription_id` | UUID | FK→subscriptions, NOT NULL | |
| `payment_provider` | ENUM | NOT NULL | monobank / liqpay |
| `external_id` | VARCHAR(255) | | ID транзакції у провайдера |
| `amount` | INTEGER | NOT NULL | Сума (копійки) |
| `currency` | VARCHAR(3) | DEFAULT 'UAH' | |
| `exchange_rate` | DECIMAL(10,4) | | Курс USD→UAH на момент оплати |
| `status` | ENUM | NOT NULL, DEFAULT 'pending' | pending / success / failed |
| `failure_reason` | VARCHAR(500) | | Причина помилки |
| `paid_at` | TIMESTAMPTZ | | Дата успішної оплати |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (subscription_id, created_at)` — історія платежів

---

### 14. `payment_settings` — Налаштування оплати послуг

> Майстер може підключити свій Monobank або LiqPay для прийому оплат від клієнтів.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, UNIQUE, NOT NULL | |
| `provider` | ENUM | NOT NULL | monobank / liqpay |
| `api_token_encrypted` | BYTEA | NOT NULL | Зашифрований Mono X-Token або LiqPay public_key |
| `api_secret_encrypted` | BYTEA | | LiqPay private_key (NULL для Monobank) |
| `is_active` | BOOLEAN | DEFAULT true | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `UNIQUE (tenant_id)` — одне налаштування per tenant

---

### 15. `analytics_daily` — Щоденна агрегована аналітика

> Pre-aggregated дані для dashboard. Оновлюється cron job щоденно.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | FK→tenants, NOT NULL | |
| `date` | DATE | NOT NULL | Дата |
| `total_bookings` | INTEGER | DEFAULT 0 | Всього записів |
| `completed` | INTEGER | DEFAULT 0 | Завершених |
| `cancelled` | INTEGER | DEFAULT 0 | Скасованих |
| `no_shows` | INTEGER | DEFAULT 0 | Не прийшли |
| `revenue` | INTEGER | DEFAULT 0 | Дохід (копійки) |
| `new_clients` | INTEGER | DEFAULT 0 | Нових клієнтів |

**Індекси:**
- `UNIQUE (tenant_id, date)` — один запис per day per tenant

**Оновлення:**
- Щоденний BullMQ cron job о 02:00 за timezone tenant → recompute вчорашній рядок
- Інкрементальне оновлення при зміні статусу букінгу (для near-real-time dashboard)

---

### 16. `audit_logs` — Журнал аудиту

> Логування всіх важливих дій у системі.

| Поле | Тип | Constraints | Опис |
|---|---|---|---|
| `id` | UUID | PK | |
| `tenant_id` | UUID | NULL | NULL для platform-level дій |
| `actor_type` | ENUM | NOT NULL | master / client / system / admin |
| `actor_id` | UUID | | ID того, хто виконав дію |
| `action` | VARCHAR(100) | NOT NULL | booking.created, client.updated, etc. |
| `entity_type` | VARCHAR(50) | NOT NULL | booking, client, service, etc. |
| `entity_id` | UUID | | ID сутності |
| `changes` | JSONB | DEFAULT '{}' | Що змінилося (old → new) |
| `ip` | VARCHAR(45) | | IP адреса |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Індекси:**
- `INDEX (tenant_id, created_at)` — фільтр по tenant і часу
- `INDEX (entity_type, entity_id)` — історія конкретної сутності

---

## Повний список ENUM типів

```sql
CREATE TYPE onboarding_status AS ENUM ('pending_bot', 'bot_connected', 'setup_complete');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE booking_creator AS ENUM ('master', 'client');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'online');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded');
CREATE TYPE notification_type AS ENUM ('confirmation', 'reminder_24h', 'reminder_1h', 'cancellation', 'reschedule', 'new_booking');
CREATE TYPE notification_channel AS ENUM ('telegram');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE subscription_payment_status AS ENUM ('pending', 'success', 'failed');
CREATE TYPE payment_provider AS ENUM ('monobank', 'liqpay');
CREATE TYPE actor_type AS ENUM ('master', 'client', 'system', 'admin');
```

---

## Необхідні PostgreSQL розширення

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist";      -- для EXCLUDE constraint на bookings
```

---

## Міграційна стратегія

- **ORM**: Prisma з `prisma migrate`
- **Порядок створення**: таблиці без FK → таблиці з FK (users → tenants → masters/clients → services → bookings → ...)
- **Seed data**: тестовий tenant, master, services, working_hours для dev
- **Naming**: snake_case для таблиць і колонок
