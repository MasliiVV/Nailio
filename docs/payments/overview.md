# 💳 Payments Overview

> Архітектура платіжної системи. Strategy Pattern для Monobank + LiqPay. Два контексти: підписка платформи ($10/month) та опціональні оплати клієнтів.

---

## Два платіжні контексти

| Контекст | Хто платить | Кому | Провайдер | Обов'язковість |
|---|---|---|---|---|
| Platform Subscription | Майстер | Платформі | Monobank АБО LiqPay (вибір) | Обов'язково |
| Client Payment | Клієнт | Майстру | Monobank АБО LiqPay (вибір майстра) | Опціонально |

---

## Strategy Pattern Architecture

```
┌─────────────────────────────────┐
│       PaymentService            │
│  (orchestrator, business logic) │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│     PaymentProvider Interface   │
│  createPayment()                │
│  verifyWebhook()                │
│  getPaymentStatus()             │
│  tokenizeCard()                 │
│  chargeToken()                  │
│  refund()                       │
└────────┬──────────┬─────────────┘
         │          │
         ▼          ▼
┌──────────────┐ ┌──────────────┐
│  Monobank    │ │  LiqPay      │
│  Provider    │ │  Provider    │
└──────────────┘ └──────────────┘
```

### PaymentProvider Interface

```typescript
interface PaymentProvider {
  // Створити платіжну сторінку
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  
  // Верифікація webhook підпису
  verifyWebhook(request: RawRequest): Promise<WebhookPayload>;
  
  // Перевірка статусу платежу
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  
  // Tokenize картку для recurring (subscription)
  tokenizeCard(params: TokenizeParams): Promise<CardToken>;
  
  // Charge збережений токен (merchant-initiated)
  chargeToken(params: ChargeTokenParams): Promise<ChargeResult>;
  
  // Повернення коштів
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
}
```

### Provider Resolution

```typescript
@Injectable()
class PaymentProviderFactory {
  getProvider(providerType: 'monobank' | 'liqpay'): PaymentProvider {
    switch (providerType) {
      case 'monobank': return this.monobankProvider;
      case 'liqpay':   return this.liqpayProvider;
    }
  }
  
  // Для platform subscription — вибір при checkout
  getSubscriptionProvider(tenantId: string): PaymentProvider {
    const subscription = await this.subscriptionRepo.find(tenantId);
    return this.getProvider(subscription.provider);
  }
  
  // Для client payments — вибір майстра
  getClientPaymentProvider(tenantId: string): PaymentProvider {
    const settings = await this.paymentSettingsRepo.find(tenantId);
    return this.getProvider(settings.provider);
  }
}
```

---

## Monobank Provider

### API Endpoints Used

| Метод | Endpoint | Призначення |
|---|---|---|
| POST | `/api/merchant/invoice/create` | Створити платіж (hosted page) |
| GET | `/api/merchant/invoice/status?invoiceId=X` | Статус платежу |
| POST | `/api/merchant/invoice/cancel` | Скасувати платіж |
| GET | `/api/merchant/pubkey` | Публічний ключ для webhook verification |
| POST | `/api/merchant/wallet/payment` | Charge збереженого токену (recurring) |

### Auth

```
Header: X-Token: {merchant_token}
```

### Webhook Verification

```
Header: X-Sign: {ECDSA signature of body}
  → Verify з public key (GET /api/merchant/pubkey, cached 24h)
  → ECDSA with SHA256
```

### Card Tokenization Flow

```
1. POST /api/merchant/invoice/create
   { 
     amount: 29500,        // копійки (295 UAH ≈ $10)
     ccy: 980,             // UAH (ISO 4217)
     merchantPaymInfo: { reference: "sub_xxx" },
     saveCardData: {
       saveCard: true,
       walletId: "tenant_{tenantId}"
     },
     redirectUrl: "https://t.me/PlatformBot",
     webHookUrl: "https://api.example.com/webhooks/monobank"
   }

2. User pays on Monobank hosted page

3. Webhook arrives with:
   { invoiceId, status: "success", walletId: "tenant_xxx" }
   → Store: subscription.card_token = walletId

4. Next month (BullMQ cron):
   POST /api/merchant/wallet/payment
   { walletId: "tenant_xxx", amount: 29500, ccy: 980 }
```

### Amount Conversion (USD → UAH)

```
Platform subscription: $10/month
  → GET https://api.monobank.ua/bank/currency (public, no auth)
  → Find: currencyCodeA=840 (USD), currencyCodeB=980 (UAH)
  → Use 'rateSell' field
  → amount_uah = 10 * rateSell (e.g. 10 * 41.50 = 415.00 UAH)
  → amount_kopecks = 41500
  
Rate caching: Redis, TTL = 1 hour
Rate used stored in subscription_payments.exchange_rate
```

---

## LiqPay Provider

