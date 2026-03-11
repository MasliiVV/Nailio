# 🔒 Security Overview

> Загальний огляд безпеки системи. Auth, encryption, rate limiting, webhook verification, data protection.

---

## Threat Model

| Загроза | Ймовірність | Вплив | Мітигація |
|---|---|---|---|
| Cross-tenant data leak | Середня | Критичний | Prisma Extension + integration tests |
| Bot token compromise | Низька | Критичний | AES-256-GCM + env key + Redis cache |
| JWT theft | Середня | Високий | Short TTL (1 год) + refresh rotation |
| initData replay | Середня | Середній | auth_date < 5 хв |
| DDoS на webhook | Висока | Середній | Rate limiting + async processing |
| Brute force auth | Середня | Середній | Rate limiting (10 req/min per IP) |
| SQL injection | Низька | Критичний | Prisma ORM (parameterized queries) |
| XSS | Низька | Середній | React auto-escaping + input sanitization |
| Payment data theft | Низька | Критичний | Hosted payment pages (no card data on our server) |

---

## Authentication Security

### Telegram initData Validation

```
1. Parse raw initData string
2. Extract and remove 'hash' field
3. Sort remaining key-value pairs alphabetically
4. Build data_check_string (join with \n)
5. secret_key = HMAC_SHA256(bot_token, "WebAppData")
6. computed_hash = hex(HMAC_SHA256(data_check_string, secret_key))
7. Verify: computed_hash === received_hash
8. Check: NOW() - auth_date < 300 seconds (5 min)
```

**Захист від replay:** `auth_date` перевіряється — initData старше 5 хвилин відхиляється.

### JWT Security

| Параметр | Значення |
|---|---|
| Algorithm | HS256 |
| Secret | 256-bit random, env `JWT_SECRET` |
| Access TTL | 1 година |
| Refresh TTL | 30 днів |
| Refresh storage | Redis (server-side, revokable) |
| Refresh rotation | Single-use — при використанні видаляється, видається новий |
| Revocation | Видалення з Redis = instant revoke |

### Admin Auth

| Параметр | Значення |
|---|---|
| Password hashing | bcrypt (salt rounds: 12) |
| Login rate limit | 5 attempts / 15 min per IP |
| 2FA | Рекомендовано для production (TOTP) |

---

## Encryption

### Bot Tokens

| Параметр | Значення |
|---|---|
| Algorithm | AES-256-GCM |
| Key | `BOT_TOKEN_ENCRYPTION_KEY` env var (32 bytes hex) |
| Storage | `bots.bot_token_encrypted` (BYTEA) |
| IV | Random 12 bytes, stored with ciphertext |
| Auth tag | 16 bytes, stored with ciphertext |
| Decryption | Only in runtime, cached in Redis (TTL 1h) |

### Payment Credentials (Master's LiqPay/Mono)

| Параметр | Значення |
|---|---|
| Algorithm | AES-256-GCM |
| Key | `PAYMENT_ENCRYPTION_KEY` env var (окремий від bot token key) |
| Storage | `payment_settings.api_token_encrypted`, `api_secret_encrypted` |
| Decryption | Only at payment creation time, never cached |

### Key Management

- Encryption keys зберігаються в env variables (не в коді, не в БД)
- Production: рекомендується HashiCorp Vault або аналог
- Key rotation: envelope encryption pattern (data encrypted with DEK, DEK encrypted with KEK)

---

## Rate Limiting

### Implementation: `@nestjs/throttler` + Redis backend

