import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { buildDateTimeInTimezone, formatTimeInTimezone } from '../../common/utils/date-time.util';
import { ScheduleService } from '../schedule/schedule.service';
import { BotService } from '../telegram/bot.service';
import { GenerateRebookingMessageDto, SendRebookingCampaignDto } from './dto/rebooking.dto';

type PriorityLevel = 'high' | 'medium' | 'low';
type SegmentKey = 'due_soon' | 'visits_3_plus' | 'morning' | 'favorite_service' | 'irregular';
type RebookingCampaignType = 'slot_fill' | 'cycle_followup';

interface CampaignSlotOption {
  date: string;
  startTime: string;
  endTime: string;
}

interface CampaignRecipient {
  clientId: string;
  firstName: string;
  telegramId: string;
  serviceId: string;
  serviceName: string;
  status: 'sent' | 'booked' | 'closed';
}

interface StoredCampaign {
  id: string;
  type?: RebookingCampaignType;
  date: string;
  startTime: string;
  endTime: string;
  message: string;
  createdAt: string;
  status: 'active' | 'filled';
  bookedByClientId?: string;
  slotOptions?: CampaignSlotOption[];
  recipients: CampaignRecipient[];
}

export interface CampaignLogItem {
  id: string;
  type: RebookingCampaignType;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  status: 'active' | 'filled';
  sentCount: number;
  bookedCount: number;
  closedCount: number;
}

interface CompletedBookingRecord {
  clientId: string;
  startTime: Date;
  durationAtBooking: number;
  priceAtBooking: number;
  serviceId: string | null;
  serviceNameSnapshot: string;
}

interface TenantContext {
  id: string;
  slug: string;
  displayName: string;
  timezone: string;
  settings: Prisma.JsonValue | null;
}

