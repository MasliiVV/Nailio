# 🎓 Master Onboarding Guide

> UX flow реєстрації майстра. Покрокова інструкція. Відео-скрипт. AI інструменти.

---

## Onboarding Flow Overview

```
Майстер знаходить платформу
  │
  ▼
Відкриває Platform Bot у Telegram
  │
  ▼
Натискає /start → "Start" button
  │
  ▼
Відкривається Mini App (wizard)
  │
  ▼
┌─────────────────────────────────┐
│         ONBOARDING WIZARD       │
│                                 │
│  Step 1: Welcome + Video        │
│  Step 2: Create Bot in BotFather│
│  Step 3: Enter Bot Token        │
│  Step 4: Setup Services         │
│  Step 5: Setup Schedule         │
│  Step 6: Branding (optional)    │
│  Step 7: Done! Share your bot   │
│                                 │
└─────────────────────────────────┘
  │
  ▼
Trial активований (7 днів)
  │
  ▼
Майстер ділиться своїм ботом з клієнтами
```

---

## Step-by-Step UX

### Step 1: Welcome

```
┌─────────────────────────────────┐
│  🌟 Ласкаво просимо до GlowUp! │
│                                 │
│  Створіть власного бота для     │
│  запису клієнтів за 5 хвилин.   │
│                                 │
│  📹 [Дивитись відео-інструкцію] │
│     (1:40, як створити бота)    │
│                                 │
│  [Почати →]                     │
└─────────────────────────────────┘
```

### Step 2: Create Bot in BotFather

```
┌─────────────────────────────────┐
│  🤖 Крок 1: Створіть бота      │
│                                 │
│  1. Відкрийте @BotFather        │
│     [Відкрити BotFather →]      │
│     (deep link: t.me/BotFather) │
│                                 │
│  2. Надішліть команду /newbot   │
│                                 │
│  3. Введіть назву бота          │
│     Наприклад: "Манікюр Олена"  │
│                                 │
│  4. Введіть username бота       │
│     Наприклад: manikur_olena_bot│
│     (має закінчуватись на _bot) │
│                                 │
│  5. Скопіюйте токен             │
│     Виглядає як:                │
│     123456:ABC-DEF1234ghIkl-... │
│                                 │
│  [📋 Скопіювали? Далі →]       │
└─────────────────────────────────┘
```

### Step 3: Enter Bot Token

```
┌─────────────────────────────────┐
│  🔑 Крок 2: Введіть токен бота │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Вставте токен сюди...     │  │
│  └───────────────────────────┘  │
│                                 │
│  [Перевірити і підключити]      │
│                                 │
│  ✅ Бот знайдено: @olena_bot   │
│  ✅ Webhook встановлено         │
│  ✅ Меню налаштовано            │
│                                 │
│  [Далі →]                       │
└─────────────────────────────────┘
```

**Backend: POST /onboarding/validate-token**

```
1. Validate token format (regex)
2. Call Telegram getMe → get bot info
3. Verify bot is not already registered (unique constraint)
4. Call setWebhook (our URL + secret)
5. Call setChatMenuButton (Mini App URL with start_param=slug)
6. Call setMyCommands (/start, /book, /my_bookings, /help)
7. Call setMyDescription (auto-generated)
8. Encrypt token → save to DB
9. Cache in Redis
10. Return { success: true, botUsername, botName }
```

### Step 4: Setup Services

```
┌─────────────────────────────────┐
│  💅 Крок 3: Додайте послуги     │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Назва: Манікюр класичний  │  │
│  │ Ціна: 500 ₴              │  │
│  │ Тривалість: 60 хв        │  │
│  │ Опис: (необов'язково)     │  │
│  └───────────────────────────┘  │
│                                 │
│  [+ Додати ще послугу]          │
│                                 │
│  Додані:                        │
│  ✅ Манікюр класичний — 500₴    │
│  ✅ Покриття гель-лак — 400₴    │
│                                 │
│  [Далі →]                       │
│  [Пропустити (можна пізніше)]   │
└─────────────────────────────────┘
```

