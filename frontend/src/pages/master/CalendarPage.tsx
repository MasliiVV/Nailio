import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useBookings, useCompleteBooking, useNoShowBooking } from '@/hooks';
import { Card, SkeletonList, EmptyState, PageHeader, DatePicker, Badge } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import styles from './CalendarPage.module.css';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

export function CalendarPage() {
  const intl = useIntl();
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const { data: bookingsData, isLoading } = useBookings();
  const completeBooking = useCompleteBooking();
  const noShowBooking = useNoShowBooking();

  const allBookings = bookingsData?.items || [];

  // Filter bookings by selected date
  const bookings = allBookings.filter((b) => {
    const bookingDate = new Date(b.startTime).toISOString().split('T')[0];
    return bookingDate === selectedDate;
  });

  // Sort by time
  const sorted = [...bookings].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const handleComplete = async (id: string) => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await completeBooking.mutateAsync(id);
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleNoShow = async (id: string) => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      await noShowBooking.mutateAsync(id);
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success' as const;
      case 'cancelled':
      case 'no_show':
        return 'destructive' as const;
      default:
        return 'warning' as const;
    }
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'master.calendar' })} />

      <div className={styles.datePickerWrap}>
        <DatePicker selectedDate={selectedDate} onSelect={setSelectedDate} daysAhead={60} />
      </div>

      {isLoading && <SkeletonList count={5} />}

      {!isLoading && sorted.length === 0 && (
        <EmptyState
          icon={<Calendar size={40} />}
          title={intl.formatMessage({ id: 'master.noBookingsToday' })}
          description={formatDateDisplay(`${selectedDate}T00:00:00`)}
        />
      )}

      {sorted.map((booking) => (
        <Card key={booking.id} className={styles.bookingCard}>
          <span className={styles.bookingTime}>{formatTime(booking.startTime)}</span>
          <div className={styles.bookingBody}>
            <div className={styles.bookingService}>{booking.serviceNameSnapshot}</div>
            {booking.client && (
              <div className={styles.bookingClient}>
                {booking.client.firstName} {booking.client.lastName || ''}
              </div>
            )}
          </div>
          {(booking.status === 'confirmed' || booking.status === 'pending') && (
            <div className={styles.bookingActions}>
              <button
                className="touchable"
                onClick={() => handleComplete(booking.id)}
                aria-label={intl.formatMessage({ id: 'booking.status.completed' })}
              >
                <CheckCircle size={20} color="var(--color-success)" />
              </button>
              <button
                className="touchable"
                onClick={() => handleNoShow(booking.id)}
                aria-label={intl.formatMessage({ id: 'booking.status.no_show' })}
              >
                <XCircle size={20} color="var(--color-destructive)" />
              </button>
            </div>
          )}
          {booking.status !== 'confirmed' && booking.status !== 'pending' && (
            <Badge variant={statusVariant(booking.status)}>
              {intl.formatMessage({ id: `booking.status.${booking.status}` })}
            </Badge>
          )}
        </Card>
      ))}
    </div>
  );
}
