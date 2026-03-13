import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Shield, Bot, CreditCard, Users, CalendarDays, Briefcase } from 'lucide-react';
import { useAdminTenants, useAuth } from '@/hooks';
import { Badge, StatCard, StatGrid } from '@/components/ui';
import styles from './AdminDashboardPage.module.css';

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('uk-UA');
}

export function AdminDashboardPage() {
  const intl = useIntl();
  const { data: tenants, isLoading } = useAdminTenants();
  const { profile, logout } = useAuth();

  return (
    <div className={`page animate-fade-in ${styles.page}`}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={`page-title ${styles.titleRow}`}>
            <Shield size={24} /> {intl.formatMessage({ id: 'admin.title' })}
          </h1>
          <p className="text-secondary">
            {profile
              ? intl.formatMessage(
                  { id: 'admin.loggedInAs' },
                  { name: `${profile.firstName} ${profile.lastName || ''}`.trim() },
                )
              : intl.formatMessage({ id: 'admin.description' })}
          </p>
        </div>
        <button className="touchable" onClick={() => void logout()}>
          {intl.formatMessage({ id: 'common.logout' })}
        </button>
      </div>

      {isLoading ? <div className="spinner spinner-lg" /> : null}

      {!isLoading && (!tenants || tenants.length === 0) ? (
        <div className={`card ${styles.emptyCard}`}>
          {intl.formatMessage({ id: 'admin.noTenants' })}
        </div>
      ) : null}

      <div className={styles.tenantGrid}>
        {tenants?.map((tenant) => (
          <Link key={tenant.id} to={`/admin/tenants/${tenant.id}`} className={styles.tenantLink}>
            <div className={`card ${styles.tenantCard}`}>
              <div className={styles.tenantHeader}>
                <div>
                  <h2 className={styles.tenantName}>{tenant.displayName}</h2>
                  <p className={`text-secondary ${styles.tenantSlug}`}>
                    @{tenant.slug} · {tenant.master.firstName} {tenant.master.lastName || ''}
                  </p>
                </div>
                <Badge variant={tenant.isActive ? 'success' : 'destructive'}>
                  {tenant.isActive
                    ? intl.formatMessage({ id: 'admin.active' })
                    : intl.formatMessage({ id: 'admin.inactive' })}
                </Badge>
              </div>

              <StatGrid columns={3}>
                <StatCard
                  value={tenant.counts.clients}
                  label={intl.formatMessage({ id: 'admin.clients' })}
                  icon={<Users size={16} />}
                />
                <StatCard
                  value={tenant.counts.services}
                  label={intl.formatMessage({ id: 'admin.services' })}
                  icon={<Briefcase size={16} />}
                />
                <StatCard
                  value={tenant.counts.bookings}
                  label={intl.formatMessage({ id: 'admin.bookings' })}
                  icon={<CalendarDays size={16} />}
                />
              </StatGrid>

              <div className={styles.metaGrid}>
                <div className={`text-secondary ${styles.metaRow}`}>
                  <Bot size={16} />
                  {tenant.bot
                    ? `@${tenant.bot.botUsername} · ${tenant.bot.isActive ? intl.formatMessage({ id: 'admin.botActive' }) : intl.formatMessage({ id: 'admin.botInactive' })}`
                    : intl.formatMessage({ id: 'admin.botNotConnected' })}
                </div>
                <div className={`text-secondary ${styles.metaRow}`}>
                  <CreditCard size={16} />
                  {tenant.subscription
                    ? `${intl.formatMessage({ id: 'admin.subscription' })}: ${tenant.subscription.status}, ${intl.formatMessage({ id: 'admin.until' })} ${formatDate(tenant.subscription.currentPeriodEnd)}`
                    : intl.formatMessage({ id: 'admin.noSubscription' })}
                </div>
                <div className="text-secondary">
                  {intl.formatMessage({ id: 'admin.onboarding' })}: {tenant.onboardingStatus} ·{' '}
                  {intl.formatMessage({ id: 'admin.trialUntil' })} {formatDate(tenant.trialEndsAt)}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