### Step 5: Setup Schedule

```
┌─────────────────────────────────┐
│  📅 Крок 4: Робочий графік      │
│                                 │
│  Пн ✅ 09:00 — 18:00           │
│  Вт ✅ 09:00 — 18:00           │
│  Ср ✅ 09:00 — 18:00           │
│  Чт ✅ 09:00 — 18:00           │
│  Пт ✅ 09:00 — 18:00           │
│  Сб ✅ 10:00 — 15:00           │
│  Нд ❌ Вихідний                 │
│                                 │
│  Перерва: 13:00 — 14:00         │
│  Слот: 30 хв                    │
│                                 │
│  [Далі →]                       │
│  [Пропустити (можна пізніше)]   │
└─────────────────────────────────┘
```

### Step 6: Branding (Optional)

```
┌─────────────────────────────────┐
│  🎨 Крок 5: Ваш бренд          │
│                                 │
│  Назва салону:                   │
│  ┌───────────────────────────┐  │
│  │ Beauty by Olena           │  │
│  └───────────────────────────┘  │
│                                 │
│  Привітальне повідомлення:      │
│  ┌───────────────────────────┐  │
│  │ Вітаю! Оберіть послугу   │  │
│  │ та запишіться на зручний  │  │
│  │ час.                      │  │
│  └───────────────────────────┘  │
│                                 │
│  Основний колір: [#E91E63] 🎨   │
│                                 │
│  Логотип: [Завантажити]         │
│                                 │
│  [Далі →]                       │
│  [Пропустити]                   │
└─────────────────────────────────┘
```

### Step 7: Done!

```
┌─────────────────────────────────┐
│  🎉 Все готово!                 │
│                                 │
│  Ваш бот: @olena_beauty_bot    │
│                                 │
│  Що далі:                       │
│  1. Поділіться ботом з клієнтами│
│  2. Додайте посилання в Instagram│
│  3. Створіть QR-код             │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 📋 t.me/olena_beauty_bot │  │
│  │    [Копіювати посилання]  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │      [QR Code Image]      │  │
│  │   [Завантажити QR-код]    │  │
│  └───────────────────────────┘  │
│                                 │
│  📱 Пробний період: 7 днів     │
│     (без обмежень)              │
│                                 │
│  [Перейти в панель управління →]│
└─────────────────────────────────┘
```

---

## Post-Onboarding Checklist

Зберігається в `tenants.onboarding_checklist` (JSONB):

```json
{
  "bot_connected": true,
  "first_service_added": true,
  "schedule_configured": true,
  "branding_set": false,
  "first_booking_received": false,
  "payment_settings_configured": false
}
```

UI показує прогрес-бар та підказки для незавершених кроків.

---

## Video Script (1:40)

### Ukrainian Version

```
[00:00 - 00:10] Заставка
🎬 Логотип GlowUp Pro
Текст: "Як створити бота для запису клієнтів за 5 хвилин"

[00:10 - 00:25] Вступ
🎙️ "Привіт! Зараз я покажу, як створити власного Telegram-бота
для онлайн-запису ваших клієнтів. Це займе лише 5 хвилин."

[00:25 - 00:55] Крок 1 — BotFather
🎙️ "Відкрийте Telegram і знайдіть @BotFather.
Надішліть команду /newbot.
Введіть назву вашого бота — наприклад, «Манікюр Олена».
Тепер придумайте username — він має закінчуватись на _bot.
Наприклад: manikur_olena_bot.
Готово! BotFather надішле вам токен — скопіюйте його."

🖥️ Запис екрану: пошук BotFather → /newbot → назва → username → токен

[00:55 - 01:10] Крок 2 — Підключення
🎙️ "Тепер поверніться в GlowUp і вставте токен у поле.
Натисніть «Підключити» — і ваш бот готовий!
Далі додайте ваші послуги та робочий графік."

🖥️ Запис екрану: вставка токена → успіх → додавання послуги

[01:10 - 01:30] Крок 3 — Поширення
🎙️ "Ваш бот готовий до роботи!
Поділіться посиланням у соцмережах або надішліть клієнтам.
Вони зможуть записатись самостійно в будь-який час."

🖥️ Кнопка «Копіювати посилання» → QR-код → приклад запису клієнта

[01:30 - 01:40] Заключення
🎙️ "Перші 7 днів — безкоштовно, без обмежень.
Спробуйте просто зараз!"

🖥️ Кнопка CTA: "Створити бота →"
```

