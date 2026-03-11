import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useDashboard, useBookings } from '@/hooks';
import { Card, SkeletonList } from '@/components/ui';
import type { Booking } from '@/types';
import styles from './DashboardPage.module.css';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function DashboardPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { data: dashboard, isLoading: dashLoading } = useDashboard('week');
  const { data: bookingsData, isLoading: bookingsLoading } = useBookings();

  const todayBookings = (bookingsData?.items || []).filter((b: Booking) => {
    const d = new Date(b.startTime);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear() &&
      (b.status === 'pending' || b.status === 'confirmed')
    );
  });

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{intl.formatMessage({ id: 'master.dashboard' })}</h1>
      </div>

      {/* Stats grid */}
      {dashLoading ? (
        <SkeletonList count={2} />
      ) : (
        dashboard && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card__value">{dashboard.today.bookings}</div>
              <div className="stat-card__label">
                {intl.formatMessage({ id: 'master.todayBookings' })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">
                {(dashboard.today.revenue / 100).toFixed(0)}₴
              </div>
              <div className="stat-card__label">
                {intl.formatMessage({ id: 'master.todayRevenue' })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{dashboard.period.newClients}</div>
              <div className="stat-card__label">
                {intl.formatMessage({ id: 'master.newClients' })}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{dashboard.period.completed}</div>
              <div className="stat-card__label">
                {intl.formatMessage({ id: 'analytics.completed' })}
              </div>
            </div>
          </div>
        )
      )}

      {/* Today's bookings */}
      <div style={{ marginTop: 24 }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>
            {intl.formatMessage({ id: 'master.todayBookings' })}
          </h3>
          <button
            className="touchable"
            style={{ color: 'var(--color-link)', fontSize: 15 }}
            onClick={() => navigate('/master/calendar')}
          >
            {intl.formatMessage({ id: 'master.viewAll' })}
          </button>
        </div>

        {bookingsLoading && <SkeletonList count={3} />}

        {!bookingsLoading && todayBookings.length === 0 && (
          <Card className={styles.emptyCard}>
            <Sparkles size={32} color="var(--color-primary)" />
            <p className="text-secondary">
              {intl.formatMessage({ id: 'master.noBookingsToday' })}
            </p>
          </Card>
        )}

        {todayBookings.map((booking: Booking) => (
          <Card key={booking.id} className={styles.bookingCard}>
            <div className={styles.bookingTime}>{formatTime(booking.startTime)}</div>
            <div className={styles.bookingInfo}>
              <span className={styles.bookingName}>{booking.serviceNameSnapshot}</span>
              {booking.client && (
                <span className="text-secondary">
                  {booking.client.firstName} {booking.client.lastName || ''}
                </span>
              )}
            </div>
            <span className={`badge badge--${booking.status === 'confirmed' ? 'success' : 'warning'}`}>
              {intl.formatMessage({ id: `booking.status.${booking.status}` })}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
