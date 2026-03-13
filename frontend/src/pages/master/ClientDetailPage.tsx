import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useClient, useBlockClient, useUnblockClient } from '@/hooks';
import {
  Avatar,
  Button,
  Card,
  SkeletonList,
  Badge,
  StatCard,
  StatGrid,
  Section,
} from '@/components/ui';
import type { Booking } from '@/types';
import styles from './ClientDetailPage.module.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
      <div className={styles.profileHeader}>
        <Avatar name={`${client.firstName} ${client.lastName || ''}`} size="lg" />
        <h2 className={styles.profileName}>
          {client.firstName} {client.lastName || ''}
        </h2>
        {client.phone && <p className={styles.profilePhone}>{client.phone}</p>}
        {client.isBlocked && (
          <Badge variant="destructive">{intl.formatMessage({ id: 'clients.blocked' })}</Badge>
        )}
      </div>

      {/* Stats */}
      <div className={styles.statsSection}>
        <StatGrid columns={2}>
          <StatCard
            value={client.stats?.totalBookings ?? 0}
            label={intl.formatMessage({ id: 'analytics.totalBookings' })}
          />
          <StatCard
            value={`${((client.stats?.totalSpent ?? 0) / 100).toFixed(0)}₴`}
            label={intl.formatMessage({ id: 'finance.income' })}
          />
        </StatGrid>
      </div>

      {/* Notes */}
      {client.notes && (
        <Card className={styles.notesCard}>
          <div className={styles.notesLabel}>
            <FileText size={14} />
            {intl.formatMessage({ id: 'clients.notes' })}
          </div>
          <p className={styles.notesText}>{client.notes}</p>
        </Card>
      )}

      {/* Recent bookings */}
      {client.recentBookings && client.recentBookings.length > 0 && (
        <Section title={intl.formatMessage({ id: 'clients.recentBookings' })}>
          {client.recentBookings.map((booking: Booking) => (
            <Card key={booking.id} className={styles.recentCard}>
              <div className={styles.recentInfo}>
                <span className={styles.recentService}>{booking.serviceNameSnapshot}</span>
                <span className={styles.recentDate}>{formatDate(booking.startTime)}</span>
              </div>
              <Badge variant={booking.status === 'completed' ? 'success' : 'secondary'}>
                {intl.formatMessage({ id: `booking.status.${booking.status}` })}
              </Badge>
            </Card>
          ))}
        </Section>
      )}

      {/* Block/Unblock */}
      <div className={styles.blockSection}>
        {client.isBlocked ? (
          <Button
            variant="secondary"
            fullWidth
            loading={unblockClient.isPending}
            onClick={() => unblockClient.mutate(client.id)}
          >
            {intl.formatMessage({ id: 'clients.unblock' })}
          </Button>
        ) : (
          <Button
            variant="destructive"
            fullWidth
            loading={blockClient.isPending}
            onClick={() => blockClient.mutate(client.id)}
          >
            {intl.formatMessage({ id: 'clients.block' })}
          </Button>
        )}
      </div>
    </div>
  );
}