### English Version

```
[00:00 - 00:10] Intro
🎬 GlowUp Pro Logo
Text: "How to create a booking bot in 5 minutes"

[00:10 - 00:25] Welcome
🎙️ "Hi! I'll show you how to create your own Telegram bot
for online client bookings. It takes only 5 minutes."

[00:25 - 00:55] Step 1 — BotFather
🎙️ "Open Telegram and find @BotFather.
Send the command /newbot.
Enter your bot's name — for example, 'Nails by Elena'.
Now choose a username ending with _bot.
For example: nails_elena_bot.
Done! BotFather will send you a token — copy it."

🖥️ Screen recording: search BotFather → /newbot → name → username → token

[00:55 - 01:10] Step 2 — Connect
🎙️ "Go back to GlowUp and paste the token.
Click 'Connect' — your bot is ready!
Now add your services and working hours."

🖥️ Screen recording: paste token → success → add service

[01:10 - 01:30] Step 3 — Share
🎙️ "Your bot is ready to go!
Share the link on social media or send it to clients.
They can book appointments anytime."

🖥️ Copy link button → QR code → client booking example

[01:30 - 01:40] Outro
🎙️ "First 7 days — free, no limits.
Try it right now!"

🖥️ CTA button: "Create your bot →"
```

---

## AI Video Creation Tools

### Recommended: Synthesia

| Параметр | Значення |
|---|---|
| Сайт | synthesia.io |
| Ціна | від €16/міс (Starter) |
| Ukrainian TTS | ✅ Підтримується |
| English TTS | ✅ |
| AI Avatar | 150+ аватарів |
| Screen recording | ✅ Інтеграція (overlay) |
| Тривалість | до 10 хв на Starter |
| Рекомендація | **Найкращий вибір** |

### Alternative: HeyGen

| Параметр | Значення |
|---|---|
| Сайт | heygen.com |
| Ціна | від $24/міс |
| Ukrainian TTS | ✅ |
| Формат | Avatar + screen |

### Budget Option: Canva + ElevenLabs

| Компонент | Tool | Ціна |
|---|---|---|
| Voiceover | ElevenLabs (Ukrainian) | $5/міс |
| Video editing | Canva Pro | $13/міс |
| Screen recording | OBS (free) | Free |

### Production Workflow

```
1. Record screen capture (OBS / Loom)
   - BotFather flow
   - GlowUp onboarding wizard
   - Client booking example

2. Create AI voiceover (Synthesia / ElevenLabs)
   - Upload script (uk + en)
   - Choose voice / avatar
   - Generate audio/video

3. Combine in Synthesia (or manually in DaVinci Resolve)
   - Avatar + screen recording overlay
   - Add subtitles
   - Export 1080p MP4

4. Host on:
   - YouTube (unlisted) — for embedding
   - Telegram channel — for direct sharing
   - MinIO/CDN — for in-app playback
```

---

## QR Code Generation

```typescript
// Server-side QR generation for master's bot link
@Get('onboarding/qr-code')
async getQrCode(@CurrentTenant() tenant: Tenant) {
  const bot = await this.botService.findByTenantId(tenant.id);
  const url = `https://t.me/${bot.username}`;
  
  // Using 'qrcode' npm package
  const qrBuffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 512,
    margin: 2,
    color: {
      dark: tenant.branding?.primary_color || '#000000',
      light: '#FFFFFF',
    },
  });
  
  return new StreamableFile(qrBuffer, {
    type: 'image/png',
    disposition: `attachment; filename="${bot.username}-qr.png"`,
  });
}
```
