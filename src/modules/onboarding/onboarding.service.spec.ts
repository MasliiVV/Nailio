import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { BotService } from '../telegram/bot.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let prisma: any;
  let tenantsService: any;
  let botService: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(async () => {
    prisma = {
      master: { findUnique: jest.fn() },
      tenantClient: { service: { count: jest.fn() } },
    };

    tenantsService = {
      findById: jest.fn(),
      updateOnboardingChecklist: jest.fn(),
    };

    botService = {
      connectBot: jest.fn(),
      findByTenantId: jest.fn(),
      sendMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantsService, useValue: tenantsService },
        { provide: BotService, useValue: botService },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('sends a test message to the master after connecting a bot', async () => {
    botService.connectBot.mockResolvedValue({
      id: 'bot-db-id',
      botUsername: 'demo_master_bot',
      botId: 123,
      isActive: true,
    });
    tenantsService.updateOnboardingChecklist.mockResolvedValue(undefined);
    prisma.master.findUnique.mockResolvedValue({
      user: { telegramId: BigInt(422552831) },
    });
    botService.sendMessage.mockResolvedValue(true);

    const result = await service.connectBot('tenant-1', 'token-1');

    expect(result.botUsername).toBe('demo_master_bot');
    expect(tenantsService.updateOnboardingChecklist).toHaveBeenCalledWith('tenant-1', {
      has_bot: true,
    });
    expect(botService.sendMessage).toHaveBeenCalledWith(
      'bot-db-id',
      BigInt(422552831),
      expect.stringContaining('@demo_master_bot'),
    );
  });

  it('does not fail connectBot if the test message cannot be delivered', async () => {
    botService.connectBot.mockResolvedValue({
      id: 'bot-db-id',
      botUsername: 'demo_master_bot',
      botId: 123,
      isActive: true,
    });
    tenantsService.updateOnboardingChecklist.mockResolvedValue(undefined);
    prisma.master.findUnique.mockResolvedValue({
      user: { telegramId: BigInt(422552831) },
    });
    botService.sendMessage.mockResolvedValue(false);

    await expect(service.connectBot('tenant-1', 'token-1')).resolves.toEqual(
      expect.objectContaining({ botUsername: 'demo_master_bot' }),
    );
  });
});