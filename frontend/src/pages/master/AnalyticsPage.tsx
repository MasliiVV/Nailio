import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useDashboard } from '@/hooks';
import { Card, Tabs, SkeletonList } from '@/components/ui';
import styles from './AnalyticsPage.module.css';

type Period = 'week' | 'month' | 'year';

export function AnalyticsPage() {
  const intl = useIntl();
  const [period, setPeriod] = useState<Period>('week');
  const { data, isLoading } = useDashboard(period);

  const periodTabs = [
    { id: 'week', label: intl.formatMessage({ id: 'analytics.week' }) },
    { id: 'month', label: intl.formatMessage({ id: 'analytics.month' }) },
    { id: 'year', label: intl.formatMessage({ id: 'analytics.year' }) },
  ];

  if (isLoading) {
    return (
      <div className="page">
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="page animate-fade-in">
      <h1 className="page-title">{intl.formatMessage({ id: 'analytics.title' })}</h1>

      <Tabs tabs={periodTabs} activeId={period} onChange={(id) => setPeriod(id as Period)} />

      <div className={styles.statsGrid}>
        <div className="stat-card">
          <span className="stat-card__label">
            {intl.formatMessage({ id: 'analytics.totalBookings' })}
          </span>
          <span className="stat-card__value">{data?.period?.totalBookings ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">
            {intl.formatMessage({ id: 'analytics.completed' })}
          </span>
          <span className="stat-card__value">{data?.period?.completed ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">
            {intl.formatMessage({ id: 'analytics.revenue' })}
          </span>
          <span className="stat-card__value">
            {((data?.period?.revenue ?? 0) / 100).toFixed(0)} ₴
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">
            {intl.formatMessage({ id: 'analytics.newClients' })}
          </span>
          <span className="stat-card__value">{data?.period?.newClients ?? 0}</span>
        </div>
      </div>

      {data?.period?.popularServices && data.period.popularServices.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className={styles.sectionTitle}>
            {intl.formatMessage({ id: 'analytics.popularServices' })}
          </h2>
          <Card padding="none">
            {data.period.popularServices.map(
              (service: { name: string; count: number }, i: number) => (
                <div key={i} className={styles.serviceRow}>
                  <span className={styles.serviceRank}>#{i + 1}</span>
                  <span className={styles.serviceName}>{service.name}</span>
                  <span className={styles.serviceCount}>{service.count}</span>
                </div>
              ),
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
