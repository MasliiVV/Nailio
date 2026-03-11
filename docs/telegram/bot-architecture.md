# 🤖 Bot Architecture

> Multi-bot система, webhook routing, зберігання токенів, onboarding, bot lifecycle.

---

## Концепція

Кожен майстер має **власного Telegram бота**. Але всі боти обслуговуються **одним backend'ом**. Бот — це точка входу клієнта до Mini App майстра.

```
Master A → @nails_olena_bot ──┐
Master B → @beauty_anna_bot ──┼──→ Single Backend (NestJS)
Master C → @salon_kyiv_bot ──┘         │
                                        ├── POST /webhook/bot_a_id
                                        ├── POST /webhook/bot_b_id
                                        └── POST /webhook/bot_c_id
```

---

## Створення бота

### Процес (Варіант A — майстер створює сам)

Telegram **не має API для автоматичного створення ботів**. Тому:

1. Майстер реєструється на платформі
2. Бачить покрокову інструкцію (wizard + відео):
   - Відкрити @BotFather → /newbot → ввести назву → ввести username → скопіювати token
3. Вставляє token у поле на платформі
4. Натискає "Підключити"

### Автоналаштування бота (після підключення)

Після отримання валідного токена, система автоматично:

```
1. GET /bot<TOKEN>/getMe
   → Отримати bot_id, bot_username
   → Валідувати що токен робочий

2. POST /bot<TOKEN>/setWebhook
   → url: https://api.platform.com/webhook/{bot_db_id}
   → secret_token: random 256-char string
   → allowed_updates: ["message", "callback_query"]

3. POST /bot<TOKEN>/setChatMenuButton
   → menu_button: {
       type: "web_app",
       text: "📅 Записатися",
       web_app: { url: "https://app.platform.com?startapp={tenant_slug}" }
     }

4. POST /bot<TOKEN>/setMyCommands
   → commands: [
       { command: "start", description: "Відкрити додаток" },
       { command: "book", description: "Записатися" },
       { command: "my_bookings", description: "Мої записи" },
       { command: "help", description: "Допомога" }
     ]

5. POST /bot<TOKEN>/setMyDescription
   → description: "{tenant.display_name} — онлайн-запис"

6. Зберегти в БД:
   → bots: { bot_id, bot_token_encrypted, bot_username, webhook_secret }
   → tenants.onboarding_status = 'bot_connected'
```

---

## Зберігання Bot Token

| Аспект | Рішення |
|---|---|
| Алгоритм | AES-256-GCM |
| Ключ шифрування | Env variable `BOT_TOKEN_ENCRYPTION_KEY` (32 bytes) |
| Зберігання | `bots.bot_token_encrypted` (BYTEA) |
| Розшифровка | Тільки в runtime, тільки коли потрібно (відправка повідомлення, верифікація initData) |
| Кешування | Розшифрований token кешується в Redis: `bot:{botId}:config` (TTL 1 год) |

---

## Webhook Routing

### Реєстрація

Кожен бот отримує унікальний webhook URL:
```
https://api.platform.com/webhook/{bot_db_uuid}
```

### Обробка вхідного webhook

```
POST /webhook/{botId}
Headers:
  X-Telegram-Bot-Api-Secret-Token: <secret>
Body: Telegram Update object

→ 1. Extract botId from URL path
→ 2. Load bot config from Redis (or DB fallback):
     { tenant_id, webhook_secret, bot_token }
→ 3. Verify X-Telegram-Bot-Api-Secret-Token == bot.webhook_secret
     If invalid → 403 Forbidden
→ 4. Parse Update type:
     - message.text starts with "/" → Command handler
     - callback_query → Callback handler
     - Other → Ignore
→ 5. Respond 200 OK (must respond < 1 sec to avoid Telegram retries)
→ 6. Process asynchronously (enqueue to BullMQ if heavy)
```

### Команди бота

| Команда | Дія |
|---|---|
| `/start` | Привітання + inline keyboard з кнопкою "📅 Записатися" (web_app) |
| `/start {payload}` | Deep link — якщо payload містить дані (referral, specific service) |
| `/book` | Та ж кнопка Mini App |
| `/my_bookings` | Список майбутніх записів (inline keyboard) |
| `/help` | Текст допомоги + контакти майстра |

### Відповідь на /start

```json
{
  "chat_id": 123456789,
  "text": "👋 Ласкаво просимо до {tenant.display_name}!\n\nНатисніть кнопку нижче, щоб записатися.",
  "reply_markup": {
    "inline_keyboard": [[
      {
        "text": "📅 Записатися",
        "web_app": {
          "url": "https://app.platform.com?startapp={tenant_slug}"
        }
      }
    ]]
  }
}
```

---

## Bot Lifecycle

### Підключення

```
pending_bot → [master вводить token] → bot_connected
```

### Перепідключення (новий token)

```
POST /api/v1/bot/reconnect { botToken: "new_token" }
→ Validate new token (getMe)
→ Delete old webhook
→ Update encrypted token in DB
→ Set new webhook
→ Invalidate Redis cache
→ Invalidate all JWTs for this tenant (bump token_version)
```

### Деактивація (при expired subscription)

```
Subscription expired
→ Bot залишається активним (клієнти бачать Mini App)
→ Mini App працює в read-only mode
→ Бот відповідає на /start нормально
→ При спробі booking → error "Майстер тимчасово не приймає записи"
```

---

## Відправка повідомлень через бота

Всі вихідні повідомлення (нагадування, підтвердження) відправляються через Bot API конкретного бота майстра:

```
1. Load bot config: bot_token from Redis/DB
2. POST https://api.telegram.org/bot<TOKEN>/sendMessage
   {
     chat_id: client_telegram_id,
     text: rendered_message,
     parse_mode: "HTML"
   }
3. Handle response:
   - 200 OK → notification.status = 'sent'
   - 403 Forbidden → client.bot_blocked = true
   - 429 Too Many Requests → retry after retry_after seconds
```

### Rate Limiting для відправки

- **Внутрішній rate limiter**: BullMQ rate limiter — max 25 jobs/sec per bot token
- **Telegram limit**: ~30 msg/sec per bot (free tier)
- При 429 → автоматичний retry з `retry_after` delay

---

## Масштабування

| Масштаб | Підхід |
|---|---|
| 1-100 ботів | Один webhook handler, достатньо |
| 100-1000 ботів | Redis cache для bot configs, async processing через BullMQ |
| 1000+ ботів | Розглянути self-hosted Telegram Bot API Server (знімає ліміти) |
