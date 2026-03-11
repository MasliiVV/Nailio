// docs/payments/overview.md — PaymentProvider Interface (Strategy Pattern)
// docs/backlog.md #61 — PaymentProvider interface

/**
 * Parameters for creating a payment (hosted page).
 */
export interface CreatePaymentParams {
  /** Unique reference (e.g., "sub_{subscriptionId}" or "booking_{bookingId}") */
  orderId: string;
  /** Amount in kopecks (UAH) */
  amountKopecks: number;
  /** Description shown to user */
  description: string;
  /** URL to redirect after payment */
  redirectUrl: string;
  /** Webhook URL for payment status updates */
  webhookUrl: string;
  /** Enable card tokenization for recurring payments */
  saveCard?: boolean;
  /** Wallet ID for Monobank card saving */
  walletId?: string;
}

export interface PaymentResult {
  /** URL to redirect user to hosted payment page */
  paymentUrl: string;
  /** Provider-specific payment/invoice ID */
  providerPaymentId: string;
}

/**
 * Webhook payload after verification.
 */
export interface WebhookPayload {
  /** Provider-specific payment ID */
  providerPaymentId: string;
  /** Payment status */
  status: 'success' | 'failure' | 'processing';
  /** Original order reference */
  orderId: string;
  /** Amount in kopecks */
  amountKopecks: number;
  /** Card token for recurring (if saveCard was true) */
  cardToken?: string;
  /** Last 4 digits of card */
  cardLastFour?: string;
}

/**
 * Parameters for charging a saved card token (recurring).
 */
export interface ChargeTokenParams {
  /** Saved card token (Monobank walletId or LiqPay card_token) */
  cardToken: string;
  /** Amount in kopecks (UAH) */
  amountKopecks: number;
  /** Unique reference for this charge */
  orderId: string;
  /** Description */
  description: string;
}

export interface ChargeResult {
  /** Provider-specific payment/invoice ID */
  providerPaymentId: string;
  /** Charge status */
  status: 'success' | 'failure' | 'processing';
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * docs/payments/overview.md — PaymentProvider Interface (Strategy Pattern)
 * All payment providers must implement this interface.
 */
export interface PaymentProvider {
  /** Provider identifier */
  readonly name: 'monobank' | 'liqpay';

  /** Create a hosted payment page */
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;

  /** Verify webhook signature and parse payload */
  verifyWebhook(headers: Record<string, string>, body: Buffer): Promise<WebhookPayload>;

  /** Charge a saved card token (merchant-initiated, recurring) */
  chargeToken(params: ChargeTokenParams): Promise<ChargeResult>;
}
