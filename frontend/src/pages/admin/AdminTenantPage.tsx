import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, CreditCard, Settings, Users } from 'lucide-react';
import { useAdminTenant } from '@/hooks';

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
        <Link to="/admin" style={{ textDecoration: 'none' }}>
          ← Назад
        </Link>
        <p>Тенанта не знайдено.</p>
      </div>
    );
  }

  return (
    <div
      className="page animate-fade-in"
      style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}
    >
      <Link
        to="/admin"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
      >
        <ArrowLeft size={16} /> До списку майстрів
      </Link>

      <div className="card" style={{ padding: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          {tenant.displayName}
        </h1>
        <p className="text-secondary" style={{ margin: 0 }}>
          @{tenant.slug} · {tenant.master.firstName} {tenant.master.lastName || ''}
        </p>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-card__value">{tenant.counts.clients}</div>
          <div className="stat-card__label">Клієнти</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{tenant.counts.services}</div>
          <div className="stat-card__label">Послуги</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{tenant.counts.bookings}</div>
          <div className="stat-card__label">Записи</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <Users size={18} /> Профіль майстра
          </h2>
          <p>
            Ім'я: {tenant.master.firstName} {tenant.master.lastName || ''}
          </p>
          <p>Телефон майстра: {tenant.master.phone || '—'}</p>
          <p>Email бізнесу: {tenant.email || '—'}</p>
          <p>Телефон бізнесу: {tenant.phone || '—'}</p>
          <p>Часовий пояс: {tenant.timezone}</p>
          <p>Локаль: {tenant.locale}</p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <Bot size={18} /> Бот та онбординг
          </h2>
          <p>Статус онбордингу: {tenant.onboardingStatus}</p>
          <p>
            Бот:{' '}
            {tenant.bot
              ? `@${tenant.bot.botUsername} (${tenant.bot.isActive ? 'active' : 'inactive'})`
              : 'не підключений'}
          </p>
          <p>Trial до: {formatDate(tenant.trialEndsAt)}</p>
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {renderJson(tenant.onboardingChecklist)}
          </pre>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <CreditCard size={18} /> Платежі та підписка
          </h2>
          <p>Підписка: {tenant.subscription ? tenant.subscription.status : '—'}</p>
          <p>Період до: {formatDate(tenant.subscription?.currentPeriodEnd || null)}</p>
          <p>Провайдер підписки: {tenant.subscription?.paymentProvider || '—'}</p>
          <p>
            Платіжні налаштування:{' '}
            {tenant.paymentSettings
              ? `${tenant.paymentSettings.provider} (${tenant.paymentSettings.isActive ? 'active' : 'inactive'})`
              : 'не підключені'}
          </p>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <Settings size={18} /> Налаштування
          </h2>
          <h3>Branding</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{renderJson(tenant.branding)}</pre>
          <h3>Settings</h3>
          <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
            {renderJson(tenant.settings)}
          </pre>
        </div>
      </div>
    </div>
  );
}