### API Endpoints Used

| Метод | Endpoint | Призначення |
|---|---|---|
| POST | `/api/3/checkout` | Створити платіж (hosted page redirect) |
| POST | `/api/request` | Server-to-server charge (recurring) |

### Auth

```
data = Base64(JSON payload)
signature = Base64(SHA1(private_key + data + private_key))
```

### Webhook Verification

```
POST body: data=...&signature=...
  → expected = Base64(SHA1(private_key + data + private_key))
  → if signature !== expected → reject
```

### Card Tokenization Flow

```
1. Create checkout:
   {
     action: "auth",               // auth = tokenize only
     version: 3,
     public_key: "...",
     amount: 295.00,               // UAH
     currency: "UAH",
    description: "Nailio Subscription",
     order_id: "sub_xxx",
     recurringbytoken: "1",        // enable recurring
     server_url: "https://api.example.com/webhooks/liqpay",
     result_url: "https://t.me/PlatformBot"
   }

2. Webhook arrives with:
   { status: "success", card_token: "...", order_id: "sub_xxx" }
   → Store: subscription.card_token = card_token

3. Next month (BullMQ cron):
   POST /api/request
   {
     action: "pay",
     version: 3,
     public_key: "...",
     amount: 295.00,
     currency: "UAH",
    description: "Nailio Monthly",
     order_id: "sub_xxx_2024_02",
     card_token: "..."
   }
```

---

## Provider Comparison

| Feature | Monobank | LiqPay |
|---|---|---|
| Hosted page | ✅ | ✅ |
| Card tokenization | ✅ (walletId) | ✅ (card_token) |
| Recurring (built-in) | ❌ | ❌ (manual via token) |
| Webhook format | JSON | Base64-encoded JSON |
| Webhook verification | ECDSA | SHA1 |
| Currency | UAH only | UAH + multi |
| Minimum amount | 1 UAH | 1 UAH |
| Sandbox/Test | ✅ | ✅ |
| Apple/Google Pay | ✅ | ✅ |

---

## Client Payments (Optional)

### Концепт

Майстер може підключити свій Monobank або LiqPay merchant account, щоб клієнти могли оплачувати послуги онлайн.

### Flow

```
1. Master: Settings → Payments → Connect
   → Вводить API credentials (token/public_key/private_key)
   → Credentials encrypted + stored in payment_settings

2. Client: Books a service → "Pay Online" button
   → POST /payments/create
   → Server creates invoice via master's merchant account
   → Returns hosted payment page URL
   → Client pays on Monobank/LiqPay page

3. Webhook arrives → POST /webhooks/client-payment
   → Verify signature with master's credentials
   → Update booking.payment_status = 'paid'
   → Create transaction record
   → Notify master
```

### Security Note

- Client payment credentials stored per tenant in `payment_settings` table
- Encrypted with separate key (`PAYMENT_ENCRYPTION_KEY`)
- Decrypted only at payment creation time
- Platform NEVER touches client money — all goes directly to master's account

---

## Webhook Endpoints Summary

| Endpoint | Provider | Context | Verification |
|---|---|---|---|
| POST /webhooks/monobank | Monobank | Platform subscription | ECDSA |
| POST /webhooks/liqpay | LiqPay | Platform subscription | SHA1 |
| POST /webhooks/client-payment/monobank | Monobank | Client payment | ECDSA |
| POST /webhooks/client-payment/liqpay | LiqPay | Client payment | SHA1 |
| POST /webhook/:botId | Telegram | Bot updates | Secret token |

---

## Database Tables

### subscriptions

```sql
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL UNIQUE REFERENCES tenants(id),
  status          subscription_status NOT NULL DEFAULT 'trial',
  provider        payment_provider,          -- 'monobank' | 'liqpay' | NULL (trial)
  plan            VARCHAR(50) DEFAULT 'pro', -- single plan
  price_usd       DECIMAL(10,2) DEFAULT 10.00,
  card_token      TEXT,                      -- encrypted
  trial_ends_at   TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  grace_ends_at   TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### subscription_payments

```sql
CREATE TABLE subscription_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  amount_usd      DECIMAL(10,2) NOT NULL,
  amount_local    DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(3) DEFAULT 'UAH',
  exchange_rate   DECIMAL(10,4),
  provider        payment_provider NOT NULL,
  provider_payment_id VARCHAR(255),
  status          payment_status NOT NULL,   -- pending, success, failed
  attempt         INTEGER DEFAULT 1,
  error_message   TEXT,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### payment_settings (per tenant, for client payments)

```sql
CREATE TABLE payment_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL UNIQUE REFERENCES tenants(id),
  provider        payment_provider NOT NULL,
  is_enabled      BOOLEAN DEFAULT false,
  api_token_encrypted   BYTEA,
  api_secret_encrypted  BYTEA,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```
