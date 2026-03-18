import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useDashboard } from '@/hooks';
import { Card, Tabs, SkeletonList, PageHeader, Section } from '@/components/ui';
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
  const revenue = data?.period?.revenue ?? 0;
  const newClients = data?.period?.newClients ?? 0;
  const todayBookings = data?.today?.bookings ?? 0;
  const todayRevenue = data?.today?.revenue ?? 0;
  const nextBooking = data?.today?.nextBooking ?? null;

  const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cancelledPct = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  const noShowsPct = total > 0 ? Math.round((noShows / total) * 100) : 0;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const attentionRate = total > 0 ? Math.round(((cancelled + noShows) / total) * 100) : 0;
  const averageCheck = total > 0 ? Math.round(revenue / total / 100) : 0;
  const topService = data?.period?.popularServices?.[0] ?? null;

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intl.locale === 'en' ? 'en-US' : 'uk-UA', {
        maximumFractionDigits: 0,
      }),
    [intl.locale],
  );

  const formatCurrency = (value: number) => `${currencyFormatter.format(value / 100)} ₴`;

  const periodLabel = periodTabs.find((tab) => tab.id === period)?.label ?? '';

  const statCards = [
    {
      key: 'total',
      toneClass: styles.tonePrimary,
      label: intl.formatMessage({ id: 'analytics.totalBookings' }),
      value: total,
      helper: intl.formatMessage({ id: 'analytics.totalBookingsHint' }, { period: periodLabel }),
      icon: <TrendingUp size={18} />,
    },
    {
      key: 'revenue',
      toneClass: styles.toneSuccess,
      label: intl.formatMessage({ id: 'analytics.revenue' }),
      value: formatCurrency(revenue),
      helper: intl.formatMessage({ id: 'analytics.averageCheck' }, { value: averageCheck }),
      icon: <Wallet size={18} />,
    },
    {
      key: 'clients',
      toneClass: styles.toneAccent,
      label: intl.formatMessage({ id: 'analytics.newClients' }),
      value: newClients,
      helper: intl.formatMessage({ id: 'analytics.clientsGrowthHint' }),
      icon: <Users size={18} />,
    },
    {
      key: 'success',
      toneClass: styles.toneNeutral,
      label: intl.formatMessage({ id: 'analytics.successRate' }),
      value: `${successRate}%`,
      helper: intl.formatMessage({ id: 'analytics.completedCountHint' }, { count: completed }),
      icon: <CheckCircle2 size={18} />,
    },
  ] as const;

  return (
    <div className="page animate-fade-in">
      <PageHeader
        title={intl.formatMessage({ id: 'analytics.title' })}
        subtitle={intl.formatMessage({ id: 'analytics.subtitle' })}
      />

      <Card className={styles.heroCard}>
        <div className={styles.heroTopRow}>
          <div>
            <div className={styles.heroEyebrow}>
              <Sparkles size={14} />
              {intl.formatMessage({ id: 'analytics.periodOverview' }, { period: periodLabel })}
            </div>
            <h2 className={styles.heroTitle}>
              {intl.formatMessage({ id: 'analytics.heroTitle' })}
            </h2>
            <p className={styles.heroSubtitle}>
              {intl.formatMessage({ id: 'analytics.heroSubtitle' })}
            </p>
          </div>

          <div className={styles.heroBadge}>
            <span>{intl.formatMessage({ id: 'analytics.revenue' })}</span>
            <strong>{formatCurrency(revenue)}</strong>
          </div>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.heroStatCard}>
            <span className={styles.heroStatLabel}>
              {intl.formatMessage({ id: 'master.todayBookings' })}
            </span>
            <strong className={styles.heroStatValue}>{todayBookings}</strong>
          </div>
          <div className={styles.heroStatCard}>
            <span className={styles.heroStatLabel}>
              {intl.formatMessage({ id: 'master.todayRevenue' })}
            </span>
            <strong className={styles.heroStatValue}>{formatCurrency(todayRevenue)}</strong>
          </div>
          <div className={styles.heroStatCard}>
            <span className={styles.heroStatLabel}>
              {intl.formatMessage({ id: 'analytics.nextFocus' })}
            </span>
            <strong className={styles.heroStatValueSmall}>
              {topService?.name || intl.formatMessage({ id: 'analytics.noDataShort' })}
            </strong>
          </div>
        </div>

        <div className={styles.tabWrap}>
          <Tabs tabs={periodTabs} activeId={period} onChange={(id) => setPeriod(id as Period)} />
        </div>
      </Card>

      <div className={styles.statsGrid}>
        {statCards.map((item) => (
          <Card key={item.key} className={`${styles.statCard} ${item.toneClass}`}>
            <div className={styles.statIcon}>{item.icon}</div>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statHelper}>{item.helper}</div>
          </Card>
        ))}
      </div>

      <div className={styles.insightsGrid}>
        <Section title={intl.formatMessage({ id: 'analytics.bookingOutcomes' })}>
          <Card className={styles.outcomesCard}>
            {total > 0 ? (
              <>
                <div className={styles.outcomesHeader}>
                  <div>
                    <div className={styles.outcomesTitle}>
                      {intl.formatMessage({ id: 'analytics.successRate' })}
                    </div>
                    <div className={styles.outcomesHeadline}>{successRate}%</div>
                    <p className={styles.outcomesHint}>
                      {intl.formatMessage(
                        { id: 'analytics.attentionRate' },
                        { value: attentionRate },
                      )}
                    </p>
                  </div>

                  <div
                    className={styles.progressRing}
                    style={{
                      background: `conic-gradient(var(--color-success) ${completedPct}%, var(--color-warning) ${completedPct}% ${completedPct + cancelledPct}%, var(--color-destructive) ${completedPct + cancelledPct}% 100%)`,
                    }}
                  >
                    <div className={styles.progressRingInner}>
                      <strong>{total}</strong>
                      <span>{intl.formatMessage({ id: 'analytics.totalBookings' })}</span>
                    </div>
                  </div>
                </div>

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
                  <div className={styles.legendItemCard}>
                    <span
                      className={styles.legendDot}
                      style={{ background: 'var(--color-success)' }}
                    />
                    <div>
                      <span>{intl.formatMessage({ id: 'analytics.completed' })}</span>
                      <strong>{completed}</strong>
                    </div>
                    <span className={styles.legendValue}>{completedPct}%</span>
                  </div>
                  <div className={styles.legendItemCard}>
                    <span
                      className={styles.legendDot}
                      style={{ background: 'var(--color-warning)' }}
                    />
                    <div>
                      <span>{intl.formatMessage({ id: 'analytics.cancelled' })}</span>
                      <strong>{cancelled}</strong>
                    </div>
                    <span className={styles.legendValue}>{cancelledPct}%</span>
                  </div>
                  <div className={styles.legendItemCard}>
                    <span
                      className={styles.legendDot}
                      style={{ background: 'var(--color-destructive)' }}
                    />
                    <div>
                      <span>{intl.formatMessage({ id: 'analytics.noShows' })}</span>
                      <strong>{noShows}</strong>
                    </div>
                    <span className={styles.legendValue}>{noShowsPct}%</span>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>
                <Clock3 size={28} />
                <div>
                  <strong>{intl.formatMessage({ id: 'analytics.noDataTitle' })}</strong>
                  <p>{intl.formatMessage({ id: 'analytics.noDataHint' })}</p>
                </div>
              </div>
            )}
          </Card>
        </Section>

        <Section title={intl.formatMessage({ id: 'analytics.todaySnapshot' })}>
          <Card className={styles.focusCard}>
            <div className={styles.focusRow}>
              <div className={styles.focusIconWrap}>
                <ArrowUpRight size={18} />
              </div>
              <div>
                <div className={styles.focusLabel}>
                  {intl.formatMessage({ id: 'analytics.nextBooking' })}
                </div>
                <strong className={styles.focusValue}>
                  {nextBooking?.serviceNameSnapshot ||
                    intl.formatMessage({ id: 'analytics.noDataShort' })}
                </strong>
              </div>
            </div>
            <div className={styles.focusMetrics}>
              <div>
                <span>{intl.formatMessage({ id: 'master.todayBookings' })}</span>
                <strong>{todayBookings}</strong>
              </div>
              <div>
                <span>{intl.formatMessage({ id: 'master.todayRevenue' })}</span>
                <strong>{formatCurrency(todayRevenue)}</strong>
              </div>
              <div>
                <span>{intl.formatMessage({ id: 'analytics.attentionNeeded' })}</span>
                <strong>{attentionRate}%</strong>
              </div>
            </div>
          </Card>
        </Section>
      </div>

      {data?.period?.popularServices && data.period.popularServices.length > 0 && (
        <Section title={intl.formatMessage({ id: 'analytics.popularServices' })}>
          <Card className={styles.servicesCard}>
            {data.period.popularServices.map(
              (service: { name: string; count: number }, i: number) => (
                <div key={i} className={styles.serviceRow}>
                  <div className={styles.serviceRank}>{i + 1}</div>
                  <div className={styles.serviceInfo}>
                    <div className={styles.serviceRowTop}>
                      <span className={styles.serviceName}>{service.name}</span>
                      <span className={styles.serviceCount}>{service.count}</span>
                    </div>
                    <div className={styles.serviceBarTrack}>
                      <div
                        className={styles.serviceBarFill}
                        style={{
                          width: `${Math.max(
                            12,
                            Math.round(
                              (service.count / (topService?.count || service.count || 1)) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ),
            )}
          </Card>
        </Section>
      )}
    </div>
  );
}