@Injectable()
export class RebookingService {
  private readonly logger = new Logger(RebookingService.name);
  private readonly campaignsKey = 'smart_rebooking_campaigns';
  private readonly defaultCycleDays = 21;
  private readonly appUrl: string;
  private readonly aiApiKey?: string;
  private readonly aiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduleService: ScheduleService,
    private readonly botService: BotService,
    private readonly configService: ConfigService,
  ) {
    this.appUrl = this.configService.get<string>('MINI_APP_URL', 'https://app.platform.com');
    this.aiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.aiModel = this.configService.get<string>('AI_MODEL', 'gpt-4.1-mini');
  }

  async getOverview(tenantId: string, requestedDate?: string) {
    const tenant = await this.getTenantContext(tenantId);
    const selectedDate = requestedDate || this.getTodayKey(tenant.timezone);
    const rangeDates = this.getDateRange(selectedDate, 14);
    const [heatmap, emptySlots, recommendations, kpis] = await Promise.all([
      this.buildHeatmap(tenant, rangeDates),
      this.buildEmptySlots(tenant, rangeDates.slice(0, 7)),
      this.buildRecommendations(tenant, selectedDate),
      this.buildKpis(tenant, rangeDates),
    ]);
    const sendLog = this.buildCampaignLog(tenant.settings);

    return {
      selectedDate,
      defaultCycleDays: this.getDefaultCycleDays(tenant.settings),
      bestSendTime: '18:00',
      heatmap,
      emptySlots,
      recommendations,
      kpis,
      sendLog,
    };
  }

  async generateMessage(tenantId: string, dto: GenerateRebookingMessageDto) {
    const tenant = await this.getTenantContext(tenantId);
    const campaignType = dto.campaignType || 'slot_fill';
    const clients = await this.prisma.tenantClient.client.findMany({
      where: { tenantId, id: { in: dto.clientIds } },
      select: { firstName: true },
      take: 3,
    });

    const names = clients.map((client) => client.firstName).filter(Boolean);
    const slotOptions =
      campaignType === 'cycle_followup'
        ? this.normalizeSlotOptions(
            dto.slotOptions?.length
              ? dto.slotOptions
              : await this.getDefaultCampaignSlotOptions(tenant, dto.date),
          )
        : this.normalizeSlotOptions([
            {
              date: dto.date,
              startTime: dto.startTime,
              endTime: dto.endTime,
            },
          ]);
    const message = await this.generateAiMessage({
      campaignType,
      tenantName: tenant.displayName,
      dateLabel:
        campaignType === 'slot_fill' ? this.formatDateLabel(dto.date, tenant.timezone) : undefined,
      startTime: campaignType === 'slot_fill' ? dto.startTime : undefined,
      endTime: campaignType === 'slot_fill' ? dto.endTime : undefined,
      tone: dto.tone || 'friendly',
      extraInstructions: dto.extraInstructions,
      recipientNames: names,
      slotOptions,
      timezone: tenant.timezone,
    });

    return {
      message,
      meta: {
        tone: dto.tone || 'friendly',
        recipients: dto.clientIds.length,
      },
    };
  }

  async sendCampaign(tenantId: string, dto: SendRebookingCampaignDto) {
    const tenant = await this.getTenantContext(tenantId);
    const bot = await this.botService.findByTenantId(tenantId);
    if (!bot?.isActive) {
      throw new NotFoundException('Tenant bot not found');
    }

    const campaignType = dto.campaignType || 'slot_fill';
    const clients = await this.resolveCampaignClients(tenant, dto, campaignType);
    if (clients.length === 0) {
      throw new BadRequestException('No eligible clients found for rebooking campaign');
    }

    const campaignId = randomUUID();
    const recipients: CampaignRecipient[] = [];
    const slotFillOptions = this.normalizeSlotOptions(
      dto.slotOptions?.length
        ? dto.slotOptions
        : [
            {
              date: dto.date,
              startTime: dto.startTime,
              endTime: dto.endTime,
            },
          ],
    );
    const cycleSlotOptions =
      campaignType === 'cycle_followup'
        ? this.normalizeSlotOptions(
            dto.slotOptions?.length
              ? dto.slotOptions
              : await this.getDefaultCampaignSlotOptions(tenant, dto.date),
          )
        : [];

    for (const client of clients) {
      if (!client.telegramId || !client.serviceId) {
        continue;
      }

      const campaignMessage = this.buildPersonalizedCampaignMessage(
        client.firstName,
        campaignType === 'slot_fill'
          ? dto.message
          : this.appendSlotOptionsToMessage(dto.message, cycleSlotOptions, tenant.timezone),
      );

      const sent = await this.botService.sendMessage(
        bot.id,
        BigInt(client.telegramId),
        campaignMessage,
        {
          parseMode: 'HTML',
          replyMarkup:
            campaignType === 'slot_fill'
              ? {
                  inline_keyboard: [
                    [
                      {
                        text: '✨ Швидко записатися',
                        web_app: {
                          url: this.buildQuickBookingUrl(
                            tenant.slug,
                            client.serviceId,
                            dto.date,
                            dto.startTime,
                            campaignId,
                          ),
                        },
                      },
                    ],
                  ],
                }
              : this.buildCycleReplyMarkup(tenant.slug, client.serviceId, cycleSlotOptions),
        },
      );

      if (!sent) {
        continue;
      }

      recipients.push({
        clientId: client.id,
        firstName: client.firstName,
        telegramId: client.telegramId,
        serviceId: client.serviceId,
        serviceName: client.serviceName,
        status: 'sent',
      });
    }

    const campaigns = this.extractCampaigns(tenant.settings);
    campaigns.push({
      id: campaignId,
      type: campaignType,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      message: dto.message,
      createdAt: new Date().toISOString(),
      status: 'active',
      slotOptions: campaignType === 'cycle_followup' ? cycleSlotOptions : slotFillOptions,
      recipients,
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: this.withCampaigns(tenant.settings, campaigns),
      },
    });

    return {
      success: true,
      campaignId,
      sentCount: recipients.length,
    };
  }

  async handleCampaignBooking(
    tenantId: string,
    clientId: string,
    campaignId: string,
    serviceId: string,
  ) {
    const tenant = await this.getTenantContext(tenantId);
    const bot = await this.botService.findByTenantId(tenantId);
    if (!bot?.isActive) {
      return;
    }

    const campaigns = this.extractCampaigns(tenant.settings);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign || campaign.status === 'filled') {
      return;
    }

    let changed = false;
    for (const recipient of campaign.recipients) {
      if (recipient.clientId === clientId && recipient.status !== 'booked') {
        recipient.status = 'booked';
        campaign.bookedByClientId = clientId;
        campaign.status = 'filled';
        changed = true;
        continue;
      }

      if (recipient.status !== 'sent') {
        continue;
      }

      const promoAlternatives = await this.filterAvailableCampaignSlotOptions(
        tenantId,
        campaign.slotOptions || [],
        recipient.serviceId || serviceId,
      );

      const alternatives = promoAlternatives.filter(
        (slot) => !(slot.date === campaign.date && slot.startTime === campaign.startTime),
      );

      const alternativeLabel = alternatives
        .map((slot) => `${this.formatDateLabel(slot.date, tenant.timezone)} о ${slot.startTime}`)
        .join('\n');
      const replyMarkup = this.buildCampaignFollowUpReplyMarkup(
        tenant.slug,
        recipient.serviceId || serviceId,
        alternatives,
        campaign.id,
      );

      await this.botService.sendMessage(
        bot.id,
        BigInt(recipient.telegramId),
        `Привіт, ${this.escapeHtml(recipient.firstName)}!\n\nНа жаль, вікно ${this.formatDateLabel(campaign.date, tenant.timezone)} о ${campaign.startTime} вже зайняте.\n${alternativeLabel ? `\nМожеш вибрати інший час із цього промо:\n${this.escapeHtml(alternativeLabel)}` : '\nМожеш обрати інший зручний час у додатку 💜'}`,
        {
          parseMode: 'HTML',
          replyMarkup,
        },
      );

      recipient.status = 'closed';
      changed = true;
    }

    if (!changed) {
      return;
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: this.withCampaigns(tenant.settings, campaigns),
      },
    });
  }

  private async buildHeatmap(tenant: TenantContext, dates: string[]) {
    const step = this.getSlotStepMinutes(tenant.settings);
    const bookings = await this.getBookingsInRange(tenant.id, dates[0], dates[dates.length - 1]);
    const bookingsByDate = new Map<string, CompletedBookingRecord[]>();

    for (const booking of bookings) {
      const key = this.formatDateKey(booking.startTime, tenant.timezone);
      const list = bookingsByDate.get(key) || [];
      list.push(booking);
      bookingsByDate.set(key, list);
    }

    const result = [] as Array<{
      date: string;
      totalSlots: number;
      bookedSlots: number;
      freeSlots: number;
      occupancyRate: number;
    }>;

    for (const date of dates) {
      const slots = await this.scheduleService.getSlotTimesForDate(tenant.id, date);
      const bookingsForDate = bookingsByDate.get(date) || [];
      const bookedSlots = Math.min(
        slots.length,
        bookingsForDate.reduce(
          (total, booking) => total + Math.max(1, Math.ceil(booking.durationAtBooking / step)),
          0,
        ),
      );
      const totalSlots = slots.length;
      const freeSlots = Math.max(0, totalSlots - bookedSlots);
      const occupancyRate = totalSlots === 0 ? 0 : Math.round((bookedSlots / totalSlots) * 100);
      result.push({ date, totalSlots, bookedSlots, freeSlots, occupancyRate });
    }

    return result;
  }

  private async buildEmptySlots(tenant: TenantContext, dates: string[]) {
    const bookings = await this.getBookingsInRange(tenant.id, dates[0], dates[dates.length - 1]);
    const bookingsByDate = new Map<string, Set<string>>();

    for (const booking of bookings) {
      const dateKey = this.formatDateKey(booking.startTime, tenant.timezone);
      const list = bookingsByDate.get(dateKey) || new Set<string>();
      list.add(formatTimeInTimezone(booking.startTime, tenant.timezone));
      bookingsByDate.set(dateKey, list);
    }

    const result = [] as Array<{
      date: string;
      startTime: string;
      endTime: string;
      freeSlotCount: number;
      isMorning: boolean;
    }>;

    for (const date of dates) {
      const slots = await this.scheduleService.getSlotTimesForDate(tenant.id, date);
      const busy = bookingsByDate.get(date) || new Set<string>();
      const freeSlots = slots.filter((slot) => !busy.has(slot));
      const grouped = this.groupAdjacentSlots(freeSlots);

      for (const group of grouped) {
        result.push({
          date,
          startTime: group[0],
          endTime: this.endTimeFromGroup(group),
          freeSlotCount: group.length,
          isMorning: Number(group[0].split(':')[0]) < 12,
        });
      }
    }

    return result;
  }

  private async buildRecommendations(tenant: TenantContext, selectedDate: string) {
    const [clients, completedBookings, bookingStats, revenueByClient, activeServices] =
      await Promise.all([
        this.prisma.tenantClient.client.findMany({
          where: {
            tenantId: tenant.id,
            isBlocked: false,
            botBlocked: false,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            lastVisitAt: true,
            user: { select: { telegramId: true } },
          },
        }),
        this.prisma.tenantClient.booking.findMany({
          where: {
            tenantId: tenant.id,
            status: 'completed',
          },
          orderBy: { startTime: 'desc' },
          select: {
            clientId: true,
            startTime: true,
            durationAtBooking: true,
            priceAtBooking: true,
            serviceId: true,
            serviceNameSnapshot: true,
          },
        }),
        this.prisma.tenantClient.booking.groupBy({
          by: ['clientId'],
          where: { tenantId: tenant.id, status: 'completed' },
          _count: { id: true },
        }),
        this.prisma.tenantClient.booking.groupBy({
          by: ['clientId'],
          where: { tenantId: tenant.id, status: 'completed' },
          _sum: { priceAtBooking: true },
        }),
        this.prisma.tenantClient.service.findMany({
          where: { tenantId: tenant.id, isActive: true },
          select: { id: true, name: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);

    const bookingsByClient = new Map<string, CompletedBookingRecord[]>();
    for (const booking of completedBookings) {
      const list = bookingsByClient.get(booking.clientId) || [];
      if (list.length < 6) {
        list.push(booking);
      }
      bookingsByClient.set(booking.clientId, list);
    }

    const countByClient = new Map<string, number>(
      bookingStats.map((item) => [item.clientId, item._count.id] as const),
    );
    const revenueMap = new Map<string, number>(
      revenueByClient.map(
        (item) => [item.clientId, Number(item._sum.priceAtBooking || 0)] as const,
      ),
    );
    const fallbackService = activeServices[0] || null;
    const selectedDateObj = buildDateTimeInTimezone(selectedDate, '00:00', tenant.timezone);

    const recommendations = clients
      .filter((client) => Boolean(client.user?.telegramId))
      .map((client) => {
        const history = bookingsByClient.get(client.id) || [];
        if (history.length === 0) {
          return null;
        }

        const cycleDays =
          this.calculateAverageCycleDays(history.slice(0, 3)) ||
          this.getDefaultCycleDays(tenant.settings);

        const expectedReturnDate = new Date(history[0].startTime.getTime() + cycleDays * 86400000);
        const daysUntilExpected = Math.round(
          (expectedReturnDate.getTime() - selectedDateObj.getTime()) / 86400000,
        );
        if (daysUntilExpected > 7 || daysUntilExpected < -45) {
          return null;
        }

        const visitCount = countByClient.get(client.id) || 0;
        const servicePreference = this.getFavoriteService(history.slice(0, 3), fallbackService);
        const segments: SegmentKey[] = [];

        if (daysUntilExpected <= 3) segments.push('due_soon');
        if (visitCount >= 3) segments.push('visits_3_plus');
        if (this.isMorningClient(history.slice(0, 3), tenant.timezone)) segments.push('morning');
        if (servicePreference) segments.push('favorite_service');
        if (this.isIrregular(history.slice(0, 3))) segments.push('irregular');

        const daysOverdue = Math.max(0, -daysUntilExpected);
        const ltv = revenueMap.get(client.id) || 0;

        let priorityScore = 30;
        if (segments.includes('due_soon')) priorityScore += 35;
        if (visitCount >= 3) priorityScore += 15;
        if (segments.includes('morning')) priorityScore += 10;
        if (segments.includes('favorite_service')) priorityScore += 10;
        if (ltv >= 300000) priorityScore += 12;
        else if (ltv >= 150000) priorityScore += 6;
        if (segments.includes('irregular')) priorityScore -= 15;
        if (daysUntilExpected <= 0) priorityScore += 20;
        if (daysOverdue > 0) priorityScore += Math.min(daysOverdue * 3, 12);

        const priority: PriorityLevel =
          priorityScore >= 70 ? 'high' : priorityScore >= 50 ? 'medium' : 'low';

        return {
          clientId: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          telegramId: client.user?.telegramId?.toString() || null,
          lastVisitAt:
            client.lastVisitAt?.toISOString() || history[0]?.startTime.toISOString() || null,
          expectedReturnDate: expectedReturnDate.toISOString(),
          averageCycleDays: cycleDays,
          visitCount,
          ltv,
          priority,
          priorityScore,
          reason: this.buildReason(daysUntilExpected, cycleDays, priority, segments),
          segments,
          favoriteService: servicePreference,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.priorityScore || 0) - (a?.priorityScore || 0))
      .slice(0, 18);

    return recommendations;
  }

  private async buildKpis(tenant: TenantContext, dates: string[]) {
    const [bookingCounts, revenueByClient, heatmap] = await Promise.all([
      this.prisma.tenantClient.booking.groupBy({
        by: ['clientId'],
        where: { tenantId: tenant.id, status: 'completed' },
        _count: { id: true },
      }),
      this.prisma.tenantClient.booking.groupBy({
        by: ['clientId'],
        where: { tenantId: tenant.id, status: 'completed' },
        _sum: { priceAtBooking: true },
      }),
      this.buildHeatmap(tenant, dates),
    ]);

    const totalClients = bookingCounts.length;
    const repeatClients = bookingCounts.filter((item) => item._count.id >= 2).length;
    const totalRevenue = revenueByClient.reduce(
      (sum, item) => sum + Number(item._sum.priceAtBooking || 0),
      0,
    );

    const totalSlots = heatmap.reduce((sum, item) => sum + item.totalSlots, 0);
    const totalBookedSlots = heatmap.reduce((sum, item) => sum + item.bookedSlots, 0);

    return {
      repeatClientRate: totalClients === 0 ? 0 : Math.round((repeatClients / totalClients) * 100),
      occupancyRate: totalSlots === 0 ? 0 : Math.round((totalBookedSlots / totalSlots) * 100),
      averageLtv: totalClients === 0 ? 0 : Math.round(totalRevenue / totalClients),
    };
  }

  private async getRecommendationClients(tenantId: string, clientIds: string[]) {
    const [clients, completedBookings, activeServices] = await Promise.all([
      this.prisma.tenantClient.client.findMany({
        where: { tenantId, id: { in: clientIds } },
        select: {
          id: true,
          firstName: true,
          user: { select: { telegramId: true } },
        },
      }),
      this.prisma.tenantClient.booking.findMany({
        where: { tenantId, clientId: { in: clientIds }, status: 'completed' },
        orderBy: { startTime: 'desc' },
        select: {
          clientId: true,
          serviceId: true,
          serviceNameSnapshot: true,
          startTime: true,
          durationAtBooking: true,
          priceAtBooking: true,
        },
      }),
      this.prisma.tenantClient.service.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const bookingsByClient = new Map<string, CompletedBookingRecord[]>();
    for (const booking of completedBookings) {
      const list = bookingsByClient.get(booking.clientId) || [];
      if (list.length < 3) list.push(booking);
      bookingsByClient.set(booking.clientId, list);
    }

    const fallbackService = activeServices[0] || null;

    return clients.map((client) => {
      const history = bookingsByClient.get(client.id) || [];
      const favoriteService = this.getFavoriteService(history, fallbackService);
      return {
        id: client.id,
        firstName: client.firstName,
        telegramId: client.user.telegramId?.toString() || '',
        serviceId: favoriteService?.id || fallbackService?.id || '',
        serviceName: favoriteService?.name || fallbackService?.name || 'процедуру',
      };
    });
  }

  private async resolveCampaignClients(
    tenant: TenantContext,
    dto: SendRebookingCampaignDto,
    campaignType: RebookingCampaignType,
  ) {
    if (dto.includeAllClients) {
      if (campaignType === 'cycle_followup') {
        const selectedDate = dto.date || this.getTodayKey(tenant.timezone);
        const recommendations = await this.buildRecommendations(tenant, selectedDate);
        const eligibleRecommendations = recommendations.filter(
          (item): item is NonNullable<(typeof recommendations)[number]> => Boolean(item?.clientId),
        );
        return this.getRecommendationClients(
          tenant.id,
          eligibleRecommendations.map((item) => item.clientId),
        );
      }

      const clients = await this.prisma.tenantClient.client.findMany({
        where: {
          tenantId: tenant.id,
          isBlocked: false,
          botBlocked: false,
        },
        select: {
          id: true,
          user: {
            select: {
              telegramId: true,
            },
          },
        },
      });

      return this.getRecommendationClients(
        tenant.id,
        clients.filter((client) => Boolean(client.user.telegramId)).map((client) => client.id),
      );
    }

    return this.getRecommendationClients(tenant.id, dto.clientIds);
  }

  private async getDefaultCampaignSlotOptions(tenant: TenantContext, requestedDate?: string) {
    const startDate = requestedDate || this.getTodayKey(tenant.timezone);
    const emptySlots = await this.buildEmptySlots(tenant, this.getDateRange(startDate, 7));
    return emptySlots.slice(0, 6).map((slot) => ({
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  private normalizeSlotOptions(
    slotOptions: Array<{ date: string; startTime: string; endTime: string }> = [],
  ): CampaignSlotOption[] {
    const seen = new Set<string>();

    return slotOptions.filter((slot) => {
      const key = `${slot.date}-${slot.startTime}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private appendSlotOptionsToMessage(
    message: string,
    slotOptions: CampaignSlotOption[],
    timezone: string,
  ) {
    const summary = this.describeSlotOptionsMultiline(slotOptions, timezone);
    if (!summary) {
      return message.trim();
    }

    return `${message.trim()}\n\nНайближчі вільні дати:\n${summary}`;
  }

  private describeSlotOptionsInline(slotOptions: CampaignSlotOption[], timezone: string) {
    return slotOptions
      .slice(0, 4)
      .map((slot) => `${this.formatDateLabel(slot.date, timezone)} ${slot.startTime}`)
      .join(', ');
  }

  private describeSlotOptionsMultiline(slotOptions: CampaignSlotOption[], timezone: string) {
    const grouped = new Map<string, string[]>();

    for (const slot of slotOptions) {
      const list = grouped.get(slot.date) || [];
      list.push(slot.startTime);
      grouped.set(slot.date, list);
    }

    return [...grouped.entries()]
      .map(
        ([date, times]) =>
          `${this.formatDateLabel(date, timezone)}\n${times.map((time) => `• ${time}`).join(' ')}`,
      )
      .join('\n\n');
  }

  private buildCycleReplyMarkup(
    tenantSlug: string,
    serviceId: string,
    slotOptions: CampaignSlotOption[],
  ) {
    if (slotOptions.length === 0) {
      return undefined;
    }

    return {
      inline_keyboard: slotOptions.slice(0, 6).map((slot) => [
        {
          text: `${this.shortDateLabel(slot.date)} · ${slot.startTime}`,
          web_app: {
            url: this.buildQuickBookingUrl(tenantSlug, serviceId, slot.date, slot.startTime),
          },
        },
      ]),
    };
  }

  private buildCampaignFollowUpReplyMarkup(
    tenantSlug: string,
    serviceId: string,
    slotOptions: CampaignSlotOption[],
    campaignId: string,
  ) {
    if (slotOptions.length > 0) {
      return {
        inline_keyboard: slotOptions.slice(0, 6).map((slot) => [
          {
            text: `${this.shortDateLabel(slot.date)} · ${slot.startTime}`,
            web_app: {
              url: this.buildQuickBookingUrl(
                tenantSlug,
                serviceId,
                slot.date,
                slot.startTime,
                campaignId,
              ),
            },
          },
        ]),
      };
    }

    return {
      inline_keyboard: [
        [
          {
            text: '📲 Відкрити запис у додатку',
            web_app: {
              url: this.buildBookingAppUrl(tenantSlug, serviceId),
            },
          },
        ],
      ],
    };
  }

  private async getTenantContext(tenantId: string): Promise<TenantContext> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        displayName: true,
        timezone: true,
        settings: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      displayName: tenant.displayName,
      timezone: tenant.timezone || 'Europe/Kyiv',
      settings: tenant.settings,
    };
  }

  private async getBookingsInRange(tenantId: string, dateFrom: string, dateTo: string) {
    const start = new Date(`${dateFrom}T00:00:00.000Z`);
    const end = new Date(`${dateTo}T23:59:59.999Z`);

    return this.prisma.tenantClient.booking.findMany({
      where: {
        tenantId,
        status: { notIn: [BookingStatus.cancelled] },
        startTime: { gte: start, lte: end },
      },
      select: {
        clientId: true,
        startTime: true,
        durationAtBooking: true,
        priceAtBooking: true,
        serviceId: true,
        serviceNameSnapshot: true,
      },
    });
  }

  private calculateAverageCycleDays(bookings: CompletedBookingRecord[]) {
    if (bookings.length < 3) return null;

    const dates = bookings
      .map((booking) => booking.startTime)
      .sort((a, b) => b.getTime() - a.getTime());
    const intervalA = Math.round((dates[0].getTime() - dates[1].getTime()) / 86400000);
    const intervalB = Math.round((dates[1].getTime() - dates[2].getTime()) / 86400000);

    if (intervalA <= 0 || intervalB <= 0) {
      return null;
    }

    return Math.round((intervalA + intervalB) / 2);
  }

  private isMorningClient(bookings: CompletedBookingRecord[], timezone: string) {
    const morningCount = bookings.filter((booking) => {
      const hour = Number(formatTimeInTimezone(booking.startTime, timezone).split(':')[0]);
      return hour < 12;
    }).length;

    return morningCount >= 2;
  }

  private isIrregular(bookings: CompletedBookingRecord[]) {
    if (bookings.length < 3) return false;
    const dates = bookings
      .map((booking) => booking.startTime)
      .sort((a, b) => b.getTime() - a.getTime());
    const intervalA = Math.round((dates[0].getTime() - dates[1].getTime()) / 86400000);
    const intervalB = Math.round((dates[1].getTime() - dates[2].getTime()) / 86400000);
    return Math.abs(intervalA - intervalB) > 14;
  }

  private getFavoriteService(
    bookings: CompletedBookingRecord[],
    fallbackService: { id: string; name: string } | null,
  ) {
    const counts = new Map<string, { id: string; name: string; count: number }>();

    for (const booking of bookings.slice(0, 3)) {
      if (!booking.serviceId) continue;
      const entry = counts.get(booking.serviceId) || {
        id: booking.serviceId,
        name: booking.serviceNameSnapshot,
        count: 0,
      };
      entry.count += 1;
      counts.set(booking.serviceId, entry);
    }

    const favorite = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    if (favorite && favorite.count >= 2) {
      return { id: favorite.id, name: favorite.name };
    }

    return fallbackService;
  }

  private buildReason(
    daysUntilExpected: number,
    cycleDays: number,
    priority: PriorityLevel,
    segments: SegmentKey[],
  ) {
    if (daysUntilExpected >= 0 && daysUntilExpected <= 3) {
      return `За циклом клієнту варто нагадати за ${daysUntilExpected} дні до звичного візиту (${cycleDays} дн.)`;
    }
    if (daysUntilExpected < 0) {
      return `Клієнт уже наближається або перевищив звичний цикл (${cycleDays} дн.)`;
    }
    if (segments.includes('irregular')) {
      return 'Клієнт ходить нерегулярно, але варто нагадати з низьким пріоритетом';
    }
    return priority === 'high'
      ? 'Високий шанс повернення у найближчий слот'
      : 'Хороший кандидат для м’якого нагадування';
  }

  private buildCampaignLog(settings: Prisma.JsonValue | null): CampaignLogItem[] {
    return this.extractCampaigns(settings)
      .slice()
      .reverse()
      .slice(0, 8)
      .map((campaign) => ({
        id: campaign.id,
        type: campaign.type || 'slot_fill',
        date: campaign.date,
        startTime: campaign.startTime,
        endTime: campaign.endTime,
        createdAt: campaign.createdAt,
        status: campaign.status,
        sentCount: campaign.recipients.filter((recipient) => recipient.status === 'sent').length,
        bookedCount: campaign.recipients.filter((recipient) => recipient.status === 'booked')
          .length,
        closedCount: campaign.recipients.filter((recipient) => recipient.status === 'closed')
          .length,
      }));
  }

  private async generateAiMessage(input: {
    campaignType: RebookingCampaignType;
    tenantName: string;
    dateLabel?: string;
    startTime?: string;
    endTime?: string;
    tone: 'soft' | 'friendly';
    extraInstructions?: string;
    recipientNames: string[];
    slotOptions: CampaignSlotOption[];
    timezone: string;
  }) {
    const fallback = this.generateFallbackMessage(input);
    if (!this.aiApiKey) {
      return fallback;
    }

    try {
      const prompt = [
        'Ти допомагаєш б’юті-майстру написати коротке повідомлення клієнту в Telegram.',
        'Напиши одне повідомлення українською мовою.',
        'Тон: ' + (input.tone === 'soft' ? 'м’який і турботливий' : 'дружній і теплий') + '.',
        'ЗАБОРОНЕНО: звинувачувати клієнта, запитувати "чому не прийшов/прийшла", натякати на провину, використовувати негативні формулювання.',
        'ОБОВ\'ЯЗКОВО: бути турботливим і позитивним, показати що майстер скучив/рад бачити, запропонувати зручний час. Без знижок.',
        input.campaignType === 'slot_fill'
          ? `Є вільне вікно ${input.dateLabel} з ${input.startTime} до ${input.endTime}.`
          : `Потрібно м’яко нагадати клієнту про повторний візит (з моменту останнього пройшло близько ${this.defaultCycleDays} днів) і запропонувати записатися знову.`,
        `Назва майстра або студії: ${input.tenantName}.`,
        input.recipientNames.length > 0
          ? `Можна звернутися по імені: ${input.recipientNames[0]}.`
          : 'Без звернення по імені.',
        input.campaignType === 'cycle_followup' && input.slotOptions.length > 0
          ? `Найближчі вільні варіанти: ${this.describeSlotOptionsInline(input.slotOptions, input.timezone)}.`
          : null,
        input.extraInstructions?.trim()
          ? `Тема/контекст повідомлення від майстра (НЕ копіюй дослівно, переформулюй ПОЗИТИВНО і ТУРБОТЛИВО): ${input.extraInstructions.trim()}.`
          : null,
        'Довжина: 2-4 короткі абзаци, без лапок, без службових пояснень.',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.aiApiKey}`,
        },
        body: JSON.stringify({
          model: this.aiModel,
          temperature: 0.8,
          messages: [
            { role: 'system', content: 'Відповідай лише готовим текстом повідомлення. Ніколи не звинувачуй клієнта, не питай "чому не прийшов", завжди пиши в позитивному турботливому тоні.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.warn(`AI message generation failed: HTTP ${response.status}`);
        return fallback;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content || fallback;
    } catch (error) {
      this.logger.warn(`AI message generation fallback used: ${String(error)}`);
      return fallback;
    }
  }

  private generateFallbackMessage(input: {
    campaignType: RebookingCampaignType;
    tenantName: string;
    dateLabel?: string;
    startTime?: string;
    endTime?: string;
    tone: 'soft' | 'friendly';
    extraInstructions?: string;
    recipientNames: string[];
    slotOptions: CampaignSlotOption[];
    timezone: string;
  }) {
    const intro =
      input.tone === 'soft'
        ? 'Хочу м’яко нагадати, що вже може бути час оновити процедуру ✨'
        : 'Дружньо нагадую, що вже може бути час потішити себе процедурою 💜';
    const greeting = input.recipientNames[0] ? `Привіт, ${input.recipientNames[0]}!` : 'Привіт!';

    if (input.campaignType === 'cycle_followup') {
      const summary = this.describeSlotOptionsMultiline(input.slotOptions, input.timezone);
      return `${greeting}\n\n${intro}\nВід останнього візиту вже минуло близько 3 тижнів, тож саме час обрати новий запис 🌷${summary ? `\n\nОсь найближчі вільні дати:\n${summary}` : ''}`;
    }

    const guidance = input.extraInstructions?.trim() ? ` ${input.extraInstructions.trim()}` : '';

    return `${greeting}\n\n${intro}${guidance}\nУ ${input.tenantName} звільнилося вікно ${input.dateLabel} з ${input.startTime} до ${input.endTime}. Якщо тобі зручно — можеш швидко записатися прямо тут 🌷`;
  }

  private async filterAvailableCampaignSlotOptions(
    tenantId: string,
    slotOptions: CampaignSlotOption[],
    serviceId: string,
  ) {
    if (slotOptions.length === 0) {
      return [] as CampaignSlotOption[];
    }

    const uniqueDates = [...new Set(slotOptions.map((slot) => slot.date))];
    const availableByDate = new Map<string, Set<string>>();

    for (const date of uniqueDates) {
      const slots = await this.getAvailableServiceSlots(tenantId, date, serviceId);
      availableByDate.set(date, new Set(slots.map((slot) => slot.startTime)));
    }

    return slotOptions.filter((slot) => availableByDate.get(slot.date)?.has(slot.startTime));
  }

  private async getAvailableServiceSlots(tenantId: string, date: string, serviceId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const service = await this.prisma.tenantClient.service.findFirst({
      where: { tenantId, id: serviceId, isActive: true },
      select: { durationMinutes: true },
    });

    if (!tenant || !service) {
      return [] as Array<{ startTime: string; endTime: string }>;
    }

    const timezone = tenant.timezone || 'Europe/Kyiv';
    const configuredSlots = await this.scheduleService.getSlotTimesForDate(tenantId, date);
    const dayStart = buildDateTimeInTimezone(date, '00:00', timezone);
    const dayEnd = buildDateTimeInTimezone(date, '23:59', timezone);
    const existingBookings = await this.prisma.tenantClient.booking.findMany({
      where: {
        tenantId,
        status: { notIn: [BookingStatus.cancelled] },
        startTime: { gte: dayStart, lte: dayEnd },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    const now = new Date();

    return configuredSlots
      .map((slotStart) => {
        const slotStartDate = buildDateTimeInTimezone(date, slotStart, timezone);
        if (slotStartDate <= now) {
          return null;
        }
        const slotEndDate = new Date(slotStartDate.getTime() + service.durationMinutes * 60000);
        const overlapping = existingBookings.some(
          (booking) => booking.startTime < slotEndDate && booking.endTime > slotStartDate,
        );
        if (overlapping) {
          return null;
        }
        return {
          startTime: slotStart,
          endTime: formatTimeInTimezone(slotEndDate, timezone),
        };
      })
      .filter((slot): slot is { startTime: string; endTime: string } => Boolean(slot));
  }

  private buildQuickBookingUrl(
    tenantSlug: string,
    serviceId: string,
    date: string,
    startTime: string,
    campaignId?: string,
  ) {
    const normalizedBase = this.appUrl.endsWith('/') ? this.appUrl.slice(0, -1) : this.appUrl;
    const campaignQuery = campaignId ? `&campaignId=${campaignId}` : '';
    return `${normalizedBase}/client/book/${serviceId}?startapp=${tenantSlug}&date=${date}&slot=${startTime}${campaignQuery}`;
  }

  private buildBookingAppUrl(tenantSlug: string, serviceId: string) {
    const normalizedBase = this.appUrl.endsWith('/') ? this.appUrl.slice(0, -1) : this.appUrl;
    return `${normalizedBase}/client/book/${serviceId}?startapp=${tenantSlug}`;
  }

  private buildPersonalizedCampaignMessage(firstName: string, rawMessage: string) {
    const normalizedMessage = rawMessage.trim();
    const withoutGreeting = normalizedMessage
      .replace(/^привіт(?:,?\s*[\p{L}'’-]+)?!?\s*/iu, '')
      .replace(/^доброго\s+дня(?:,?\s*[\p{L}'’-]+)?!?\s*/iu, '')
      .trimStart();

    const escapedBody = this.escapeHtml(withoutGreeting || normalizedMessage);

    return `Привіт, ${this.escapeHtml(firstName)}!${escapedBody ? `\n\n${escapedBody}` : ''}`;
  }

  private shortDateLabel(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'short',
    });
  }

  private formatDateKey(date: Date, timezone: string) {
    return date.toLocaleDateString('en-CA', { timeZone: timezone });
  }

  private getTodayKey(timezone: string) {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  }

  private getDateRange(startDate: string, count: number) {
    const start = new Date(`${startDate}T00:00:00`);
    return Array.from({ length: count }, (_, index) => {
      const current = new Date(start);
      current.setDate(start.getDate() + index);
      return current.toISOString().split('T')[0];
    });
  }

  private formatDateLabel(date: string, timezone: string) {
    return buildDateTimeInTimezone(date, '00:00', timezone).toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      weekday: 'short',
      timeZone: timezone,
    });
  }

  private groupAdjacentSlots(slots: string[]) {
    const sorted = [...slots].sort();
    const groups: string[][] = [];

    for (const slot of sorted) {
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup) {
        groups.push([slot]);
        continue;
      }

      const previous = currentGroup[currentGroup.length - 1];
      if (this.areAdjacent(previous, slot)) {
        currentGroup.push(slot);
      } else {
        groups.push([slot]);
      }
    }

    return groups;
  }

  private areAdjacent(previous: string, next: string) {
    return this.timeToMinutes(next) - this.timeToMinutes(previous) === this.getDefaultStep();
  }

  private endTimeFromGroup(group: string[]) {
    const last = group[group.length - 1];
    return this.minutesToTime(this.timeToMinutes(last) + this.getDefaultStep());
  }

  private timeToMinutes(value: string) {
    const [hours = 0, minutes = 0] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private getSlotStepMinutes(settings: Prisma.JsonValue | null) {
    const object = this.asObject(settings);
    const slotStep = object.slot_step_minutes;
    return typeof slotStep === 'number' ? slotStep : this.getDefaultStep();
  }

  private getDefaultCycleDays(settings: Prisma.JsonValue | null) {
    const object = this.asObject(settings);
    const cycleDays = object.rebooking_default_cycle_days;
    return typeof cycleDays === 'number' && cycleDays > 0 ? cycleDays : this.defaultCycleDays;
  }

  private getDefaultStep() {
    return 30;
  }

  private extractCampaigns(settings: Prisma.JsonValue | null) {
    const object = this.asObject(settings);
    const campaigns = object[this.campaignsKey];
    return Array.isArray(campaigns) ? (campaigns as StoredCampaign[]) : [];
  }

  private withCampaigns(settings: Prisma.JsonValue | null, campaigns: StoredCampaign[]) {
    const object = this.asObject(settings);
    return {
      ...object,
      [this.campaignsKey]: campaigns.slice(-25),
    } as unknown as Prisma.InputJsonValue;
  }

  private asObject(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {} as Record<string, unknown>;
    }
    return value as Record<string, unknown>;
  }

  private escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
