# 📡 API Overview

> Принципи, версіонування, формат відповідей, обробка помилок.

---

## Загальні принципи

- **Протокол:** HTTPS only
- **Формат:** JSON (Content-Type: application/json)
- **Версіонування:** URL prefix `/api/v1/`
- **Аутентифікація:** JWT Bearer token (крім public endpoints)
- **Мова помилок:** Message keys (frontend перекладає)
- **Pagination:** Cursor-based для списків
- **Sorting:** Query parameter `sort=field:asc|desc`
- **Filtering:** Query parameters per field

---

## Базова URL структура

```
https://api.platform.com/api/v1/        — Client & Master API
https://api.platform.com/api/admin/      — Admin Panel API
https://api.platform.com/webhook/{botId} — Telegram Webhooks
https://api.platform.com/webhooks/monobank — Monobank payment webhook
https://api.platform.com/webhooks/liqpay   — LiqPay payment webhook
```

---

## Формат відповідей

### Успішна відповідь

```json
{
  "success": true,
  "data": { ... }
}
```

### Успішна відповідь (список з пагінацією)

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true,
    "total": 150
  }
}
```

### Помилка

```json
{
  "success": false,
  "error": {
    "code": "SLOT_NOT_AVAILABLE",
    "message": "error.slot_not_available",
    "details": {
      "requested_time": "2026-03-15T14:00:00Z"
    }
  }
}
```

---

## HTTP Status Codes

| Code | Використання |
|---|---|
| `200 OK` | Успішний GET, PUT, PATCH |
| `201 Created` | Успішний POST (створення) |
| `204 No Content` | Успішний DELETE |
| `400 Bad Request` | Невалідні дані (validation error) |
| `401 Unauthorized` | Відсутній або невалідний JWT |
| `403 Forbidden` | Немає прав (wrong role, read-only mode) |
| `404 Not Found` | Ресурс не знайдено |
| `409 Conflict` | Конфлікт (double booking, duplicate) |
| `422 Unprocessable Entity` | Бізнес-логіка (cancellation window passed) |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Непередбачена помилка |

---

## Error Codes

| Code | Message Key | Опис |
|---|---|---|
| `AUTH_INVALID_INIT_DATA` | error.auth.invalid_init_data | initData не пройшла HMAC верифікацію |
| `AUTH_EXPIRED` | error.auth.expired | auth_date занадто старий (>5 хв) |
| `AUTH_TOKEN_EXPIRED` | error.auth.token_expired | JWT expired |
| `TENANT_NOT_FOUND` | error.tenant.not_found | Tenant з таким slug не існує |
| `TENANT_INACTIVE` | error.tenant.inactive | Tenant деактивовано |
| `SUBSCRIPTION_REQUIRED` | error.subscription.required | Потрібна активна підписка (read-only mode) |
| `SLOT_NOT_AVAILABLE` | error.booking.slot_not_available | Слот вже зайнятий |
| `BOOKING_NOT_FOUND` | error.booking.not_found | Запис не знайдено |
| `CANCELLATION_WINDOW` | error.booking.cancellation_window | Занадто пізно для скасування |
| `CLIENT_BLOCKED` | error.client.blocked | Клієнт заблокований майстром |
| `SERVICE_INACTIVE` | error.service.inactive | Послуга деактивована |
| `RATE_LIMIT_EXCEEDED` | error.rate_limit | Перевищено ліміт запитів |
| `VALIDATION_ERROR` | error.validation | Помилка валідації полів |

---

## Rate Limiting

| Scope | Limit | Window |
|---|---|---|
| Per IP (unauthenticated) | 30 req | 1 min |
| Per IP (authenticated) | 100 req | 1 min |
| Per user (auth endpoint) | 10 req | 1 min |
| Per tenant (booking create) | 30 req | 1 min |

Реалізація: Redis sliding window (`@nestjs/throttler`).

При перевищенні:
```
HTTP 429
Retry-After: 30
```

---

## Swagger / OpenAPI

- URL: `https://api.platform.com/api/docs`
- Генерується автоматично з NestJS декораторів (`@ApiProperty`, `@ApiResponse`)
- Auth: Bearer token через Swagger UI "Authorize" button
- Групування: по модулях (Auth, Bookings, Clients, etc.)
