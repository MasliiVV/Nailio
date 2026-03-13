import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useDashboard } from '@/hooks';
import { Card, Tabs, SkeletonList, PageHeader, StatCard, StatGrid, Section } from '@/components/ui';
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

  const total = data?.period?.totalBookings ?? 0;
  const completed = data?.period?.completed ?? 0;
  const cancelled = data?.period?.cancelled ?? 0;
  const noShows = data?.period?.noShows ?? 0;

  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cancelledPct = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const noShowsPct = total > 0 ? Math.round((noShows / total) * 100) : 0;

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'analytics.title' })} />

      <Tabs tabs={periodTabs} activeId={period} onChange={(id) => setPeriod(id as Period)} />

      <StatGrid columns={2}>
        <StatCard
          value={data?.period?.totalBookings ?? 0}
          label={intl.formatMessage({ id: 'analytics.totalBookings' })}
        />
        <StatCard
          value={data?.period?.completed ?? 0}
          label={intl.formatMessage({ id: 'analytics.completed' })}
        />
        <StatCard
          value={`${((data?.period?.revenue ?? 0) / 100).toFixed(0)} ₴`}
          label={intl.formatMessage({ id: 'analytics.revenue' })}
        />
        <StatCard
          value={data?.period?.newClients ?? 0}
          label={intl.formatMessage({ id: 'analytics.newClients' })}
        />
      </StatGrid>

      {/* Booking outcomes chart */}
      {total > 0 && (
        <Section title={intl.formatMessage({ id: 'analytics.bookingOutcomes' })}>
          <Card>
            <div className={styles.chartBar}>
              {completedPct > 0 && (
                <div
                  className={styles.chartSegment}
                  style={{ width: `${completedPct}%`, background: 'var(--color-success)' }}
                />
              )}
              {cancelledPct > 0 && (
                <div
                  className={styles.chartSegment}
                  style={{ width: `${cancelledPct}%`, background: 'var(--color-warning)' }}
                />
              )}
              {noShowsPct > 0 && (
                <div
                  className={styles.chartSegment}
                  style={{ width: `${noShowsPct}%`, background: 'var(--color-destructive)' }}
                />
              )}
            </div>
            <div className={styles.chartLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--color-success)' }} />
                <span>{intl.formatMessage({ id: 'analytics.completed' })}</span>
                <span className={styles.legendValue}>{completed} ({completedPct}%)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--color-warning)' }} />
                <span>{intl.formatMessage({ id: 'analytics.cancelled' })}</span>
                <span className={styles.legendValue}>{cancelled} ({cancelledPct}%)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: 'var(--color-destructive)' }} />
                <span>{intl.formatMessage({ id: 'analytics.noShows' })}</span>
                <span className={styles.legendValue}>{noShows} ({noShowsPct}%)</span>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {data?.period?.popularServices && data.period.popularServices.length > 0 && (
        <Section title={intl.formatMessage({ id: 'analytics.popularServices' })}>
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
        </Section>
      )}
    </div>
  );
}
