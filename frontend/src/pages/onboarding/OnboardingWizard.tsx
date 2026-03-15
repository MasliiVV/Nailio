import { useState, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Bot,
  KeyRound,
  CheckCircle,
  Scissors,
  Calendar,
  PartyPopper,
  Copy,
  Smartphone,
  Video,
} from 'lucide-react';
import { useAuth, useCreateService } from '@/hooks';
import { Button, Input, Card } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import {
  createEmptyWeeklySchedule,
  getNextSlotTime,
  normalizeSlotTimes,
  WEEK_DAY_KEYS,
} from '@/lib/schedule';
import type { CreateServiceDto, ApiResponse } from '@/types';
import styles from './OnboardingWizard.module.css';

const TOTAL_STEPS = 6;

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
  const [schedule, setSchedule] = useState(createEmptyWeeklySchedule());

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
        days: schedule.map((day) => ({
          ...day,
          slots: day.isDayOff ? [] : normalizeSlotTimes(day.slots),
          isDayOff: day.isDayOff || normalizeSlotTimes(day.slots).length === 0,
        })),
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

  return (
    <div className={styles.wizard}>
      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
      </div>
      <div className={styles.stepIndicator}>
        {step} / {TOTAL_STEPS}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <Sparkles size={48} />
          </div>
          <h1 className={styles.stepTitle}>{intl.formatMessage({ id: 'onboarding.welcome' })}</h1>
          <p className={styles.stepDescription}>
            {intl.formatMessage({ id: 'onboarding.welcomeDesc' })}
          </p>
          <a
            href="https://youtube.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.videoLink}
            onClick={(e) => {
              e.preventDefault();
              getTelegram()?.openLink?.('https://youtube.com');
            }}
          >
            <Video
              size={16}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
            />
            {intl.formatMessage({ id: 'onboarding.watchVideo' })}
          </a>
          <Button fullWidth onClick={next}>
            {intl.formatMessage({ id: 'onboarding.start' })} →
          </Button>
        </div>
      )}

      {/* Step 2: BotFather instructions */}
      {step === 2 && (
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
              ←
            </Button>
            <Button fullWidth onClick={next}>
              {intl.formatMessage({ id: 'onboarding.copied' })} →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Enter token */}
      {step === 3 && (
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
              ←
            </Button>
            <Button fullWidth onClick={next} disabled={!botInfo}>
              {intl.formatMessage({ id: 'common.next' })} →
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Services */}
      {step === 4 && (
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
              ←
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={next}
              disabled={createService.isPending}
            >
              {intl.formatMessage({ id: 'common.skip' })}
            </Button>
            <Button fullWidth onClick={handleSaveServices} loading={createService.isPending}>
              {intl.formatMessage({ id: 'common.save' })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Schedule */}
      {step === 5 && (
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
                        setSchedule((prev) => {
                          const updated = [...prev];
                          updated[index] = day.isDayOff
                            ? {
                                ...day,
                                isDayOff: false,
                                slots: day.slots.length > 0 ? day.slots : ['09:00'],
                              }
                            : { ...day, isDayOff: true, slots: [] };
                          return updated;
                        });
                      }}
                    />
                    <span>{intl.formatMessage({ id: `schedule.${dayKey}` })}</span>
                  </label>
                  {!day.isDayOff && (
                    <div className={styles.scheduleTime}>
                      {day.slots.map((slot, slotIndex) => (
                        <div key={`${day.dayOfWeek}-${slotIndex}`} className={styles.scheduleSlotRow}>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={slot}
                            onChange={(e) => {
                              setSchedule((prev) => {
                                const updated = [...prev];
                                updated[index] = {
                                  ...day,
                                  slots: day.slots.map((currentSlot, currentIndex) =>
                                    currentIndex === slotIndex ? e.target.value : currentSlot,
                                  ),
                                };
                                return updated;
                              });
                            }}
                          />
                          <button
                            type="button"
                            className={styles.removeSlotBtn}
                            onClick={() => {
                              setSchedule((prev) => {
                                const updated = [...prev];
                                const nextSlots = day.slots.filter(
                                  (_, currentIndex) => currentIndex !== slotIndex,
                                );
                                updated[index] = {
                                  ...day,
                                  slots: nextSlots,
                                  isDayOff: nextSlots.length === 0,
                                };
                                return updated;
                              });
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.addSlotBtn}
                        onClick={() => {
                          setSchedule((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...day,
                              isDayOff: false,
                              slots: [...day.slots, getNextSlotTime(day.slots)],
                            };
                            return updated;
                          });
                        }}
                      >
                        + {intl.formatMessage({ id: 'schedule.addSlot' })}
                      </button>
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
              ←
            </Button>
            <Button fullWidth loading={loading} onClick={handleSaveSchedule}>
              {intl.formatMessage({ id: 'common.save' })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Done */}
      {step === 6 && (
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
            {intl.formatMessage({ id: 'onboarding.goToDashboard' })} →
          </Button>
        </div>
      )}
    </div>
  );
}
