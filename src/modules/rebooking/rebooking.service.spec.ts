import { ConfigService } from '@nestjs/config';
import { RebookingService } from './rebooking.service';

describe('RebookingService message generation', () => {
  const createService = (openAiKey?: string) => {
    const prisma = {} as never;
    const scheduleService = {} as never;
    const botService = {} as never;
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'OPENAI_API_KEY') return openAiKey;
        if (key === 'AI_MODEL') return 'gpt-4.1-mini';
        if (key === 'MINI_APP_URL') return fallback ?? 'https://app.platform.com';
        return fallback;
      }),
    } as unknown as ConfigService;

    return new RebookingService(prisma, scheduleService, botService, configService);
  };

  it('puts master topic at the center of the AI prompt for cycle reminders', async () => {
    const service = createService('test-key');
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'готовий текст' } }] }),
    } as Response);
    global.fetch = fetchMock as typeof fetch;

    await (service as any).generateAiMessage({
      campaignType: 'cycle_followup',
      tenantName: 'Nailio Studio',
      tone: 'friendly',
      extraInstructions: 'нагадати, що можна вибрати ранковий час цього тижня',
      recipientNames: ['Оля'],
      slotOptions: [{ date: '2026-03-20', startTime: '09:00', endTime: '10:00' }],
      timezone: 'Europe/Kyiv',
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const prompt = payload.messages.find((message) => message.role === 'user')?.content ?? '';

    expect(prompt).toContain('ГОЛОВНА ТЕМА повідомлення від майстра: нагадати, що можна вибрати ранковий час цього тижня.');
    expect(prompt).toContain('Не замінюй її загальним нагадуванням про повторний візит.');

    global.fetch = originalFetch;
  });

  it('keeps master topic in fallback for cycle reminders', () => {
    const service = createService();

    const message = (service as any).generateFallbackMessage({
      campaignType: 'cycle_followup',
      tenantName: 'Nailio Studio',
      tone: 'soft',
      extraInstructions: 'можна записатися на зручний ранок цього тижня',
      recipientNames: ['Оля'],
      slotOptions: [{ date: '2026-03-20', startTime: '09:00', endTime: '10:00' }],
      timezone: 'Europe/Kyiv',
    });

    expect(message).toContain('Можна записатися на зручний ранок цього тижня.');
    expect(message).not.toContain('Від останнього візиту вже минуло близько 3 тижнів');
  });
});