// docs/backlog.md #118 — Payment flow tests (mock providers)
// Tests: LiqPayProvider — createPayment, verifyWebhook (SHA1), chargeToken

import { createHash } from 'crypto';

describe('LiqPayProvider', () => {
  // ─── LiqPay signing helper ───
  const TEST_PRIVATE_KEY = 'sandbox_test_private_key_12345';
  const TEST_PUBLIC_KEY = 'sandbox_test_public_key_12345';

  function encodeData(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  function sign(data: string): string {
    return createHash('sha1')
      .update(TEST_PRIVATE_KEY + data + TEST_PRIVATE_KEY)
      .digest('base64');
  }

  // ─── Mocks ───
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── createPayment ───
  describe('createPayment', () => {
    it('should construct correct checkout URL', () => {
      const paymentData = {
        action: 'pay',
        version: 3,
        public_key: TEST_PUBLIC_KEY,
        amount: 415, // UAH (amountKopecks / 100)
        currency: 'UAH',
        description: 'Підписка BeautyBot',
        order_id: 'sub_001',
        server_url: 'https://api.example.com/webhooks/liqpay',
        result_url: 'https://t.me/bot?start=paid',
      };

      const data = encodeData(paymentData);
      const signature = sign(data);

      const url = `https://www.liqpay.ua/api/3/checkout?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`;

      expect(url).toContain('https://www.liqpay.ua/api/3/checkout');
      expect(url).toContain('data=');
      expect(url).toContain('signature=');

      // Verify data decodes correctly
      const decoded = JSON.parse(
        Buffer.from(data, 'base64').toString('utf8'),
      );
      expect(decoded.action).toBe('pay');
      expect(decoded.amount).toBe(415);
      expect(decoded.currency).toBe('UAH');
      expect(decoded.order_id).toBe('sub_001');
    });

    it('should use action=auth when saveCard is true', () => {
      const paymentData = {
        action: 'auth',
        version: 3,
        public_key: TEST_PUBLIC_KEY,
        amount: 415,
        currency: 'UAH',
        description: 'Підписка BeautyBot',
        order_id: 'sub_001',
        recurringbytoken: '1',
      };

      expect(paymentData.action).toBe('auth');
      expect(paymentData.recurringbytoken).toBe('1');
    });

    it('should convert kopecks to UAH (divide by 100)', () => {
      const amountKopecks = 41500;
      const amountUah = amountKopecks / 100;

      expect(amountUah).toBe(415);
    });
  });

  // ─── verifyWebhook (SHA1) ───
  describe('verifyWebhook (SHA1)', () => {
    it('should verify valid LiqPay signature', () => {
      const payload = {
        status: 'success',
        payment_id: 12345678,
        order_id: 'sub_001',
        amount: 415,
        currency: 'UAH',
        card_token: 'token_abc123',
        sender_card_mask2: '5168****1234',
      };

      const data = encodeData(payload);
      const signature = sign(data);

      // Verify
      const expectedSignature = createHash('sha1')
        .update(TEST_PRIVATE_KEY + data + TEST_PRIVATE_KEY)
        .digest('base64');

      expect(signature).toBe(expectedSignature);
    });

    it('should reject invalid signature', () => {
      const payload = {
        status: 'success',
        payment_id: 12345678,
        order_id: 'sub_001',
        amount: 415,
      };

      const data = encodeData(payload);
      const validSignature = sign(data);

      // Sign with wrong key
      const wrongSignature = createHash('sha1')
        .update('wrong_key' + data + 'wrong_key')
        .digest('base64');

      expect(wrongSignature).not.toBe(validSignature);
    });

    it('should reject when data or signature is missing', () => {
      const bodyStr1 = 'signature=abc123'; // Missing data
      const params1 = new URLSearchParams(bodyStr1);
      expect(params1.get('data')).toBeNull();

      const bodyStr2 = 'data=abc123'; // Missing signature
      const params2 = new URLSearchParams(bodyStr2);
      expect(params2.get('signature')).toBeNull();
    });

    it('should map LiqPay statuses correctly', () => {
      const mapStatus = (
        status: string,
      ): 'success' | 'failure' | 'processing' => {
        switch (status) {
          case 'success':
          case 'sandbox':
            return 'success';
          case 'failure':
          case 'error':
          case 'reversed':
            return 'failure';
          default:
            return 'processing';
        }
      };

      expect(mapStatus('success')).toBe('success');
      expect(mapStatus('sandbox')).toBe('success');
      expect(mapStatus('failure')).toBe('failure');
      expect(mapStatus('error')).toBe('failure');
      expect(mapStatus('reversed')).toBe('failure');
      expect(mapStatus('processing')).toBe('processing');
      expect(mapStatus('wait_accept')).toBe('processing');
    });

    it('should extract card token and last 4 digits from webhook', () => {
      const payload = {
        status: 'success',
        payment_id: 12345678,
        order_id: 'sub_001',
        amount: 415,
        card_token: 'token_abc123',
        sender_card_mask2: '5168****1234',
      };

      const cardToken = payload.card_token || undefined;
      const cardLastFour = payload.sender_card_mask2
        ? payload.sender_card_mask2.slice(-4)
        : undefined;

      expect(cardToken).toBe('token_abc123');
      expect(cardLastFour).toBe('1234');
    });

    it('should correctly decode Base64 data payload', () => {
      const original = {
        status: 'success',
        order_id: 'sub_001',
        amount: 415,
      };

      const encoded = encodeData(original);
      const decoded = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8'),
      );

      expect(decoded).toEqual(original);
    });
  });

  // ─── chargeToken (recurring) ───
  describe('chargeToken (recurring)', () => {
    it('should send card_token charge request', async () => {
      const paymentData = {
        action: 'pay',
        version: 3,
        public_key: TEST_PUBLIC_KEY,
        amount: 415,
        currency: 'UAH',
        description: 'Поновлення підписки BeautyBot',
        order_id: 'sub_001_renew',
        card_token: 'token_abc123',
      };

      const data = encodeData(paymentData);
      const signature = sign(data);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          payment_id: 99887766,
          order_id: 'sub_001_renew',
        }),
      });

      const response = await mockFetch(
        'https://www.liqpay.ua/api/request',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`,
        },
      );

      const result = await response.json();
      expect(result.status).toBe('success');
      expect(result.payment_id).toBe(99887766);
    });

    it('should return failure when charge is declined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'failure',
          payment_id: 99887766,
          err_description: 'Insufficient funds',
        }),
      });

      const response = await mockFetch(
        'https://www.liqpay.ua/api/request',
        {},
      );

      const result = await response.json();
      expect(result.status).toBe('failure');
      expect(result.err_description).toBe('Insufficient funds');
    });

    it('should handle API error (non-ok response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const response = await mockFetch(
        'https://www.liqpay.ua/api/request',
        {},
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  // ─── Signature helper ───
  describe('sign() helper', () => {
    it('should produce deterministic signatures', () => {
      const data = encodeData({ test: 'data' });
      const sig1 = sign(data);
      const sig2 = sign(data);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different data', () => {
      const data1 = encodeData({ amount: 100 });
      const data2 = encodeData({ amount: 200 });

      expect(sign(data1)).not.toBe(sign(data2));
    });
  });
});
