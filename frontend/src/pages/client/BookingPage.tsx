import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { CheckCircle, CalendarOff } from 'lucide-react';
import { useService, useSlots, useCreateBooking } from '@/hooks';
import { Button, DatePicker, EmptyState } from '@/components/ui';
import { ApiRequestError, api } from '@/lib/api';
import { getTelegram, isTelegramEnv } from '@/lib/telegram';
import type { ApiResponse, SlotsResponse } from '@/types';
import styles from './BookingPage.module.css';

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function BookingPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const [searchParams] = useSearchParams();

  const initialDate = searchParams.get('date');
  const initialSlot = searchParams.get('slot');
  const promoCampaignId = searchParams.get('campaignId');

  const [selectedDate, setSelectedDate] = useState(initialDate || formatDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const hasTelegramMainButton = isTelegramEnv();

  const { data: service } = useService(serviceId || '');
  const { data: slotsData, isLoading: slotsLoading } = useSlots(selectedDate, serviceId || '');
  const createBooking = useCreateBooking();

  const calendarDates = useMemo(() => {
    const result: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 30; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);
      result.push(formatDateKey(nextDate));
    }

    return result;
  }, []);

  const calendarAvailabilityQueries = useQueries({
    queries: calendarDates.map((date) => ({
      queryKey: ['bookings', 'slots-calendar', date, serviceId || ''],
      queryFn: async () => {
        const res = await api.get<ApiResponse<SlotsResponse>>(
          `/bookings/slots?date=${date}&serviceId=${serviceId}`,
        );
        return res.data;
      },
      enabled: !!serviceId,
      staleTime: 30_000,
    })),
  });

  const availabilityByDate = useMemo(() => {
    const nextMap: Record<string, 'available' | 'unavailable' | 'loading'> = {};

    calendarDates.forEach((date, index) => {
      const query = calendarAvailabilityQueries[index];
      if (!query || query.isLoading) {
        nextMap[date] = 'loading';
        return;
      }

      const hasAvailableSlots = (query.data?.slots || []).some((slot) => slot.available);
      nextMap[date] = hasAvailableSlots ? 'available' : 'unavailable';
    });

    return nextMap;
  }, [calendarAvailabilityQueries, calendarDates]);

  const firstAvailableDate = useMemo(
    () => calendarDates.find((date) => availabilityByDate[date] === 'available') || null,
    [availabilityByDate, calendarDates],
  );

  const availableSlots = slotsData?.slots.filter((s) => s.available) || [];

  // Reset slot selection when date changes
  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDate]);

  useEffect(() => {
    if (!initialSlot) return;
    const matchingSlot = availableSlots.find((slot) => slot.startTime === initialSlot);
    if (matchingSlot) {
      setSelectedSlot(initialSlot);
    }
  }, [availableSlots, initialSlot]);

  useEffect(() => {
    if (!firstAvailableDate) return;
    if (availabilityByDate[selectedDate] === 'available') return;
    setSelectedDate(firstAvailableDate);
  }, [availabilityByDate, firstAvailableDate, selectedDate]);

  // MainButton pattern per docs/telegram/mini-app.md
  const handleConfirm = useCallback(async () => {
    if (!serviceId || !selectedSlot) return;

    let tg: ReturnType<typeof getTelegram> | null = null;

    try {
      tg = getTelegram();
      tg.MainButton.showProgress();
    } catch {
      tg = null;
    }

    try {
      await createBooking.mutateAsync({
        serviceId,
        startTime: `${selectedDate}T${selectedSlot}:00`,
        promoCampaignId: promoCampaignId || undefined,
      });

      tg?.MainButton.hideProgress();
      setConfirmed(true);
      tg?.MainButton.hide();
      tg?.HapticFeedback.notificationOccurred('success');

      // Auto-navigate back after 2s
      setTimeout(() => {
        navigate('/client/bookings');
      }, 2000);
    } catch (error) {
      tg?.MainButton.hideProgress();
      tg?.HapticFeedback.notificationOccurred('error');

      const isSlotTaken =
        error instanceof ApiRequestError &&
        error.statusCode === 409 &&
        error.message.toLowerCase().includes('time slot is already booked');

      tg?.showAlert(intl.formatMessage({ id: isSlotTaken ? 'booking.slotTaken' : 'common.error' }));
    }
  }, [serviceId, selectedSlot, selectedDate, createBooking, navigate, promoCampaignId, intl]);

  // Setup MainButton
  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    if (selectedSlot && !confirmed) {
      tg.MainButton.setText(intl.formatMessage({ id: 'booking.confirm' }));
      tg.MainButton.show();
      tg.MainButton.onClick(handleConfirm);
    } else {
      tg.MainButton.hide();
    }

    return () => {
      tg.MainButton.offClick(handleConfirm);
      tg.MainButton.hide();
    };
  }, [selectedSlot, confirmed, handleConfirm, intl]);

  if (confirmed) {
    return (
      <div className="page animate-scale-in">
        <div className={styles.confirmed}>
          <CheckCircle size={48} color="var(--color-success)" className={styles.confirmedIcon} />
          <h2>{intl.formatMessage({ id: 'booking.confirmed' })}</h2>
          {service && (
            <p className="text-secondary">
              {service.name} — {selectedDate} {selectedSlot}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page animate-fade-in">
      {/* Service info */}
      {service && (
        <div className={styles.serviceHeader}>
          <div
            className={styles.serviceColor}
            style={{ backgroundColor: service.color || 'var(--color-primary)' }}
          />
          <div>
            <h2 className={styles.serviceName}>{service.name}</h2>
            <p className="text-secondary">
              {intl.formatMessage(
                { id: 'booking.duration' },
                { duration: service.durationMinutes },
              )}
              {' · '}
              {(service.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
            </p>
          </div>
        </div>
      )}

      {/* Step 1: Select date */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{intl.formatMessage({ id: 'booking.selectDate' })}</h3>
        <DatePicker
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          daysAhead={30}
          availabilityByDate={availabilityByDate}
        />
      </div>

      {/* Step 2: Select time */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{intl.formatMessage({ id: 'booking.selectTime' })}</h3>

        {slotsLoading && (
          <div className="center" style={{ padding: 32 }}>
            <div className="spinner" />
          </div>
        )}

        {!slotsLoading && availableSlots.length === 0 && (
          <EmptyState
            icon={<CalendarOff size={40} />}
            title={intl.formatMessage({ id: 'booking.noSlots' })}
          />
        )}

        {!slotsLoading && availableSlots.length > 0 && (
          <>
            <div className={styles.slotsGrid}>
              {availableSlots.map((slot) => (
                <button
                  key={slot.startTime}
                  className={`${styles.slot} ${selectedSlot === slot.startTime ? styles.slotSelected : ''}`}
                  onClick={() => {
                    try {
                      getTelegram().HapticFeedback.selectionChanged();
                    } catch {
                      // noop outside Telegram
                    }
                    setSelectedSlot(slot.startTime);
                  }}
                >
                  {slot.startTime}
                </button>
              ))}
            </div>

            {!hasTelegramMainButton && (
              <div className={styles.confirmBar}>
                <Button
                  fullWidth
                  onClick={() => void handleConfirm()}
                  disabled={!selectedSlot}
                  loading={createBooking.isPending}
                >
                  {intl.formatMessage({ id: 'booking.confirm' })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
