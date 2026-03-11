# 🔑 Аутентифікація

> Telegram initData → HMAC-SHA256 → JWT. Повний auth flow для Mini App та Admin Panel.

---

## Два типи аутентифікації

| Тип | Для кого | Метод |
|---|---|---|
| **Telegram Auth** | Masters та Clients (Mini App) | initData HMAC-SHA256 → JWT |
| **Admin Auth** | Platform admin (Admin Panel) | Email/password + bcrypt → JWT |

---

## Telegram Auth Flow (Mini App)

### Повна послідовність

```
┌─────────────┐          ┌──────────────┐          ┌──────────────┐
│  Telegram   │          │   Mini App   │          │   Backend    │
│  Client     │          │   (React)    │          │   (NestJS)   │
└──────┬──────┘          └──────┬───────┘          └──────┬───────┘
       │                        │                         │
       │  1. Opens Mini App     │                         │
       │  (Menu Button / Link)  │                         │
       │──────────────────────> │                         │
       │                        │                         │
       │  initData (signed)     │                         │
       │──────────────────────> │                         │
       │                        │                         │
       │                        │  2. POST /api/v1/auth/telegram
       │                        │  Body: { initData, startParam }
       │                        │────────────────────────>│
       │                        │                         │
       │                        │                    3. Validate:
       │                        │                    - Parse initData
       │                        │                    - Find tenant by startParam (slug)
       │                        │                    - Find bot by tenant
       │                        │                    - HMAC-SHA256 verify with bot_token
       │                        │                    - Check auth_date (< 5 min)
       │                        │                    - Find/create user by telegram_id
       │                        │                    - Determine role (master/client)
       │                        │                    - Issue JWT
       │                        │                         │
       │                        │  4. Response:           │
       │                        │  { accessToken, refreshToken,
       │                        │    role, profile,       │
       │                        │    needsOnboarding }    │
       │                        │<────────────────────────│
       │                        │                         │
       │                        │  5. Redirect:           │
       │                        │  role=master → /master/ │
       │                        │  role=client → /client/ │
       │                        │  needsOnboarding →      │
       │                        │    /client/onboarding   │
       │                        │                         │
```

### HMAC-SHA256 Verification (Step 3)

```
Input: raw initData query string from Telegram

1. Parse initData into key-value pairs
2. Remove 'hash' field, save it separately
3. Sort remaining fields alphabetically
4. Build data_check_string: "auth_date=...\nquery_id=...\nuser=..."
5. Compute secret_key = HMAC_SHA256(bot_token, "WebAppData")
6. Compute hash = hex(HMAC_SHA256(data_check_string, secret_key))
7. Compare computed hash with received hash
8. Check auth_date is not older than 300 seconds (5 min)
```

### Tenant Resolution (Step 3)

```
startParam (from Mini App URL ?startapp=<slug>)
  → SELECT * FROM tenants WHERE slug = startParam AND is_active = true
  → SELECT * FROM bots WHERE tenant_id = tenant.id AND is_active = true
  → Use bot.bot_token_encrypted (decrypt) for HMAC verification

Fallback (no startParam):
  → Try all active bots' tokens (cached in Redis)
  → Match by successful HMAC verification
  → This is slower but handles edge cases
```

### Role Resolution (Step 3)

```
telegram_id from initData.user.id
  → SELECT * FROM masters WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ?)
    AND tenant_id = current_tenant
  → If found → role = 'master'
  → Else → role = 'client'
    → SELECT * FROM clients WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ?)
      AND tenant_id = current_tenant
    → If not found → needsOnboarding = true (new client)
```

---

## JWT Token Structure

### Access Token (short-lived)

```json
{
  "sub": "user-uuid",
  "tid": "tenant-uuid",
  "role": "master|client",
  "tgid": 123456789,
  "iat": 1741689600,
  "exp": 1741693200
}
```

| Claim | Опис |
|---|---|
| `sub` | User ID (UUID) |
| `tid` | Tenant ID (UUID) |
| `role` | master або client |
| `tgid` | Telegram user ID |
| `iat` | Issued at |
| `exp` | Expires at |

**TTL: 1 година**

### Refresh Token (long-lived)

- Opaque token (UUID v4)
- Зберігається в Redis: `refresh:{token}` → `{ userId, tenantId, role }`
- **TTL: 30 днів**
- При використанні — видаляється старий, видається новий (rotation)

---

## Token Refresh Flow

```
POST /api/v1/auth/refresh
Body: { refreshToken: "uuid-v4-string" }

→ Find in Redis: refresh:{token}
→ If not found → 401 Unauthorized
→ Delete old refresh token
→ Issue new access token + new refresh token
→ Response: { accessToken, refreshToken }
```

---

## Client Onboarding Flow

Коли `needsOnboarding = true` (новий клієнт):

```
POST /api/v1/auth/telegram → { needsOnboarding: true, accessToken (temporary) }

→ Mini App показує форму:
  - first_name (pre-filled from Telegram)
  - last_name (pre-filled)
  - phone (input or Telegram share)

→ POST /api/v1/clients/onboarding
  Body: { firstName, lastName, phone }
  
→ Backend creates client record
→ Returns full profile
→ Redirect to /client/ main page
```

---

## Admin Panel Auth

Окрема auth система (не через Telegram):

```
POST /api/admin/auth/login
Body: { email, password }

→ Find admin by email
→ Compare bcrypt hash
→ Issue JWT (role: 'platform_admin')
→ Response: { accessToken, refreshToken }
```

**JWT claims для admin:**
```json
{
  "sub": "admin-uuid",
  "role": "platform_admin",
  "email": "admin@platform.com",
  "iat": 1741689600,
  "exp": 1741693200
}
```

---

## Security Considerations

| Аспект | Рішення |
|---|---|
| initData replay | auth_date перевірка (< 5 хв) |
| JWT theft | Short TTL (1 час) + refresh rotation |
| Refresh token theft | Redis-based, single-use, revokable |
| Bot token exposure | AES-256-GCM encryption in DB, decrypt in memory only |
| Brute force | Rate limiting on auth endpoints (10 req/min per IP) |
| CSRF | Not applicable (JWT in header, not cookie) |
| XSS | HTTPOnly не потрібен (Mini App context), input sanitization |
