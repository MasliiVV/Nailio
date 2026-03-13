import { Link } from 'react-router-dom';
import { Shield, Bot, CreditCard, Users, CalendarDays, Briefcase } from 'lucide-react';
import { useAdminTenants, useAuth } from '@/hooks';

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('uk-UA');
}

export function AdminDashboardPage() {
  const { data: tenants, isLoading } = useAdminTenants();
  const { profile, logout } = useAuth();

  return (
    <div className="page animate-fade-in" style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={24} /> Платформна адмінка
          </h1>
          <p className="text-secondary">
            {profile
              ? `Ви увійшли як ${profile.firstName} ${profile.lastName || ''}`.trim()
              : 'Керуйте майстрами, ботами та онбордингом.'}
          </p>
        </div>
        <button className="touchable" onClick={() => void logout()}>
          Вийти
        </button>
      </div>

      {isLoading ? <div className="spinner spinner-lg" /> : null}

      {!isLoading && (!tenants || tenants.length === 0) ? (
        <div className="card" style={{ padding: 20 }}>
          Ще немає жодного майстра. Нові акаунти з’являться тут після онбордингу через платформний
          бот.
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 16 }}>
        {tenants?.map((tenant) => (
          <Link
            key={tenant.id}
            to={`/admin/tenants/${tenant.id}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{tenant.displayName}</h2>
                  <p className="text-secondary" style={{ margin: '4px 0 0' }}>
                    @{tenant.slug} · {tenant.master.firstName} {tenant.master.lastName || ''}
                  </p>
                </div>
                <span className={`badge badge--${tenant.isActive ? 'success' : 'destructive'}`}>
                  {tenant.isActive ? 'Активний' : 'Вимкнений'}
                </span>
              </div>

              <div
                className="stats-grid"
                style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
              >
                <div className="stat-card">
                  <div
                    className="stat-card__value"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Users size={16} /> {tenant.counts.clients}
                  </div>
                  <div className="stat-card__label">Клієнти</div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-card__value"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <Briefcase size={16} /> {tenant.counts.services}
                  </div>
                  <div className="stat-card__label">Послуги</div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-card__value"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <CalendarDays size={16} /> {tenant.counts.bookings}
                  </div>
                  <div className="stat-card__label">Записи</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  className="text-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Bot size={16} />
                  {tenant.bot
                    ? `@${tenant.bot.botUsername} · ${tenant.bot.isActive ? 'бот активний' : 'бот вимкнений'}`
                    : 'бот ще не підключений'}
                </div>
                <div
                  className="text-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <CreditCard size={16} />
                  {tenant.subscription
                    ? `підписка: ${tenant.subscription.status}, до ${formatDate(tenant.subscription.currentPeriodEnd)}`
                    : 'підписка ще не створена'}
                </div>
                <div className="text-secondary">
                  Онбординг: {tenant.onboardingStatus} · пробний період до{' '}
                  {formatDate(tenant.trialEndsAt)}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
