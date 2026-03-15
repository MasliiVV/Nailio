# 📋 API Endpoints

> Повний список endpoints з параметрами, ролями та форматом відповідей.

---

## Позначення

- 🔓 Public (без auth)
- 🔑 Authenticated (JWT required)
- 👤 Client only
- 👑 Master only
- 🛡 Admin only
- ⚡ Requires active subscription

---

## Auth

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/api/v1/auth/telegram` | 🔓 | Telegram Mini App аутентифікація |
| POST | `/api/v1/auth/refresh` | 🔓 | Оновити access token |
| POST | `/api/v1/auth/logout` | 🔑 | Видалити refresh token |

### POST `/api/v1/auth/telegram`

**Request:**
```json
{
  "initData": "auth_date=1741689600&hash=abc...&user=%7B%22id%22...",
  "startParam": "master-slug"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "550e8400-e29b...",
    "role": "client",
    "needsOnboarding": false,
    "profile": {
      "id": "uuid",
      "firstName": "Олена",
      "lastName": "Ковальчук",
      "phone": "+380501234567"
    },
    "tenant": {
      "id": "uuid",
      "displayName": "Манікюр Олена",
      "logoUrl": "https://...",
      "branding": { ... }
    }
  }
}
```

---

## Profile

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/profile` | 🔑 | Отримати свій профіль |
| PUT | `/api/v1/profile` | 🔑 | Оновити свій профіль |

---

## Client Onboarding

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/api/v1/clients/onboarding` | 🔑👤 | Завершити реєстрацію клієнта |

**Request:**
```json
{
  "firstName": "Марія",
  "lastName": "Петренко",
  "phone": "+380671234567"
}
```

---

## Services (Послуги)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/services` | 🔑 | Список послуг (active only для client) |
| POST | `/api/v1/services` | 🔑👑⚡ | Створити послугу |
| GET | `/api/v1/services/:id` | 🔑 | Деталі послуги |
| PUT | `/api/v1/services/:id` | 🔑👑⚡ | Оновити послугу |
| DELETE | `/api/v1/services/:id` | 🔑👑⚡ | Деактивувати послугу (soft delete) |

### GET `/api/v1/services`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Класичний манікюр",
      "description": "Манікюр з покриттям гель-лаком",
      "durationMinutes": 60,
      "price": 80000,
      "currency": "UAH",
      "category": "Манікюр",
      "color": "#E91E63",
      "sortOrder": 1,
      "isActive": true
    }
  ]
}
```

### POST `/api/v1/services`

**Request:**
```json
{
  "name": "Класичний манікюр",
  "description": "Манікюр з покриттям гель-лаком",
  "durationMinutes": 60,
  "price": 80000,
  "currency": "UAH",
  "bufferMinutes": 15,
  "category": "Манікюр",
  "color": "#E91E63"
}
```

---

## Schedule (Графік роботи)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/schedule` | 🔑 | Отримати графік (working_hours + overrides) |
| PUT | `/api/v1/schedule/hours` | 🔑👑⚡ | Оновити тижневий графік |
| POST | `/api/v1/schedule/overrides` | 🔑👑⚡ | Додати override (вихідний/зміна) |
| DELETE | `/api/v1/schedule/overrides/:id` | 🔑👑⚡ | Видалити override |

### PUT `/api/v1/schedule/hours`

**Request (повна заміна тижневого графіку):**
```json
{
  "hours": [
    { "dayOfWeek": 0, "startTime": "09:00", "endTime": "18:00" },
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "18:00" },
    { "dayOfWeek": 2, "startTime": "09:00", "endTime": "18:00" },
    { "dayOfWeek": 3, "startTime": "09:00", "endTime": "18:00" },
    { "dayOfWeek": 4, "startTime": "09:00", "endTime": "16:00" }
  ]
}
```

### POST `/api/v1/schedule/overrides`

**Request:**
```json
{
  "date": "2026-03-20",
  "isDayOff": true
}
```

або

```json
{
  "date": "2026-03-21",
  "isDayOff": false,
  "startTime": "10:00",
  "endTime": "15:00"
}
```

---

