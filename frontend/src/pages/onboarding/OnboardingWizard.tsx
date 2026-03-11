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
  Palette,
  PartyPopper,
  Copy,
  Smartphone,
  Video,
} from 'lucide-react';
import { useAuth, useCreateService, useUpdateWorkingHours } from '@/hooks';
import { Button, Input, Card } from '@/components/ui';
import { api } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { CreateServiceDto, ApiResponse, Tenant, UpdateBrandingDto } from '@/types';
import styles from './OnboardingWizard.module.css';

const TOTAL_STEPS = 7;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface AddedService {
  name: string;
  price: number;
  durationMinutes: number;
}

interface ScheduleDay {
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

export function OnboardingWizard() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { setOnboardingComplete, updateTenant } = useAuth();
  const createService = useCreateService();
  const updateHours = useUpdateWorkingHours();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 3: Bot token
  const [botToken, setBotToken] = useState('');
  const [botInfo, setBotInfo] = useState<{ username: string; name: string } | null>(null);
  const [tokenError, setTokenError] = useState('');

  // Step 4: Services
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDuration, setServiceDuration] = useState('60');
  const [addedServices, setAddedServices] = useState<AddedService[]>([]);

  // Step 5: Schedule
  const [schedule, setSchedule] = useState<ScheduleDay[]>([
    { isWorking: true, startTime: '09:00', endTime: '18:00' },
    { isWorking: true, startTime: '09:00', endTime: '18:00' },
    { isWorking: true, startTime: '09:00', endTime: '18:00' },
    { isWorking: true, startTime: '09:00', endTime: '18:00' },
    { isWorking: true, startTime: '09:00', endTime: '18:00' },
    { isWorking: true, startTime: '10:00', endTime: '15:00' },
    { isWorking: false, startTime: '10:00', endTime: '15:00' },
  ]);

  // Step 6: Branding
  const [displayName, setDisplayName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6C5CE7');

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
      const res = await api.post<{ botUsername: string; botName: string }>('/api/v1/bot/connect', {
        token: botToken,
      });
      setBotInfo({ username: res.botUsername, name: res.botName });
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch {
      setTokenError(intl.formatMessage({ id: 'onboarding.tokenError' }));
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Add service
  const handleAddService = async () => {
    const dto: CreateServiceDto = {
      name: serviceName,
      price: Number(servicePrice) * 100,
      durationMinutes: Number(serviceDuration),
    };
    await createService.mutateAsync(dto);
    setAddedServices((prev) => [
      ...prev,
      { name: serviceName, price: Number(servicePrice), durationMinutes: Number(serviceDuration) },
    ]);
    setServiceName('');
    setServicePrice('');
    setServiceDuration('60');
    getTelegram()?.HapticFeedback.impactOccurred('light');
  };

  // Step 5: Save schedule
  const handleSaveSchedule = async () => {
    setLoading(true);
    try {
      for (let i = 0; i < 7; i++) {
        const day = schedule[i]!;
        await updateHours.mutateAsync({
          dayOfWeek: i,
          isWorking: day.isWorking,
          startTime: day.startTime,
          endTime: day.endTime,
        });
      }
      next();
    } finally {
      setLoading(false);
    }
  };

  // Step 6: Save branding
  const handleSaveBranding = async () => {
    if (displayName || welcomeMessage || primaryColor !== '#6C5CE7') {
      try {
        const dto: UpdateBrandingDto = {
          displayName: displayName || undefined,
          primaryColor,
          welcomeMessage: welcomeMessage || undefined,
        };
        const res = await api.put<ApiResponse<Tenant>>('/api/v1/settings/branding', dto);
        updateTenant(res.data);
      } catch {
        // non-critical, skip
      }
    }
    next();
  };

  // Step 7: Finish
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
              onClick={() => getTelegram()?.openTelegramLink?.('https://t.me/BotFather')}
            >
              {intl.formatMessage({ id: 'onboarding.openBotFatherBtn' })}
            </Button>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>2</span>
              <span>{intl.formatMessage({ id: 'onboarding.sendNewbot' })}</span>
            </div>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>3</span>
              <span>{intl.formatMessage({ id: 'onboarding.enterBotName' })}</span>
            </div>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>4</span>
              <span>{intl.formatMessage({ id: 'onboarding.enterUsername' })}</span>
            </div>
            <div className={styles.instructionStep}>
              <span className={styles.instructionNum}>5</span>
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
                <div className="text-secondary">{botInfo.name}</div>
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
            <Button fullWidth onClick={next}>
              {addedServices.length > 0
                ? `${intl.formatMessage({ id: 'common.next' })} →`
                : intl.formatMessage({ id: 'onboarding.skip' })}
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
            {DAY_KEYS.map((dayKey, index) => {
              const day = schedule[index]!;
              return (
                <div key={dayKey} className={styles.scheduleRow}>
                  <label className={styles.scheduleDay}>
                    <input
                      type="checkbox"
                      checked={day.isWorking}
                      onChange={() => {
                        setSchedule((prev) => {
                          const updated = [...prev];
                          updated[index] = { ...day, isWorking: !day.isWorking };
                          return updated;
                        });
                      }}
                    />
                    <span>{intl.formatMessage({ id: `schedule.${dayKey}` })}</span>
                  </label>
                  {day.isWorking && (
                    <div className={styles.scheduleTime}>
                      <input
                        type="time"
                        className={styles.timeInput}
                        value={day.startTime}
                        onChange={(e) => {
                          setSchedule((prev) => {
                            const updated = [...prev];
                            updated[index] = { ...day, startTime: e.target.value };
                            return updated;
                          });
                        }}
                      />
                      <span>—</span>
                      <input
                        type="time"
                        className={styles.timeInput}
                        value={day.endTime}
                        onChange={(e) => {
                          setSchedule((prev) => {
                            const updated = [...prev];
                            updated[index] = { ...day, endTime: e.target.value };
                            return updated;
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              ←
            </Button>
            <Button fullWidth loading={loading} onClick={handleSaveSchedule}>
              {intl.formatMessage({ id: 'common.next' })} →
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Branding */}
      {step === 6 && (
        <div className={styles.stepContent}>
          <div className={styles.stepEmoji}>
            <Palette size={48} />
          </div>
          <h1 className={styles.stepTitle}>{intl.formatMessage({ id: 'onboarding.branding' })}</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input
              label={intl.formatMessage({ id: 'settings.displayName' })}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input
              label={intl.formatMessage({ id: 'settings.welcomeMessage' })}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
            />
            <div>
              <label
                style={{
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                {intl.formatMessage({ id: 'settings.primaryColor' })}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    width: 48,
                    height: 48,
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                />
                <span className="text-secondary">{primaryColor}</span>
              </div>
            </div>
          </div>
          <div className={styles.navButtons}>
            <Button variant="ghost" onClick={prev}>
              ←
            </Button>
            <Button fullWidth onClick={handleSaveBranding}>
              {displayName || welcomeMessage
                ? `${intl.formatMessage({ id: 'common.next' })} →`
                : intl.formatMessage({ id: 'onboarding.skip' })}
            </Button>
          </div>
        </div>
      )}

      {/* Step 7: Done */}
      {step === 7 && (
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
