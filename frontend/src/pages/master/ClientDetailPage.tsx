import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';
import { FileText, MessageCircle, Send } from 'lucide-react';
import { useClient, useUnblockClient } from '@/hooks';
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
import { getTelegram } from '@/lib/telegram';
import { ClientMessageSheet } from '@/components/ClientMessageSheet/ClientMessageSheet';
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
  const [telegramMessageOpen, setTelegramMessageOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const { data: client, isLoading } = useClient(id || '');
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
      <>
        {/* Profile header */}
        <div className={styles.profileHeader}>
          <>
            <Avatar name={`${client.firstName} ${client.lastName || ''}`} size="lg" />
            <h2 className={styles.profileName}>{`${client.firstName} ${client.lastName || ''}`}</h2>
            {client.phone && <p className={styles.profilePhone}>{client.phone}</p>}
            {client.telegramId && (
              <p className={styles.profilePhone}>{`Telegram ID: ${client.telegramId}`}</p>
            )}
            {client.isBlocked && (
              <Badge variant="destructive">{intl.formatMessage({ id: 'clients.blocked' })}</Badge>
            )}
          </>
        </div>

        {client.telegramId && (
          <Card className={styles.notesCard}>
            <>
              <div className={styles.notesLabel}>
                {intl.formatMessage({ id: 'clients.telegramId' })}
              </div>
              <p className={styles.notesText}>{client.telegramId}</p>
              <div style={{ marginTop: 12 }}>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    getTelegram()?.HapticFeedback.impactOccurred('light');
                    setTelegramMessageOpen(true);
                  }}
                  icon={<MessageCircle size={16} />}
                >
                  {intl.formatMessage({ id: 'clients.writeInTelegram' })}
                </Button>
              </div>
            </>
          </Card>
        )}

        {/* Stats */}
        <div className={styles.statsSection}>
          <StatGrid columns={2}>
            <>
              <StatCard
                value={client.stats?.totalBookings ?? 0}
                label={intl.formatMessage({ id: 'analytics.totalBookings' })}
              />
              <StatCard
                value={`${((client.stats?.totalSpent ?? 0) / 100).toFixed(0)}₴`}
                label={intl.formatMessage({ id: 'finance.income' })}
              />
            </>
          </StatGrid>
        </div>

        {/* Notes */}
        {client.notes && (
          <Card className={styles.notesCard}>
            <>
              <div className={styles.notesLabel}>
                <>
                  <FileText size={14} />
                  {intl.formatMessage({ id: 'clients.notes' })}
                </>
              </div>
              <p className={styles.notesText}>{client.notes}</p>
            </>
          </Card>
        )}

        {/* Recent bookings */}
        {client.recentBookings && client.recentBookings.length > 0 && (
          <Section title={intl.formatMessage({ id: 'clients.recentBookings' })}>
            <>
              {client.recentBookings.map((booking: Booking) => (
                <Card key={booking.id} className={styles.recentCard}>
                  <>
                    <div className={styles.recentInfo}>
                      <>
                        <span className={styles.recentService}>{booking.serviceNameSnapshot}</span>
                        <span className={styles.recentDate}>{formatDate(booking.startTime)}</span>
                      </>
                    </div>
                    <Badge variant={booking.status === 'completed' ? 'success' : 'secondary'}>
                      {intl.formatMessage({ id: `booking.status.${booking.status}` })}
                    </Badge>
                  </>
                </Card>
              ))}
            </>
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
              variant="primary"
              fullWidth
              onClick={() => {
                getTelegram()?.HapticFeedback.impactOccurred('light');
                setPromoOpen(true);
              }}
              disabled={!client.telegramId}
              icon={<Send size={16} />}
            >
              {intl.formatMessage({ id: 'clients.sendReminderPromo' })}
            </Button>
          )}
        </div>

        <ClientMessageSheet
          clientId={client.id}
          mode="telegram"
          open={telegramMessageOpen}
          onClose={() => setTelegramMessageOpen(false)}
        />
        <ClientMessageSheet
          clientId={client.id}
          mode="promo"
          open={promoOpen}
          onClose={() => setPromoOpen(false)}
        />
      </>
    </div>
  );
}
