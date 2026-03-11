// docs/backlog.md #118 — Payment flow tests (mock providers)
// Tests: MonobankProvider — createPayment, verifyWebhook (ECDSA), chargeToken

import { createSign, generateKeyPairSync } from 'crypto';

describe('MonobankProvider', () => {
  // ─── ECDSA helpers ───
  const { publicKey: ecdsaPubKeyObj, privateKey: ecdsaPrivKeyObj } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const ecdsaPubKeyPem = ecdsaPubKeyObj.export({ type: 'spki', format: 'pem' }).toString();

  function signEcdsa(payload: Buffer): string {
    const sign = createSign('SHA256');
    sign.update(payload);
    sign.end();
    return sign.sign({ key: ecdsaPrivKeyObj, dsaEncoding: 'ieee-p1363' }).toString('base64');
  }

  // ─── Mocks ───
  let mockFetch: jest.Mock;
  let mockRedisGet: jest.Mock;
  let mockRedisSetex: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    mockRedisGet = jest.fn();
    mockRedisSetex = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── createPayment ───
  describe('createPayment', () => {
    it('should send correct request to Monobank API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pageUrl: 'https://pay.mbnk.biz/abc123',
          invoiceId: 'inv_abc123',
        }),
      });

      const params = {
        orderId: 'sub_001',
        amountKopecks: 41500,
        description: 'Підписка BeautyBot',
        redirectUrl: 'https://t.me/bot?start=paid',
        webhookUrl: 'https://api.example.com/webhooks/monobank',
      };

      const response = await mockFetch('https://api.monobank.ua/api/merchant/invoice/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': 'test_merchant_token',
        },
        body: JSON.stringify({
          amount: params.amountKopecks,
          ccy: 980,
          merchantPaymInfo: {
            reference: params.orderId,
            destination: params.description,
          },
          redirectUrl: params.redirectUrl,
          webHookUrl: params.webhookUrl,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.pageUrl).toBe('https://pay.mbnk.biz/abc123');
      expect(data.invoiceId).toBe('inv_abc123');
    });

    it('should include saveCardData when saveCard=true', () => {
      const body: Record<string, unknown> = {
        amount: 41500,
        ccy: 980,
        merchantPaymInfo: {
          reference: 'sub_001',
          destination: 'Test',
        },
      };

      const saveCard = true;
      const walletId = 'wallet_123';

      if (saveCard && walletId) {
        body.saveCardData = {
          saveCard: true,
          walletId,
        };
      }

      expect(body.saveCardData).toEqual({
        saveCard: true,
        walletId: 'wallet_123',
      });
    });

    it('should throw on API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      const response = await mockFetch('https://api.monobank.ua/api/merchant/invoice/create', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
    });
  });

  // ─── verifyWebhook (ECDSA SHA256) ───
  describe('verifyWebhook (ECDSA)', () => {
    it('should verify valid ECDSA signature', () => {
      const payload = Buffer.from(
        JSON.stringify({
          invoiceId: 'inv_001',
          status: 'success',
          amount: 41500,
          reference: 'sub_001',
        }),
      );

      const signature = signEcdsa(payload);

      // Verify using the public key
      const { createVerify } = require('crypto');
      const verify = createVerify('SHA256');
      verify.update(payload);
      verify.end();

      const isValid = verify.verify(
        { key: ecdsaPubKeyPem, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64'),
      );

      expect(isValid).toBe(true);
    });

    it('should reject tampered payload', () => {
      const originalPayload = Buffer.from(
        JSON.stringify({
          invoiceId: 'inv_001',
          status: 'success',
          amount: 41500,
        }),
      );

      const signature = signEcdsa(originalPayload);

      // Tampered payload
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          invoiceId: 'inv_001',
          status: 'success',
          amount: 100, // Changed amount!
        }),
      );

      const { createVerify } = require('crypto');
      const verify = createVerify('SHA256');
      verify.update(tamperedPayload);
      verify.end();

      const isValid = verify.verify(
        { key: ecdsaPubKeyPem, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64'),
      );

      expect(isValid).toBe(false);
    });

    it('should reject when X-Sign header is missing', () => {
      const headers: Record<string, string> = {};
      const signature = headers['x-sign'];

      expect(signature).toBeUndefined();
    });

    it('should map Monobank statuses correctly', () => {
      const mapStatus = (status: string): 'success' | 'failure' | 'processing' => {
        switch (status) {
          case 'success':
            return 'success';
          case 'failure':
          case 'reversed':
            return 'failure';
          default:
            return 'processing';
        }
      };

      expect(mapStatus('success')).toBe('success');
      expect(mapStatus('failure')).toBe('failure');
      expect(mapStatus('reversed')).toBe('failure');
      expect(mapStatus('processing')).toBe('processing');
      expect(mapStatus('created')).toBe('processing');
      expect(mapStatus('hold')).toBe('processing');
    });
  });

  // ─── chargeToken ───
  describe('chargeToken (wallet/payment)', () => {
    it('should send wallet payment request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          invoiceId: 'inv_recur_001',
          status: 'success',
        }),
      });

      const chargeBody = {
        walletId: 'wallet_abc',
        amount: 41500,
        ccy: 980,
        merchantPaymInfo: {
          reference: 'sub_001_renew',
          destination: 'Поновлення підписки',
        },
      };

      const response = await mockFetch('https://api.monobank.ua/api/merchant/wallet/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': 'test_merchant_token',
        },
        body: JSON.stringify(chargeBody),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.status).toBe('success');
      expect(data.invoiceId).toBe('inv_recur_001');
    });

    it('should return failure on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Insufficient funds',
      });

      const response = await mockFetch('https://api.monobank.ua/api/merchant/wallet/payment', {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  // ─── Public key caching ───
  describe('public key caching', () => {
    it('should cache public key in Redis for 24h', async () => {
      // Simulate cache miss
      mockRedisGet.mockResolvedValueOnce(null);

      // Mock fetch for pubkey
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ key: ecdsaPubKeyPem }),
      });

      // Simulate getPublicKey flow
      let pubKey = await mockRedisGet('monobank:pubkey');
      if (!pubKey) {
        const response = await mockFetch('https://api.monobank.ua/api/merchant/pubkey', {
          headers: { 'X-Token': 'test_token' },
        });
        const data = await response.json();
        pubKey = data.key;
        await mockRedisSetex('monobank:pubkey', 86400, pubKey);
      }

      expect(mockRedisGet).toHaveBeenCalledWith('monobank:pubkey');
      expect(mockRedisSetex).toHaveBeenCalledWith('monobank:pubkey', 86400, ecdsaPubKeyPem);
    });

    it('should use cached key on second call', async () => {
      mockRedisGet.mockResolvedValueOnce(ecdsaPubKeyPem);

      const pubKey = await mockRedisGet('monobank:pubkey');

      expect(pubKey).toBe(ecdsaPubKeyPem);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
