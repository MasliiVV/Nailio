import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { CheckCircle, CalendarOff } from 'lucide-react';
import { useService, useSlots, useCreateBooking } from '@/hooks';
import { DatePicker, EmptyState } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
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

  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: service } = useService(serviceId || '');
  const { data: slotsData, isLoading: slotsLoading } = useSlots(selectedDate, serviceId || '');
  const createBooking = useCreateBooking();

  const availableSlots = slotsData?.slots.filter((s) => s.available) || [];

  // Reset slot selection when date changes
  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDate]);

  // MainButton pattern per docs/telegram/mini-app.md
  const handleConfirm = useCallback(async () => {
    if (!serviceId || !selectedSlot) return;

    const tg = getTelegram();
    tg?.MainButton.showProgress();

    try {
      await createBooking.mutateAsync({
        serviceId,
        startTime: `${selectedDate}T${selectedSlot}:00`,
      });

      setConfirmed(true);
      tg?.MainButton.hide();
      tg?.HapticFeedback.notificationOccurred('success');

      // Auto-navigate back after 2s
      setTimeout(() => {
        navigate('/client/bookings');
      }, 2000);
    } catch {
      tg?.MainButton.hideProgress();
      tg?.HapticFeedback.notificationOccurred('error');
    }
  }, [serviceId, selectedSlot, selectedDate, createBooking, navigate]);

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
        <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} daysAhead={30} />
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
          <div className={styles.slotsGrid}>
            {availableSlots.map((slot) => (
              <button
                key={slot.startTime}
                className={`${styles.slot} ${selectedSlot === slot.startTime ? styles.slotSelected : ''}`}
                onClick={() => {
                  getTelegram()?.HapticFeedback.selectionChanged();
                  setSelectedSlot(slot.startTime);
                }}
              >
                {slot.startTime}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
