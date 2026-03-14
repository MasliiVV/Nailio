import { useState } from 'react';
import { useIntl } from 'react-intl';
import {
  ClipboardList,
  Archive,
  Calendar,
  Clock,
  Scissors,
  Timer,
  Wallet,
  FileText,
  MessageCircle,
} from 'lucide-react';
import { useBookings, useCancelBooking } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { Card, Tabs, EmptyState, SkeletonList, BottomSheet, Button } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Booking } from '@/types';
import styles from './MyBookingsPage.module.css';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'booking.status.pending', className: 'badge badge--warning' },
  confirmed: { label: 'booking.status.confirmed', className: 'badge badge--success' },
  completed: { label: 'booking.status.completed', className: 'badge badge--secondary' },
  cancelled: { label: 'booking.status.cancelled', className: 'badge badge--destructive' },
  no_show: { label: 'booking.status.no_show', className: 'badge badge--destructive' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export function MyBookingsPage() {
  const intl = useIntl();
  const [tab, setTab] = useState('upcoming');
  const [selected, setSelected] = useState<Booking | null>(null);

  const { tenant } = useAuth();
  const { data: bookingsData, isLoading } = useBookings();
  const cancelBooking = useCancelBooking();

  const handleWriteToMaster = () => {
    if (!tenant?.botUsername) return;
    getTelegram()?.HapticFeedback.impactOccurred('light');
    getTelegram()?.openTelegramLink(`https://t.me/${tenant.botUsername}`);
  };

  const bookings = bookingsData?.items || [];

  const upcoming = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const history = bookings.filter(
    (b) => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show',
  );

  const displayed = tab === 'upcoming' ? upcoming : history;

  const handleCancel = async (id: string) => {
    try {
      await cancelBooking.mutateAsync({ id, dto: {} });
      setSelected(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : intl.formatMessage({ id: 'error.unknown' });
      const tg = getTelegram();
      if (tg?.showAlert) {
        tg.showAlert(msg);
      }
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{intl.formatMessage({ id: 'client.myBookings' })}</h1>
      </div>

      <Tabs
        tabs={[
          { id: 'upcoming', label: intl.formatMessage({ id: 'client.upcoming' }) },
          { id: 'history', label: intl.formatMessage({ id: 'client.history' }) },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      <div style={{ paddingTop: 16 }}>
        {isLoading && <SkeletonList count={3} />}

        {!isLoading && displayed.length === 0 && (
          <EmptyState
            icon={tab === 'upcoming' ? <ClipboardList size={40} /> : <Archive size={40} />}
            title={intl.formatMessage({
              id: tab === 'upcoming' ? 'client.noUpcoming' : 'client.noBookings',
            })}
          />
        )}

        {displayed.map((booking) => {
          const badge = STATUS_BADGE[booking.status];
          return (
            <Card
              key={booking.id}
              onClick={() => {
                getTelegram()?.HapticFeedback.impactOccurred('light');
                setSelected(booking);
              }}
              className={styles.bookingCard}
            >
              <div className={styles.bookingTop}>
                <span className={styles.bookingService}>{booking.serviceNameSnapshot}</span>
                {badge && (
                  <span className={badge.className}>{intl.formatMessage({ id: badge.label })}</span>
                )}
              </div>
              <div className={styles.bookingMeta}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={14} /> {formatDate(booking.startTime)}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={14} /> {formatTime(booking.startTime)}
                </span>
                <span>
                  {(booking.priceAtBooking / 100).toFixed(0)}{' '}
                  {intl.formatMessage({ id: 'common.uah' })}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Booking details sheet */}
      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={intl.formatMessage({ id: 'booking.details' })}
      >
        {selected && (
          <div className={styles.details}>
            <p className={styles.detailRow}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Scissors size={16} /> {selected.serviceNameSnapshot}
              </strong>
            </p>
            <p
              className={styles.detailRow}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Calendar size={16} /> {formatDate(selected.startTime)},{' '}
              {formatTime(selected.startTime)}
            </p>
            <p
              className={styles.detailRow}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Timer size={16} /> {selected.durationAtBooking}{' '}
              {intl.formatMessage({ id: 'common.min' })}
            </p>
            <p
              className={styles.detailRow}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Wallet size={16} /> {(selected.priceAtBooking / 100).toFixed(0)}{' '}
              {intl.formatMessage({ id: 'common.uah' })}
            </p>
            {selected.notes && (
              <p
                className={styles.detailRow}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <FileText size={16} /> {selected.notes}
              </p>
            )}

            {(selected.status === 'pending' || selected.status === 'confirmed') && (
              <Button
                variant="destructive"
                fullWidth
                loading={cancelBooking.isPending}
                onClick={() => handleCancel(selected.id)}
                style={{ marginTop: 16 }}
              >
                {intl.formatMessage({ id: 'booking.cancelBooking' })}
              </Button>
            )}

            {tenant?.botUsername && (
              <Button
                variant="secondary"
                fullWidth
                onClick={handleWriteToMaster}
                icon={<MessageCircle size={18} />}
                style={{ marginTop: 8 }}
              >
                {intl.formatMessage({ id: 'client.writeToMaster' })}
              </Button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
