import { useIntl } from 'react-intl';
import { Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useBookings, useCompleteBooking, useNoShowBooking } from '@/hooks';
import { Card, SkeletonList, EmptyState } from '@/components/ui';
import type { Booking } from '@/types';
import { getTelegram } from '@/lib/telegram';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });
}

export function CalendarPage() {
  const intl = useIntl();
  const { data: bookingsData, isLoading } = useBookings();
  const completeBooking = useCompleteBooking();
  const noShowBooking = useNoShowBooking();

  const bookings = bookingsData?.items || [];

  // Group by date
  const grouped = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    const key = new Date(b.startTime).toISOString().split('T')[0] || '';
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

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

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{intl.formatMessage({ id: 'master.calendar' })}</h1>
      </div>

      {isLoading && <SkeletonList count={5} />}

      {!isLoading && bookings.length === 0 && (
        <EmptyState
          icon={<Calendar size={40} />}
          title={intl.formatMessage({ id: 'master.noBookingsToday' })}
        />
      )}

      {sortedDates.map((dateKey) => (
        <div key={dateKey} style={{ marginBottom: 20 }}>
          <h3 className="section-title" style={{ padding: 0 }}>
            {formatDate(grouped[dateKey]![0]!.startTime)}
          </h3>
          {grouped[dateKey]!.map((booking) => (
            <Card key={booking.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-primary)', width: 48 }}>
                  {formatTime(booking.startTime)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{booking.serviceNameSnapshot}</div>
                  {booking.client && (
                    <div className="text-secondary" style={{ fontSize: 13 }}>
                      {booking.client.firstName} {booking.client.lastName || ''}
                    </div>
                  )}
                </div>
                {(booking.status === 'confirmed' || booking.status === 'pending') && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="touchable"
                      style={{ fontSize: 20 }}
                      onClick={() => handleComplete(booking.id)}
                      title="Complete"
                    >
                      <CheckCircle size={20} color="var(--color-success)" />
                    </button>
                    <button
                      className="touchable"
                      style={{ fontSize: 20 }}
                      onClick={() => handleNoShow(booking.id)}
                      title="No show"
                    >
                      <XCircle size={20} color="var(--color-destructive)" />
                    </button>
                  </div>
                )}
                {booking.status === 'completed' && (
                  <span className="badge badge--success">
                    {intl.formatMessage({ id: 'booking.status.completed' })}
                  </span>
                )}
                {booking.status === 'cancelled' && (
                  <span className="badge badge--destructive">
                    {intl.formatMessage({ id: 'booking.status.cancelled' })}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