| Endpoint Group | Limit | Window | Key |
|---|---|---|---|
| Auth (POST /auth/telegram) | 10 req | 1 min | IP |
| Auth (POST /auth/refresh) | 20 req | 1 min | IP |
| Public endpoints | 30 req | 1 min | IP |
| Authenticated (GET) | 100 req | 1 min | User ID |
| Authenticated (POST/PUT/DELETE) | 30 req | 1 min | User ID |
| Webhook (POST /webhook/*) | 200 req | 1 min | Bot ID |
| Admin | 60 req | 1 min | Admin ID |

### Nginx Level (first line of defense)

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=webhook:10m rate=100r/s;
```

### Response on limit exceeded

```
HTTP 429 Too Many Requests
Retry-After: 30

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "error.rate_limit"
  }
}
```

---

## Webhook Verification

### Telegram Webhook

```
Incoming POST /webhook/{botId}
  Header: X-Telegram-Bot-Api-Secret-Token

→ Load expected secret from DB/Redis: bots.webhook_secret
→ Compare header value with expected secret
→ If mismatch → 403 Forbidden (silent, no error body)
```

### Monobank Webhook

```
Incoming POST /webhooks/monobank
  Header: X-Sign (ECDSA signature of body)

→ Get Monobank public key: GET /api/merchant/pubkey (cached)
→ Verify ECDSA signature of request body
→ If invalid → 403 Forbidden
```

### LiqPay Webhook

```
Incoming POST /webhooks/liqpay
  Body: data=...&signature=...

→ Compute expected: Base64(SHA1(private_key + data + private_key))
→ Compare with received signature
→ If mismatch → 403 Forbidden
```

---

## Data Protection

### Personally Identifiable Information (PII)

| Дані | Де зберігається | Захист |
|---|---|---|
| Telegram ID | users.telegram_id | Не є PII (public in Telegram) |
| Ім'я/прізвище | clients.first_name/last_name | Tenant-isolated |
| Телефон | clients.phone | Tenant-isolated |
| Bot token | bots.bot_token_encrypted | AES-256-GCM |
| Payment keys | payment_settings.*_encrypted | AES-256-GCM |
| IP address | audit_logs.ip | Retention: 90 days |

### Data Isolation

1. **Prisma Extension** — автоматичний WHERE tenant_id на всіх запитах
2. **API Guards** — перевірка ownership ресурсу
3. **Integration Tests** — cross-tenant access tests

### Data Retention

| Дані | Retention |
|---|---|
| Bookings | Безстроково (business records) |
| Audit logs | 1 рік, потім archival |
| Notifications | 90 днів, потім cleanup |
| Analytics daily | Безстроково |
| Subscription payments | Безстроково (фінансові записи) |

### Account Deletion Flow

```
Master requests account deletion:
  1. Cancel active subscription (stop billing)
  2. Unset bot webhook
  3. Soft-delete tenant (is_active = false)
  4. Anonymize client PII after 30 days:
     - first_name → "Deleted"
     - last_name → NULL
     - phone → NULL
     - notes → NULL
  5. Retain anonymized bookings (for analytics integrity)
  6. Delete bot token from DB
  7. Hard delete after 90 days (GDPR right to erasure)
```

---

## Transport Security

| Аспект | Рішення |
|---|---|
| HTTPS | Обов'язково (Let's Encrypt) |
| TLS version | 1.2+ (disable 1.0, 1.1) |
| HSTS | Enabled (max-age: 31536000) |
| Database | SSL connection (PostgreSQL sslmode=require) |
| Redis | Password auth (requirepass) + не exposed зовні |

---

## Dependency Security

- `npm audit` у CI/CD pipeline
- Dependabot / Renovate для автоматичного оновлення залежностей
- Не використовувати `eval()`, dynamic imports з user input
- Prisma ORM запобігає SQL injection by design

---

## Security Checklist (перед production)

- [ ] Bot tokens encrypted in DB
- [ ] JWT secret is 256-bit random
- [ ] Rate limiting on all endpoints
- [ ] Webhook signature verification
- [ ] HTTPS only (no HTTP fallback)
- [ ] Input validation on all endpoints (class-validator)
- [ ] Cross-tenant integration tests pass
- [ ] No secrets in code/git
- [ ] PgBouncer restricts direct DB access
- [ ] Redis not exposed externally
- [ ] npm audit clean
- [ ] Logging does NOT contain tokens/passwords
- [ ] CORS configured (only Mini App domain + Admin domain)
