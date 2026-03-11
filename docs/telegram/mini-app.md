# 📱 Telegram Mini App

> Launch flow, аутентифікація, визначення ролі, брендування, архітектура фронтенду.

---

## Концепція

Один React SPA деплоїться на CDN. Всі боти відкривають **один і той же URL**, але з різним `start_param` (slug тенанта). Mini App автоматично визначає роль (master/client) і показує відповідний інтерфейс.

```
Bot A (menu button) → https://app.platform.com?startapp=master_olena
Bot B (menu button) → https://app.platform.com?startapp=master_anna
Bot C (direct link) → https://t.me/bot_c/app?startapp=salon_kyiv
```

---

## Launch Methods

| Метод | Як | Start Param |
|---|---|---|
| **Menu Button** | Натискання кнопки в боті | Вбудований в URL (setChatMenuButton) |
| **Inline Keyboard** | Кнопка web_app в повідомленні | Через URL |
| **Direct Link** | `https://t.me/bot/app?startapp=slug` | Query parameter |

---

## Архітектура фронтенду

```
src/
├── main.tsx                    — Entry point
├── App.tsx                     — Router, providers
├── lib/
│   ├── telegram.ts             — Telegram WebApp SDK wrapper
│   ├── api.ts                  — API client (axios/fetch)
│   ├── auth.ts                 — Token management
│   └── i18n.ts                 — react-intl setup
├── hooks/
│   ├── useAuth.ts              — Auth state
│   ├── useTenant.ts            — Tenant config + branding
│   └── useBookings.ts          — Booking queries
├── layouts/
│   ├── MasterLayout.tsx        — Master navigation
│   └── ClientLayout.tsx        — Client navigation
├── pages/
│   ├── auth/
│   │   └── AuthPage.tsx        — Loading + auth flow
│   ├── client/
│   │   ├── HomePage.tsx        — Список послуг, welcome
│   │   ├── BookingPage.tsx     — Вибір дати/часу
│   │   ├── MyBookingsPage.tsx  — Мої записи
│   │   ├── ProfilePage.tsx     — Профіль
│   │   └── OnboardingPage.tsx  — Реєстрація нового клієнта
│   └── master/
│       ├── DashboardPage.tsx   — Календар + today stats
│       ├── CalendarPage.tsx    — Повний календар
│       ├── ClientsPage.tsx     — База клієнтів
│       ├── ClientDetailPage.tsx
│       ├── ServicesPage.tsx    — Управління послугами
│       ├── SchedulePage.tsx    — Графік роботи
│       ├── AnalyticsPage.tsx   — Аналітика
│       ├── FinancePage.tsx     — Фінанси
│       ├── SettingsPage.tsx    — Брендування, загальні
│       ├── SubscriptionPage.tsx— Підписка, оплата
│       └── BotSetupPage.tsx   — Онбординг бота
├── components/
│   ├── ui/                     — Базові UI компоненти
│   ├── booking/                — Booking-related компоненти
│   └── calendar/               — Calendar компоненти
└── locales/
    ├── uk.json                 — Українські переклади
    └── en.json                 — Англійські переклади
```

---

## Auth Flow (фронтенд)

```
1. App.tsx mounts
   │
   ▼
2. Read Telegram.WebApp.initData
   Read Telegram.WebApp.initDataUnsafe.start_param
   │
   ▼
3. POST /api/v1/auth/telegram { initData, startParam }
   │
   ├── Success → Store JWT in memory (NOT localStorage)
   │             Read role from response
   │             Read tenant branding
   │             │
   │             ├── role = 'master' → Navigate to /master/dashboard
   │             ├── role = 'client' + needsOnboarding → /client/onboarding
   │             └── role = 'client' → /client/home
   │
   └── Error → Show error screen
```

### Token Storage

| Де | Що |
|---|---|
| In-memory (React state/context) | Access token |
| Telegram CloudStorage | Refresh token (persistent across Mini App sessions) |

**Чому не localStorage:** Mini App WebView може очищати localStorage. Telegram CloudStorage надійніший (1024 items, 4KB each).

---

## Role-Based Routing

