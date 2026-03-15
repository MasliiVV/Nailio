import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useDashboard, useBookings } from '@/hooks';
import {
  Card,
  SkeletonList,
  PageHeader,
  StatCard,
  StatGrid,
  Section,
  Badge,
} from '@/components/ui';
import type { Booking } from '@/types';
import styles from './DashboardPage.module.css';

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function DashboardPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { data: dashboard, isLoading: dashLoading } = useDashboard('week');
  const today = formatDateKey(new Date());
  const { data: bookingsData, isLoading: bookingsLoading } = useBookings({
    upcoming: true,
    dateFrom: today,
    dateTo: today,
  });

  const todayBookings = (bookingsData?.items || []).filter(
    (b: Booking) => b.status === 'pending' || b.status === 'confirmed',
  );

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'master.dashboard' })} />

      {/* Stats grid */}
      {dashLoading ? (
        <SkeletonList count={2} />
      ) : (
        dashboard && (
          <StatGrid columns={2}>
            <StatCard
              value={dashboard.today.bookings}
              label={intl.formatMessage({ id: 'master.todayBookings' })}
            />
            <StatCard
              value={`${(dashboard.today.revenue / 100).toFixed(0)}₴`}
              label={intl.formatMessage({ id: 'master.todayRevenue' })}
            />
            <StatCard
              value={dashboard.period.newClients}
              label={intl.formatMessage({ id: 'master.newClients' })}
            />
            <StatCard
              value={dashboard.period.completed}
              label={intl.formatMessage({ id: 'analytics.completed' })}
            />
          </StatGrid>
        )
      )}

      {/* Today's bookings */}
      <Section
        title={intl.formatMessage({ id: 'master.todayBookings' })}
        action={
          <button
            className="touchable"
            style={{ color: 'var(--color-link)', fontSize: 15 }}
            onClick={() => navigate('/master/calendar')}
          >
            {intl.formatMessage({ id: 'master.viewAll' })}
          </button>
        }
      >
        {bookingsLoading && <SkeletonList count={3} />}

        {!bookingsLoading && todayBookings.length === 0 && (
          <Card className={styles.emptyCard}>
            <Sparkles size={32} color="var(--color-primary)" />
            <p className="text-secondary">{intl.formatMessage({ id: 'master.noBookingsToday' })}</p>
          </Card>
        )}

        {todayBookings.map((booking: Booking) => (
          <Card
            key={booking.id}
            className={styles.bookingCard}
            onClick={() => navigate('/master/calendar')}
          >
            <div className={styles.bookingTime}>{formatTime(booking.startTime)}</div>
            <div className={styles.bookingInfo}>
              <span className={styles.bookingName}>{booking.serviceNameSnapshot}</span>
              {booking.client && (
                <span className="text-secondary">
                  {booking.client.firstName} {booking.client.lastName || ''}
                </span>
              )}
            </div>
            <Badge variant={booking.status === 'confirmed' ? 'success' : 'warning'}>
              {intl.formatMessage({ id: `booking.status.${booking.status}` })}
            </Badge>
          </Card>
        ))}
      </Section>
    </div>
  );
}
