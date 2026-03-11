import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useClients } from '@/hooks';
import { Card, Avatar, Input, EmptyState, SkeletonList } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { Client } from '@/types';

export function ClientsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: clientsData, isLoading } = useClients(search || undefined);

  const clients = clientsData?.items || [];

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{intl.formatMessage({ id: 'clients.title' })}</h1>
      </div>

      <Input
        placeholder={intl.formatMessage({ id: 'common.search' })}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ marginTop: 16 }}>
        {isLoading && <SkeletonList count={5} />}

        {!isLoading && clients.length === 0 && (
          <EmptyState
            icon={<Users size={40} />}
            title={intl.formatMessage({ id: 'clients.noClients' })}
          />
        )}

        {clients.map((client: Client) => (
          <Card
            key={client.id}
            onClick={() => {
              getTelegram()?.HapticFeedback.impactOccurred('light');
              navigate(`/master/clients/${client.id}`);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <Avatar
                name={`${client.firstName} ${client.lastName || ''}`}
                size="md"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 15 }}>
                  {client.firstName} {client.lastName || ''}
                </div>
                <div className="text-secondary" style={{ fontSize: 13 }}>
                  {intl.formatMessage({ id: 'clients.totalVisits' }, { count: client.stats.totalBookings })}
                </div>
              </div>
              {client.isBlocked && (
                <span className="badge badge--destructive">
                  {intl.formatMessage({ id: 'clients.blocked' })}
                </span>
              )}
              <span style={{ color: 'var(--color-text-secondary)', opacity: 0.5, fontSize: 20 }}>›</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