```tsx
// App.tsx
<Routes>
  <Route path="/auth" element={<AuthPage />} />
  
  {/* Client routes */}
  <Route path="/client" element={<ClientLayout />}>
    <Route index element={<HomePage />} />
    <Route path="book" element={<BookingPage />} />
    <Route path="bookings" element={<MyBookingsPage />} />
    <Route path="profile" element={<ProfilePage />} />
    <Route path="onboarding" element={<OnboardingPage />} />
  </Route>
  
  {/* Master routes */}
  <Route path="/master" element={<MasterLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="calendar" element={<CalendarPage />} />
    <Route path="clients" element={<ClientsPage />} />
    <Route path="services" element={<ServicesPage />} />
    <Route path="schedule" element={<SchedulePage />} />
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="finance" element={<FinancePage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="subscription" element={<SubscriptionPage />} />
  </Route>
</Routes>
```

---

## Брендування (Theme)

Брендування завантажується з API при auth і застосовується через CSS Custom Properties:

```css
:root {
  --brand-primary: var(--tenant-primary, #E91E63);
  --brand-secondary: var(--tenant-secondary, #FCE4EC);
  --brand-accent: var(--tenant-accent, #AD1457);
  --brand-bg: var(--tenant-bg, #FFFFFF);
}
```

При завантаженні tenant config:
```
document.documentElement.style.setProperty('--tenant-primary', branding.primary_color)
```

---

## i18n (Мультимовність)

### Визначення мови

```
1. Telegram.WebApp.initDataUnsafe.user.language_code
   → 'uk' → Ukrainian
   → 'en' → English
   → інше → fallback to 'uk'

2. Override: user може змінити мову в профілі
```

### Структура перекладів

```json
// locales/uk.json
{
  "common.loading": "Завантаження...",
  "common.error": "Сталася помилка",
  "common.save": "Зберегти",
  "common.cancel": "Скасувати",
  
  "booking.title": "Записатися",
  "booking.select_service": "Оберіть послугу",
  "booking.select_date": "Оберіть дату",
  "booking.select_time": "Оберіть час",
  "booking.confirm": "Підтвердити запис",
  "booking.confirmed": "Запис підтверджено!",
  "booking.cancelled": "Запис скасовано",
  
  "client.my_bookings": "Мої записи",
  "client.no_bookings": "У вас ще немає записів",
  "client.profile": "Профіль",
  
  "master.dashboard": "Головна",
  "master.calendar": "Календар",
  "master.clients": "Клієнти",
  "master.services": "Послуги",
  "master.analytics": "Аналітика",
  "master.settings": "Налаштування",
  
  "error.slot_not_available": "Цей час вже зайнятий",
  "error.subscription.required": "Потрібна активна підписка",
  "error.cancellation_window": "Скасування можливе не пізніше ніж за {hours} год до запису"
}
```

### Lazy Loading

Завантажується тільки потрібна мова:
```
import(`./locales/${locale}.json`)
```

---

## Telegram SDK Integration

### Використовувані методи

| Метод | Призначення |
|---|---|
| `Telegram.WebApp.initData` | Raw auth data для backend |
| `Telegram.WebApp.initDataUnsafe` | Parsed data (user, start_param) |
| `Telegram.WebApp.ready()` | Сигнал Telegram що app завантажився |
| `Telegram.WebApp.expand()` | Розгорнути на повний екран |
| `Telegram.WebApp.close()` | Закрити Mini App |
| `Telegram.WebApp.MainButton` | Головна кнопка внизу екрану |
| `Telegram.WebApp.BackButton` | Кнопка "Назад" |
| `Telegram.WebApp.HapticFeedback` | Вібрація при діях |
| `Telegram.WebApp.CloudStorage` | Збереження refresh token |
| `Telegram.WebApp.themeParams` | Кольори теми Telegram |

### MainButton Pattern

```
Booking flow:
  Step 1 (select service) → MainButton: "Далі"
  Step 2 (select date) → MainButton: "Далі"  
  Step 3 (select time) → MainButton: "Підтвердити запис"
  → MainButton.showProgress()
  → API call
  → MainButton.hideProgress()
  → Success → HapticFeedback.notificationOccurred('success')
```

---

## Read-Only Mode (Client View)

Коли підписка expired — клієнт бачить:

```
┌──────────────────────────────┐
│ ⚠️ Цей майстер тимчасово    │
│ не приймає онлайн-записи.   │
│ Зв'яжіться з майстром      │
│ напряму.                     │
└──────────────────────────────┘

[Мої записи]  ← працює (view only)
[Послуги]     ← працює (view only, без кнопки "Записатися")
[Профіль]     ← працює
```

Кнопка "Записатися" прихована. Форма запису недоступна.
