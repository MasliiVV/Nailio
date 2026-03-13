import { Link, useParams } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { ArrowLeft, Bot, CreditCard, Settings, Users } from 'lucide-react';
import { useAdminTenant } from '@/hooks';
import { StatCard, StatGrid } from '@/components/ui';
import styles from './AdminTenantPage.module.css';

function renderJson(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '—';
  }

  return entries
    .map(
      ([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`,
    )
    .join('\n');
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('uk-UA');
}

export function AdminTenantPage() {
  const intl = useIntl();
  const { id = '' } = useParams();
  const { data: tenant, isLoading } = useAdminTenant(id);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="page">
        <Link to="/admin" className={styles.backLink}>
          <ArrowLeft size={16} /> {intl.formatMessage({ id: 'common.back' })}
        </Link>
        <p>{intl.formatMessage({ id: 'admin.tenantNotFound' })}</p>
      </div>
    );
  }

  return (
    <div className={`page animate-fade-in ${styles.page}`}>
      <Link to="/admin" className={styles.backLink}>
        <ArrowLeft size={16} /> {intl.formatMessage({ id: 'admin.backToList' })}
      </Link>

      <div className={`card ${styles.profileCard}`}>
        <h1 className={`page-title ${styles.profileName}`}>{tenant.displayName}</h1>
        <p className={`text-secondary ${styles.profileSlug}`}>
          @{tenant.slug} · {tenant.master.firstName} {tenant.master.lastName || ''}
        </p>
      </div>

      <StatGrid columns={3}>
        <StatCard
          value={tenant.counts.clients}
          label={intl.formatMessage({ id: 'admin.clients' })}
        />
        <StatCard
          value={tenant.counts.services}
          label={intl.formatMessage({ id: 'admin.services' })}
        />
        <StatCard
          value={tenant.counts.bookings}
          label={intl.formatMessage({ id: 'admin.bookings' })}
        />
      </StatGrid>

      <div className={styles.sectionGrid}>
        <div className={`card ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>
            <Users size={18} /> {intl.formatMessage({ id: 'admin.masterProfile' })}
          </h2>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.name' })}: {tenant.master.firstName}{' '}
            {tenant.master.lastName || ''}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.masterPhone' })}: {tenant.master.phone || '—'}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.businessEmail' })}: {tenant.email || '—'}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.businessPhone' })}: {tenant.phone || '—'}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.timezone' })}: {tenant.timezone}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.locale' })}: {tenant.locale}
          </p>
        </div>

        <div className={`card ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>
            <Bot size={18} /> {intl.formatMessage({ id: 'admin.botAndOnboarding' })}
          </h2>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.onboardingStatus' })}: {tenant.onboardingStatus}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.bot' })}:{' '}
            {tenant.bot
              ? `@${tenant.bot.botUsername} (${tenant.bot.isActive ? 'active' : 'inactive'})`
              : intl.formatMessage({ id: 'admin.botNotConnected' })}
          </p>
          <p className={styles.detail}>
            Trial {intl.formatMessage({ id: 'admin.until' })}: {formatDate(tenant.trialEndsAt)}
          </p>
          <pre className={styles.pre}>{renderJson(tenant.onboardingChecklist)}</pre>
        </div>

        <div className={`card ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>
            <CreditCard size={18} /> {intl.formatMessage({ id: 'admin.paymentsAndSubscription' })}
          </h2>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.subscription' })}:{' '}
            {tenant.subscription ? tenant.subscription.status : '—'}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.periodUntil' })}:{' '}
            {formatDate(tenant.subscription?.currentPeriodEnd || null)}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.paymentProvider' })}:{' '}
            {tenant.subscription?.paymentProvider || '—'}
          </p>
          <p className={styles.detail}>
            {intl.formatMessage({ id: 'admin.paymentSettings' })}:{' '}
            {tenant.paymentSettings
              ? `${tenant.paymentSettings.provider} (${tenant.paymentSettings.isActive ? 'active' : 'inactive'})`
              : intl.formatMessage({ id: 'admin.notConnected' })}
          </p>
        </div>

        <div className={`card ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>
            <Settings size={18} /> {intl.formatMessage({ id: 'master.settings' })}
          </h2>
          <h3>Branding</h3>
          <pre className={styles.pre}>{renderJson(tenant.branding)}</pre>
          <h3>Settings</h3>
          <pre className={styles.pre}>{renderJson(tenant.settings)}</pre>
        </div>
      </div>
    </div>
  );
}