## Bookings (Записи)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/bookings/slots` | 🔑 | Доступні слоти на дату |
| GET | `/api/v1/bookings` | 🔑 | Список записів (master: всі, client: свої) |
| POST | `/api/v1/bookings` | 🔑⚡ | Створити запис |
| GET | `/api/v1/bookings/:id` | 🔑 | Деталі запису |
| PUT | `/api/v1/bookings/:id` | 🔑👑⚡ | Оновити запис (master only) |
| POST | `/api/v1/bookings/:id/cancel` | 🔑 | Скасувати запис |
| POST | `/api/v1/bookings/:id/complete` | 🔑👑 | Позначити як completed |
| POST | `/api/v1/bookings/:id/no-show` | 🔑👑 | Позначити як no-show |

### GET `/api/v1/bookings/slots`

**Query params:**
- `date` (required): `2026-03-15`
- `serviceId` (required): UUID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "date": "2026-03-15",
    "timezone": "Europe/Kyiv",
    "slots": [
      { "startTime": "09:00", "endTime": "10:00", "available": true },
      { "startTime": "10:00", "endTime": "11:00", "available": false },
      { "startTime": "11:00", "endTime": "12:00", "available": true },
      { "startTime": "13:00", "endTime": "14:00", "available": true }
    ]
  }
}
```

### GET `/api/v1/bookings`

**Query params:**
- `dateFrom` (optional): `2026-03-15`
- `dateTo` (optional): `2026-03-31`
- `status` (optional): `pending | confirmed | completed | cancelled | no_show`
- `clientId` (optional, master only): UUID
- `upcoming` (optional): `true` для майбутніх активних записів, `false` для архівних/минулих
- `cursor` (optional): UUID для пагінації
- `limit` (optional): default 20, max 100

### POST `/api/v1/bookings`

**Request (client створює запис):**
```json
{
  "serviceId": "uuid",
  "startTime": "2026-03-15T09:00:00+02:00",
  "notes": "Без дзвінка, напишіть в Telegram"
}
```

**Request (master створює запис):**
```json
{
  "clientId": "uuid",
  "serviceId": "uuid",
  "startTime": "2026-03-15T09:00:00+02:00",
  "notes": "Постійна клієнтка"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "serviceNameSnapshot": "Класичний манікюр",
    "priceAtBooking": 80000,
    "durationAtBooking": 60,
    "startTime": "2026-03-15T09:00:00+02:00",
    "endTime": "2026-03-15T10:15:00+02:00",
    "status": "pending",
    "createdBy": "client"
  }
}
```

### POST `/api/v1/bookings/:id/cancel`

**Request:**
```json
{
  "reason": "Не зможу прийти"
}
```

**Errors:**
- `422 CANCELLATION_WINDOW` — якщо до запису менше ніж `cancellation_window_hours`

---

## Clients (CRM)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/clients` | 🔑👑 | Список клієнтів (search, filter) |
| GET | `/api/v1/clients/:id` | 🔑👑 | Профіль клієнта з історією |
| PUT | `/api/v1/clients/:id` | 🔑👑⚡ | Оновити клієнта (notes, tags) |
| POST | `/api/v1/clients/:id/block` | 🔑👑⚡ | Заблокувати клієнта |
| POST | `/api/v1/clients/:id/unblock` | 🔑👑⚡ | Розблокувати клієнта |

### GET `/api/v1/clients`

**Query params:**
- `search` (optional): пошук по імені/телефону
- `cursor` (optional): для пагінації
- `limit` (optional): default 20, max 100

### GET `/api/v1/clients/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "firstName": "Марія",
    "lastName": "Петренко",
    "phone": "+380671234567",
    "notes": "Алергія на акрил",
    "tags": ["VIP", "regular"],
    "isBlocked": false,
    "lastVisitAt": "2026-03-10T14:00:00Z",
    "stats": {
      "totalBookings": 15,
      "completed": 13,
      "cancelled": 1,
      "noShows": 1,
      "totalSpent": 1200000
    },
    "recentBookings": [ ... ]
  }
}
```

---

## Analytics

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/analytics/dashboard` | 🔑👑 | Dashboard дані (today + period) |
| GET | `/api/v1/analytics/daily` | 🔑👑 | Щоденна аналітика за період |

### GET `/api/v1/analytics/dashboard`

