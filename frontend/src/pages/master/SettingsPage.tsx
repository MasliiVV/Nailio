import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wallet, Crown, Clock, Scissors, Sparkles } from 'lucide-react';
import { Card, CardRow, PageHeader } from '@/components/ui';
import { prefetchMasterInsights } from '@/lib/prefetch';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const intl = useIntl();
  const navigate = useNavigate();

  const prefetchInsights = () => {
    prefetchMasterInsights();
  };

  return (
    <div className="page animate-fade-in">
      <>
        <PageHeader title={intl.formatMessage({ id: 'master.settings' })} />

        <Card padding="none" className={styles.cardGroup}>
          <>
            <CardRow
              icon={<BarChart3 size={20} />}
              title={intl.formatMessage({ id: 'master.analytics' })}
              onMouseEnter={prefetchInsights}
              onFocus={prefetchInsights}
              onTouchStart={prefetchInsights}
              onClick={() => navigate('/master/analytics')}
            />
            <CardRow
              icon={<Wallet size={20} />}
              title={intl.formatMessage({ id: 'master.finance' })}
              onMouseEnter={prefetchInsights}
              onFocus={prefetchInsights}
              onTouchStart={prefetchInsights}
              onClick={() => navigate('/master/finance')}
            />
            <CardRow
              icon={<Crown size={20} />}
              title={intl.formatMessage({ id: 'master.subscription' })}
              onMouseEnter={prefetchInsights}
              onFocus={prefetchInsights}
              onTouchStart={prefetchInsights}
              onClick={() => navigate('/master/subscription')}
            />
          </>
        </Card>

        <Card padding="none" className={styles.cardGroup}>
          <>
            <CardRow
              icon={<Clock size={20} />}
              title={intl.formatMessage({ id: 'schedule.title' })}
              onClick={() => navigate('/master/schedule')}
            />
            <CardRow
              icon={<Scissors size={20} />}
              title={intl.formatMessage({ id: 'services.title' })}
              onClick={() => navigate('/master/services')}
            />
            <CardRow
              icon={<Sparkles size={20} />}
              title={intl.formatMessage({ id: 'onboarding.previewShowcase' })}
              onClick={() => navigate('/master/showcase-preview')}
            />
          </>
        </Card>
      </>
    </div>
  );
}
