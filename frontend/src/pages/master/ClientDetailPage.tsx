import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useClient, useBlockClient, useUnblockClient } from '@/hooks';
import { Avatar, Button, Card, SkeletonList } from '@/components/ui';
import type { Booking } from '@/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClientDetailPage() {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading } = useClient(id || '');
  const blockClient = useBlockClient();
  const unblockClient = useUnblockClient();

  if (isLoading) {
    return (
      <div className="page">
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="page animate-fade-in">
      {/* Profile header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Avatar
          name={`${client.firstName} ${client.lastName || ''}`}
          size="lg"
        />
        <h2 style={{ marginTop: 12, fontSize: 20, fontWeight: 700 }}>
          {client.firstName} {client.lastName || ''}
        </h2>
        {client.phone && (
          <p className="text-secondary">{client.phone}</p>
        )}
        {client.isBlocked && (
          <span className="badge badge--destructive" style={{ marginTop: 8 }}>
            {intl.formatMessage({ id: 'clients.blocked' })}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card__value">{client.stats.totalBookings}</div>
          <div className="stat-card__label">{intl.formatMessage({ id: 'analytics.totalBookings' })}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{(client.stats.totalSpent / 100).toFixed(0)}₴</div>
          <div className="stat-card__label">{intl.formatMessage({ id: 'finance.income' })}</div>
        </div>
      </div>

      {/* Notes */}
      {client.notes && (
        <Card>
          <div style={{ padding: '12px 16px' }}>
            <div className="text-secondary" style={{ fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={14} /> Нотатки</div>
            <p style={{ fontSize: 15 }}>{client.notes}</p>
          </div>
        </Card>
      )}

      {/* Recent bookings */}
      {client.recentBookings && client.recentBookings.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="section-title" style={{ padding: 0 }}>Останні записи</h3>
          {client.recentBookings.map((booking: Booking) => (
            <Card key={booking.id} style={{ marginBottom: 8 }}>
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{booking.serviceNameSnapshot}</div>
                  <div className="text-secondary" style={{ fontSize: 13 }}>{formatDate(booking.startTime)}</div>
                </div>
                <span className={`badge badge--${booking.status === 'completed' ? 'success' : 'secondary'}`}>
                  {intl.formatMessage({ id: `booking.status.${booking.status}` })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Block/Unblock */}
      <div style={{ marginTop: 32 }}>
        {client.isBlocked ? (
          <Button
            variant="secondary"
            fullWidth
            loading={unblockClient.isPending}
            onClick={() => unblockClient.mutate(client.id)}
          >
            Розблокувати клієнта
          </Button>
        ) : (
          <Button
            variant="destructive"
            fullWidth
            loading={blockClient.isPending}
            onClick={() => blockClient.mutate(client.id)}
          >
            Заблокувати клієнта
          </Button>
        )}
      </div>
    </div>
  );
}
