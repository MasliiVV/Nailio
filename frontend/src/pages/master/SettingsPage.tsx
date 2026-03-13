import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wallet, Crown, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Card, CardRow, PageHeader } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'master.settings' })} />

      <Card padding="none" className={styles.cardGroup}>
        <CardRow
          icon={<BarChart3 size={20} />}
          title={intl.formatMessage({ id: 'master.analytics' })}
          onClick={() => navigate('/master/analytics')}
        />
        <CardRow
          icon={<Wallet size={20} />}
          title={intl.formatMessage({ id: 'master.finance' })}
          onClick={() => navigate('/master/finance')}
        />
        <CardRow
          icon={<Crown size={20} />}
          title={intl.formatMessage({ id: 'master.subscription' })}
          onClick={() => navigate('/master/subscription')}
        />
      </Card>

      <Card padding="none" className={styles.cardGroup}>
        <CardRow
          icon={<Clock size={20} />}
          title={intl.formatMessage({ id: 'schedule.title' })}
          onClick={() => navigate('/master/schedule')}
        />
      </Card>

      <Card padding="none" className={styles.cardGroup}>
        <CardRow
          icon={<LogOut size={20} />}
          title={intl.formatMessage({ id: 'common.logout' })}
          onClick={() => {
            getTelegram()?.HapticFeedback.impactOccurred('medium');
            logout();
          }}
        />
      </Card>
    </div>
  );
}
