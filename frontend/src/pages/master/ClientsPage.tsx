import { useState, useDeferredValue } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useClients } from '@/hooks';
import { Card, Avatar, Input, EmptyState, SkeletonList, PageHeader, Badge } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Client } from '@/types';
import styles from './ClientsPage.module.css';

export function ClientsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const { data: clientsData, isLoading } = useClients(deferredSearch || undefined);

  const clients = clientsData?.items || [];

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'clients.title' })} />

      <div className={styles.searchWrap}>
        <Input
          placeholder={intl.formatMessage({ id: 'common.search' })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <SkeletonList count={5} />}

      {!isLoading && clients.length === 0 && (
        <EmptyState
          icon={<Users size={40} />}
          title={intl.formatMessage({ id: 'clients.noClients' })}
        />
      )}

      <div className={styles.list}>
        {clients.map((client: Client) => (
          <Card
            key={client.id}
            className={styles.clientCard}
            onClick={() => {
              getTelegram()?.HapticFeedback.impactOccurred('light');
              navigate(`/master/clients/${client.id}`);
            }}
          >
            <Avatar name={`${client.firstName} ${client.lastName || ''}`} size="md" />
            <div className={styles.clientInfo}>
              <div className={styles.clientName}>
                {client.firstName} {client.lastName || ''}
              </div>
              <div className={styles.clientMeta}>
                {intl.formatMessage(
                  { id: 'clients.totalVisits' },
                  { count: client.stats?.totalBookings ?? 0 },
                )}
              </div>
            </div>
            {client.isBlocked && (
              <Badge variant="destructive">{intl.formatMessage({ id: 'clients.blocked' })}</Badge>
            )}
            <span className={styles.chevron}>›</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
