import { useState, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Sparkles,
  Bot,
  KeyRound,
  CheckCircle,
  ChevronLeft,
  Scissors,
  Calendar,
  Gem,
  MessageCircle,
  PartyPopper,
  Copy,
  Smartphone,
  Users,
} from 'lucide-react';
import { useAuth, useCreateService } from '@/hooks';
import { Button, Input, Card } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import { WEEK_DAY_KEYS } from '@/lib/schedule';
import { useWeeklyScheduleDraft } from '@/hooks';
import type { CreateServiceDto, ApiResponse } from '@/types';
import styles from './OnboardingWizard.module.css';

const SHOWCASE_STEPS = 4;
const REGISTRATION_START_STEP = SHOWCASE_STEPS + 1;
const TOTAL_STEPS = SHOWCASE_STEPS + 5;
const DEVELOPER_CONTACT_URL = 'https://t.me/loony_5';
const NAILIO_BOT_URL = 'https://t.me/nailioapp_bot';

interface AddedService {
  name: string;
  price: number;
  durationMinutes: number;
}

export function OnboardingWizard() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { setOnboardingComplete } = useAuth();
  const createService = useCreateService();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 3: Bot token
  const [botToken, setBotToken] = useState('');
  const [botInfo, setBotInfo] = useState<{ username: string } | null>(null);
  const [tokenError, setTokenError] = useState('');

  // Step 4: Services
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDuration, setServiceDuration] = useState('60');
  const [addedServices, setAddedServices] = useState<AddedService[]>([]);
  const [serviceError, setServiceError] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  // Step 5: Schedule
  const {
    draft: schedule,
    toggleDay,
    addSlot,
    copyPreviousDay,
    changeSlot,
    removeSlot,
    serializeDays,
  } = useWeeklyScheduleDraft();

  const next = useCallback(() => {
    getTelegram()?.HapticFeedback.impactOccurred('light');
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }, []);

  const prev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  // Step 3: Validate & connect bot
  const handleConnectBot = async () => {
    setTokenError('');
    setLoading(true);
    try {
      const res = await api.post<
        ApiResponse<{
          id: string;
          botUsername: string;
          botId: number;
          isActive: boolean;
        }>
      >('/onboarding/connect-bot', {
        botToken,
      });
      setBotInfo({ username: res.data.botUsername });
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setTokenError(
        error instanceof ApiRequestError
          ? error.message
          : intl.formatMessage({ id: 'onboarding.tokenError' }),
      );
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Add service
  const saveCurrentService = async (): Promise<boolean> => {
    setServiceError('');

    const trimmedServiceName = serviceName.trim();
    const parsedPrice = Number(servicePrice);
    const parsedDuration = Number(serviceDuration);

    if (!trimmedServiceName || !Number.isFinite(parsedPrice) || !Number.isFinite(parsedDuration)) {
      setServiceError(intl.formatMessage({ id: 'error.unknown' }));
      return false;
    }

    try {
      const dto: CreateServiceDto = {
        name: trimmedServiceName,
        price: Math.round(parsedPrice * 100),
        durationMinutes: parsedDuration,
        currency: 'UAH',
      };
      await createService.mutateAsync(dto);
      setAddedServices((prev) => [
        ...prev,
        { name: trimmedServiceName, price: parsedPrice, durationMinutes: parsedDuration },
      ]);
      setServiceName('');
      setServicePrice('');
      setServiceDuration('60');
      getTelegram()?.HapticFeedback.impactOccurred('light');
      return true;
    } catch (error) {
      setServiceError(
        error instanceof ApiRequestError
          ? error.message
          : intl.formatMessage({ id: 'error.unknown' }),
      );
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      return false;
    }
  };

  const handleAddService = async () => {
    await saveCurrentService();
  };

  const handleSaveServices = async () => {
    if (serviceName.trim() || servicePrice.trim() || serviceDuration.trim()) {
      const saved = await saveCurrentService();
      if (!saved) {
        return;
      }
      next();
      return;
    }

    if (addedServices.length > 0) {
      next();
      return;
    }

    setServiceError(intl.formatMessage({ id: 'services.name' }));
  };

  // Step 5: Save schedule
  const handleSaveSchedule = async () => {
    setScheduleError('');
    setLoading(true);
    try {
      await api.put('/schedule/hours', {
        days: serializeDays(),
      });
      next();
    } catch (error) {
      setScheduleError(
        error instanceof ApiRequestError
          ? error.message
          : intl.formatMessage({ id: 'error.unknown' }),
      );
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  // Step 6: Finish
  const handleFinish = () => {
    setOnboardingComplete();
    getTelegram()?.HapticFeedback.notificationOccurred('success');
    navigate('/master', { replace: true });
  };

  const progressPct = (step / TOTAL_STEPS) * 100;

  const openTelegramTarget = useCallback((url: string) => {
    const telegram = getTelegram();
    if (url.includes('t.me/')) {
      telegram?.openTelegramLink?.(url);
    } else {
      telegram?.openLink?.(url);
    }

    if (!telegram) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleContactDeveloper = useCallback(() => {
    getTelegram()?.HapticFeedback.impactOccurred('light');
    openTelegramTarget(DEVELOPER_CONTACT_URL);
  }, [openTelegramTarget]);

  const handleSignIn = useCallback(() => {
    getTelegram()?.HapticFeedback.impactOccurred('light');
    openTelegramTarget(NAILIO_BOT_URL);
  }, [openTelegramTarget]);

  const handleStartRegistration = useCallback(() => {
    getTelegram()?.HapticFeedback.notificationOccurred('success');
    setStep(REGISTRATION_START_STEP);
  }, []);

  return (
    <div className={styles.wizard}>
      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>
      <div className={styles.stepIndicator}>
        {step} / {TOTAL_STEPS}
      </div>

      {/* Step 1: Showcase hero */}
      {step === 1 && (
        <div className={styles.stepContent}>
          <div className={styles.showcaseHeader}>
            <div className={styles.showcaseEyebrow}>
              <Gem size={14} />
              {intl.formatMessage({ id: 'onboarding.showcaseEyebrow' })}
            </div>
            <h1 className={styles.showcaseTitle}>
              {intl.formatMessage({ id: 'onboarding.showcase1.title' })}
            </h1>
            <p className={styles.showcaseDescription}>
              {intl.formatMessage({ id: 'onboarding.showcase1.description' })}
            </p>
          </div>
          <div className={styles.showcasePhone}>
            <div className={styles.phoneGlow} />
            <div className={styles.phoneFrame}>
              <div className={styles.phoneTopBar}>
                <div>
                  <div className={styles.phoneBrand}>Nailio</div>
                  <div className={styles.phoneLabel}>Beauty booking mini app</div>
                </div>
                <span className={styles.liveBadge}>
                  {intl.formatMessage({ id: 'onboarding.showcaseLive' })}
                </span>
              </div>
              <div className={styles.phoneHeroCard}>
                <div className={styles.phoneHeroIcon}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <div className={styles.phoneHeroTitle}>
                    {intl.formatMessage({ id: 'onboarding.showcase1.cardTitle' })}
                  </div>
                  <div className={styles.phoneHeroText}>
                    {intl.formatMessage({ id: 'onboarding.showcase1.cardText' })}
                  </div>
                </div>
              </div>
              <div className={styles.phoneServiceRow}>
                <span className={styles.phoneChip}>Манікюр</span>
                <span className={styles.phoneChip}>Покриття</span>
                <span className={styles.phoneChip}>Дизайн</span>
              </div>
              <div className={styles.phoneSurface}>
                <div className={styles.surfaceHeader}>
                  <span>{intl.formatMessage({ id: 'onboarding.showcase1.surfaceTitle' })}</span>
                  <BadgeCheck size={16} />
                </div>
                <div className={styles.timeGrid}>
                  <span className={styles.timePill}>10:00</span>
                  <span className={styles.timePill}>11:30</span>
                  <span className={styles.timePillActive}>13:00</span>
                  <span className={styles.timePill}>15:30</span>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.showcaseFooterCard}>
            <MessageCircle size={18} />
            <div>
              <div className={styles.showcaseFooterTitle}>
                {intl.formatMessage({ id: 'onboarding.contactDeveloper' })}
              </div>
              <div className={styles.showcaseFooterText}>
                {intl.formatMessage({ id: 'onboarding.showcaseSupport' })}
              </div>
            </div>
          </div>
          <div className={styles.showcaseActions}>
            <Button variant="secondary" fullWidth onClick={handleSignIn}>
              {intl.formatMessage({ id: 'onboarding.signIn' })}
            </Button>
            <Button fullWidth onClick={next}>
              {intl.formatMessage({ id: 'common.next' })}
              <ArrowRight size={16} />
            </Button>
          </div>
          <button type="button" className={styles.showcaseLinkButton} onClick={handleContactDeveloper}>
            {intl.formatMessage({ id: 'onboarding.contactDeveloper' })}
          </button>
        </div>
      )}

      {/* Step 2: Showcase booking flow */}
      {step === 2 && (
        <div className={styles.stepContent}>
          <div className={styles.showcaseHeader}>
            <div className={styles.showcaseEyebrow}>
              <Smartphone size={14} />
              {intl.formatMessage({ id: 'onboarding.showcaseSectionClient' })}
            </div>
            <h1 className={styles.showcaseTitle}>
              {intl.formatMessage({ id: 'onboarding.showcase2.title' })}
            </h1>
            <p className={styles.showcaseDescription}>
              {intl.formatMessage({ id: 'onboarding.showcase2.description' })}
            </p>
          </div>
          <div className={styles.clientJourneyCard}>
            <div className={styles.clientJourneyStep}>
              <span className={styles.clientJourneyIndex}>1</span>
              <div>
                <div className={styles.clientJourneyTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step1Title' })}
                </div>
                <div className={styles.clientJourneyText}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step1Text' })}
                </div>
              </div>
            </div>
            <div className={styles.clientJourneyStep}>
              <span className={styles.clientJourneyIndex}>2</span>
              <div>
                <div className={styles.clientJourneyTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step2Title' })}
                </div>
                <div className={styles.clientJourneyText}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step2Text' })}
                </div>
              </div>
            </div>
            <div className={styles.clientJourneyStep}>
              <span className={styles.clientJourneyIndex}>3</span>
              <div>
                <div className={styles.clientJourneyTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step3Title' })}
                </div>
                <div className={styles.clientJourneyText}>
                  {intl.formatMessage({ id: 'onboarding.showcase2.step3Text' })}
                </div>
              </div>
            </div>
          </div>
          <div className={styles.showcaseChips}>
            <span className={styles.showcaseStatChip}>2 tap booking</span>
            <span className={styles.showcaseStatChip}>Telegram reminders</span>
            <span className={styles.showcaseStatChip}>24/7</span>
          </div>
          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" fullWidth onClick={handleSignIn}>
              {intl.formatMessage({ id: 'onboarding.signIn' })}
            </Button>
            <Button fullWidth onClick={next}>
              {intl.formatMessage({ id: 'common.next' })}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Showcase control */}
      {step === 3 && (
        <div className={styles.stepContent}>
          <div className={styles.showcaseHeader}>
            <div className={styles.showcaseEyebrow}>
              <Users size={14} />
              {intl.formatMessage({ id: 'onboarding.showcaseSectionMaster' })}
            </div>
            <h1 className={styles.showcaseTitle}>
              {intl.formatMessage({ id: 'onboarding.showcase3.title' })}
            </h1>
            <p className={styles.showcaseDescription}>
              {intl.formatMessage({ id: 'onboarding.showcase3.description' })}
            </p>
          </div>
          <div className={styles.metricsGrid}>
            <div className={styles.metricCardPrimary}>
              <div className={styles.metricLabel}>
                {intl.formatMessage({ id: 'onboarding.showcase3.metric1Label' })}
              </div>
              <div className={styles.metricValue}>36</div>
              <div className={styles.metricTrend}>+12% this week</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>
                {intl.formatMessage({ id: 'onboarding.showcase3.metric2Label' })}
              </div>
              <div className={styles.metricValueDark}>18 400 ₴</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>
                {intl.formatMessage({ id: 'onboarding.showcase3.metric3Label' })}
              </div>
              <div className={styles.metricValueDark}>92%</div>
            </div>
          </div>
          <div className={styles.showcasePanel}>
            <div className={styles.surfaceHeader}>
              <span>{intl.formatMessage({ id: 'onboarding.showcase3.panelTitle' })}</span>
              <BadgeCheck size={16} />
            </div>
            <div className={styles.timelineItem}>
              <span className={styles.timelineDot} />
              <span>{intl.formatMessage({ id: 'onboarding.showcase3.panelItem1' })}</span>
            </div>
            <div className={styles.timelineItem}>
              <span className={styles.timelineDot} />
              <span>{intl.formatMessage({ id: 'onboarding.showcase3.panelItem2' })}</span>
            </div>
            <div className={styles.timelineItem}>
              <span className={styles.timelineDot} />
              <span>{intl.formatMessage({ id: 'onboarding.showcase3.panelItem3' })}</span>
            </div>
          </div>
          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" fullWidth onClick={handleContactDeveloper}>
              {intl.formatMessage({ id: 'onboarding.contactDeveloper' })}
            </Button>
            <Button fullWidth onClick={next}>
              {intl.formatMessage({ id: 'common.next' })}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Showcase final */}
      {step === 4 && (
        <div className={styles.stepContent}>
          <div className={styles.showcaseHeader}>
            <div className={styles.showcaseEyebrow}>
              <Sparkles size={14} />
              {intl.formatMessage({ id: 'onboarding.showcaseSectionGrowth' })}
            </div>
            <h1 className={styles.showcaseTitle}>
              {intl.formatMessage({ id: 'onboarding.showcase4.title' })}
            </h1>
            <p className={styles.showcaseDescription}>
              {intl.formatMessage({ id: 'onboarding.showcase4.description' })}
            </p>
          </div>
          <div className={styles.flowCard}>
            <div className={styles.flowItem}>
              <div className={styles.flowIconWrap}>
                <Calendar size={18} />
              </div>
              <div>
                <div className={styles.flowTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow1Title' })}
                </div>
                <div className={styles.flowText}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow1Text' })}
                </div>
              </div>
            </div>
            <div className={styles.flowArrow}>→</div>
            <div className={styles.flowItem}>
              <div className={styles.flowIconWrap}>
                <Bot size={18} />
              </div>
              <div>
                <div className={styles.flowTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow2Title' })}
                </div>
                <div className={styles.flowText}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow2Text' })}
                </div>
              </div>
            </div>
            <div className={styles.flowArrow}>→</div>
            <div className={styles.flowItem}>
              <div className={styles.flowIconWrap}>
                <BadgeCheck size={18} />
              </div>
              <div>
                <div className={styles.flowTitle}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow3Title' })}
                </div>
                <div className={styles.flowText}>
                  {intl.formatMessage({ id: 'onboarding.showcase4.flow3Text' })}
                </div>
              </div>
            </div>
          </div>
          <div className={styles.showcaseFinalCard}>
            <div className={styles.showcaseFinalTitle}>
              {intl.formatMessage({ id: 'onboarding.showcase4.finalTitle' })}
            </div>
            <div className={styles.showcaseFinalText}>
              {intl.formatMessage({ id: 'onboarding.showcase4.finalText' })}
            </div>
          </div>
          <div className={styles.navButtonsStack}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
              {intl.formatMessage({ id: 'common.back' })}
            </Button>
            <Button variant="secondary" fullWidth onClick={handleSignIn}>
              {intl.formatMessage({ id: 'onboarding.signIn' })}
            </Button>
            <Button fullWidth onClick={handleStartRegistration}>
              {intl.formatMessage({ id: 'onboarding.start' })}
              <ArrowRight size={16} />
            </Button>
          </div>
          <button type="button" className={styles.showcaseLinkButton} onClick={handleContactDeveloper}>
            {intl.formatMessage({ id: 'onboarding.contactDeveloper' })}
          </button>
        </div>
      )}

      {/* Step 5: BotFather instructions */}
      {step === 5 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <Bot size={48} />
          </div>
          <h1 className={styles.stepTitle}>{intl.formatMessage({ id: 'onboarding.createBot' })}</h1>
          <div className={styles.instructions}>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>1</span>
              <span>{intl.formatMessage({ id: 'onboarding.openBotFather' })}</span>
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => getTelegram()?.openTelegramLink?.('https://t.me/BotFather/mybots')}
            >
              {intl.formatMessage({ id: 'onboarding.openBotFatherBtn' })}
            </Button>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>2</span>
              <span>{intl.formatMessage({ id: 'onboarding.createNewBot' })}</span>
            </div>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>3</span>
              <span>{intl.formatMessage({ id: 'onboarding.enterBotName' })}</span>
            </div>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>4</span>
              <span>{intl.formatMessage({ id: 'onboarding.copyToken' })}</span>
            </div>
          </div>
          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button fullWidth onClick={next}>
              {intl.formatMessage({ id: 'onboarding.copied' })}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Enter token */}
      {step === 6 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <KeyRound size={48} />
          </div>
          <h1 className={styles.stepTitle}>
            {intl.formatMessage({ id: 'onboarding.enterToken' })}
          </h1>
          <Input
            label={intl.formatMessage({ id: 'onboarding.tokenLabel' })}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            error={tokenError}
            hint="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
          />
          {!botInfo && (
            <Button
              fullWidth
              loading={loading}
              onClick={handleConnectBot}
              disabled={!botToken || botToken.length < 20}
            >
              {intl.formatMessage({ id: 'onboarding.connectBot' })}
            </Button>
          )}
          {botInfo && (
            <Card style={{ marginTop: 12, textAlign: 'center' as const }}>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={16} color="var(--color-success)" />{' '}
                  {intl.formatMessage({ id: 'onboarding.botFound' })}
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, margin: '4px 0' }}>
                  @{botInfo.username}
                </div>
              </div>
            </Card>
          )}
          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button fullWidth onClick={next} disabled={!botInfo}>
              {intl.formatMessage({ id: 'common.next' })}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step 7: Services */}
      {step === 7 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <Scissors size={48} />
          </div>
          <h1 className={styles.stepTitle}>
            {intl.formatMessage({ id: 'onboarding.addServices' })}
          </h1>

          {addedServices.length > 0 && (
            <div className={styles.addedList}>
              {addedServices.map((s, i) => (
                <div key={i} className={styles.addedItem}>
                  <CheckCircle
                    size={14}
                    color="var(--color-success)"
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                  />
                  {s.name} — {s.price} ₴ · {s.durationMinutes}{' '}
                  {intl.formatMessage({ id: 'common.min' })}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input
              label={intl.formatMessage({ id: 'services.name' })}
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              error={serviceError}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                label={intl.formatMessage({ id: 'services.price' })}
                type="number"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
              />
              <Input
                label={intl.formatMessage({ id: 'services.duration' })}
                type="number"
                value={serviceDuration}
                onChange={(e) => setServiceDuration(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              fullWidth
              loading={createService.isPending}
              onClick={handleAddService}
              disabled={!serviceName || !servicePrice}
            >
              + {intl.formatMessage({ id: 'onboarding.addMore' })}
            </Button>
          </div>

          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" fullWidth onClick={next} disabled={createService.isPending}>
              {intl.formatMessage({ id: 'common.skip' })}
            </Button>
            <Button fullWidth onClick={handleSaveServices} loading={createService.isPending}>
              {intl.formatMessage({ id: 'common.save' })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 8: Schedule */}
      {step === 8 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <Calendar size={48} />
          </div>
          <h1 className={styles.stepTitle}>
            {intl.formatMessage({ id: 'onboarding.setupSchedule' })}
          </h1>

          <div className={styles.scheduleList}>
            {WEEK_DAY_KEYS.map((dayKey, index) => {
              const day = schedule[index]!;
              return (
                <div key={dayKey} className={styles.scheduleRow}>
                  <label className={styles.scheduleDay}>
                    <input
                      type="checkbox"
                      checked={!day.isDayOff}
                      onChange={() => {
                        toggleDay(day.dayOfWeek);
                      }}
                    />
                    <span>{intl.formatMessage({ id: `schedule.${dayKey}` })}</span>
                  </label>
                  {!day.isDayOff && (
                    <div className={styles.scheduleTime}>
                      {day.slots.map((slot, slotIndex) => (
                        <div
                          key={`${day.dayOfWeek}-${slotIndex}`}
                          className={styles.scheduleSlotRow}
                        >
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={slot}
                            onChange={(e) => {
                              changeSlot(day.dayOfWeek, slotIndex, e.target.value);
                            }}
                          />
                          <button
                            type="button"
                            className={styles.removeSlotBtn}
                            onClick={() => {
                              removeSlot(day.dayOfWeek, slotIndex);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className={styles.scheduleActions}>
                        {index > 0 && (
                          <button
                            type="button"
                            className={styles.secondarySlotBtn}
                            onClick={() => {
                              copyPreviousDay(day.dayOfWeek);
                            }}
                          >
                            {intl.formatMessage({ id: 'schedule.copyPreviousDay' })}
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.addSlotBtn}
                          onClick={() => {
                            addSlot(day.dayOfWeek);
                          }}
                        >
                          + {intl.formatMessage({ id: 'schedule.addSlot' })}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {scheduleError ? (
            <div style={{ color: 'var(--color-destructive)', fontSize: 14 }}>{scheduleError}</div>
          ) : null}

          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              <ChevronLeft size={16} />
            </Button>
            <Button fullWidth loading={loading} onClick={handleSaveSchedule}>
              {intl.formatMessage({ id: 'common.save' })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 9: Done */}
      {step === 9 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <PartyPopper size={48} />
          </div>
          <h1 className={styles.stepTitle}>{intl.formatMessage({ id: 'onboarding.done' })}</h1>
          <p className={styles.stepDescription}>
            {intl.formatMessage({ id: 'onboarding.doneDesc' })}
          </p>

          {botInfo && (
            <Card style={{ textAlign: 'center' as const, marginBottom: 16 }}>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                  @{botInfo.username}
                </div>
                <div className={styles.botLink}>t.me/{botInfo.username}</div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(`https://t.me/${botInfo.username}`);
                    getTelegram()?.HapticFeedback.notificationOccurred('success');
                  }}
                >
                  <Copy
                    size={14}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                  />
                  {intl.formatMessage({ id: 'onboarding.copyLink' })}
                </Button>
              </div>
            </Card>
          )}

          <div className={styles.trialBadge}>
            <Smartphone
              size={16}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            />
            {intl.formatMessage({ id: 'onboarding.trialInfo' })}
          </div>

          <Button fullWidth onClick={handleFinish}>
            {intl.formatMessage({ id: 'onboarding.goToDashboard' })}
            <ArrowRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