**Query params:**
- `period`: `week` / `month` / `year`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "today": {
      "bookings": 5,
      "completed": 3,
      "revenue": 400000,
      "nextBooking": { ... }
    },
    "period": {
      "totalBookings": 120,
      "completed": 105,
      "cancelled": 10,
      "noShows": 5,
      "revenue": 9600000,
      "newClients": 15,
      "popularServices": [
        { "name": "Класичний манікюр", "count": 45 }
      ]
    }
  }
}
```

---

## Finance (Фінанси)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/finance/transactions` | 🔑👑 | Список транзакцій |
| POST | `/api/v1/finance/transactions` | 🔑👑⚡ | Записати оплату (вручну) |
| GET | `/api/v1/finance/summary` | 🔑👑 | Фінансовий звіт за період |

---

## Tenant Settings (Налаштування)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/settings` | 🔑👑 | Отримати налаштування |
| PUT | `/api/v1/settings/branding` | 🔑👑⚡ | Оновити брендування |
| PUT | `/api/v1/settings/general` | 🔑👑⚡ | Загальні налаштування |
| POST | `/api/v1/settings/logo` | 🔑👑⚡ | Завантажити логотип |

---

## Subscription (Підписка)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/subscription` | 🔑👑 | Статус підписки |
| POST | `/api/v1/subscription/checkout` | 🔑👑 | Створити платіж (redirect URL) |
| PUT | `/api/v1/subscription/card` | 🔑👑 | Змінити картку/провайдер |
| POST | `/api/v1/subscription/cancel` | 🔑👑 | Скасувати підписку |
| GET | `/api/v1/subscription/payments` | 🔑👑 | Історія платежів |

### POST `/api/v1/subscription/checkout`

**Request:**
```json
{
  "provider": "monobank"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "paymentUrl": "https://pay.mbnk.biz/p2_xxxxx",
    "invoiceId": "p2_xxxxx"
  }
}
```

---

## Master Bot Onboarding

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/api/v1/bot/connect` | 🔑👑 | Підключити Telegram бота |
| GET | `/api/v1/bot/status` | 🔑👑 | Статус бота |
| POST | `/api/v1/bot/reconnect` | 🔑👑 | Перепідключити з новим токеном |

### POST `/api/v1/bot/connect`

**Request:**
```json
{
  "botToken": "123456:ABC-DEF1234ghIkl..."
}
```

**Backend actions:**
1. Validate token via `GET /bot<TOKEN>/getMe`
2. Encrypt token (AES-256-GCM)
3. Store in `bots` table
4. Set webhook: `POST /bot<TOKEN>/setWebhook`
5. Set menu button: `POST /bot<TOKEN>/setChatMenuButton`
6. Set commands: `POST /bot<TOKEN>/setMyCommands`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "botUsername": "nails_olena_bot",
    "botId": 123456,
    "webhookSet": true,
    "miniAppUrl": "https://t.me/nails_olena_bot/app"
  }
}
```

---

## Payment Settings (Оплата послуг)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| GET | `/api/v1/payment-settings` | 🔑👑 | Поточні налаштування оплати |
| POST | `/api/v1/payment-settings` | 🔑👑⚡ | Підключити Mono/LiqPay |
| DELETE | `/api/v1/payment-settings` | 🔑👑 | Відключити онлайн-оплату |

---

## Client Payment (Оплата послуг клієнтом)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/api/v1/bookings/:id/pay` | 🔑👤 | Створити платіж за послугу |
| GET | `/api/v1/bookings/:id/payment-status` | 🔑👤 | Перевірити статус оплати |

---

## Webhooks (Internal)

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/webhook/:botId` | Telegram Secret | Telegram bot webhook |
| POST | `/webhooks/monobank` | ECDSA signature | Monobank payment callback |
| POST | `/webhooks/liqpay` | SHA1 signature | LiqPay payment callback |

---

## Admin Panel API

| Method | Endpoint | Auth | Опис |
|---|---|---|---|
| POST | `/api/admin/auth/login` | 🔓 | Admin login |
| GET | `/api/admin/tenants` | 🛡 | Список майстрів |
| POST | `/api/admin/tenants` | 🛡 | Створити майстра |
| GET | `/api/admin/tenants/:id` | 🛡 | Деталі майстра |
| PUT | `/api/admin/tenants/:id` | 🛡 | Оновити майстра |
| POST | `/api/admin/tenants/:id/block` | 🛡 | Заблокувати |
| POST | `/api/admin/tenants/:id/unblock` | 🛡 | Розблокувати |
| GET | `/api/admin/analytics` | 🛡 | Глобальна аналітика |
| GET | `/api/admin/subscriptions` | 🛡 | Статус всіх підписок |
