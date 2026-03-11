import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Scissors } from 'lucide-react';
import { useServices } from '@/hooks';
import { useAuth } from '@/hooks/useAuth';
import { Card, EmptyState, SkeletonList } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import styles from './HomePage.module.css';

export function ClientHomePage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const { data: services, isLoading, error } = useServices();

  const handleSelectService = (serviceId: string) => {
    getTelegram()?.HapticFeedback.impactOccurred('light');
    navigate(`/client/book/${serviceId}`);
  };

  return (
    <div className="page animate-fade-in">
      {/* Welcome header */}
      <div className={styles.header}>
        {tenant?.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.displayName} className={styles.logo} />
        )}
        <h1 className={styles.title}>{tenant?.displayName || 'GlowUp'}</h1>
        {tenant?.branding?.welcomeMessage && (
          <p className={styles.welcome}>{tenant.branding.welcomeMessage}</p>
        )}
      </div>

      {/* Services list */}
      <div className={styles.section}>
        <h2 className="section-title">
          {intl.formatMessage({ id: 'client.selectService' })}
        </h2>

        {isLoading && <SkeletonList count={3} />}

        {error && (
          <EmptyState
            icon={<AlertCircle size={40} />}
            title={intl.formatMessage({ id: 'common.error' })}
          />
        )}

        {services && services.length === 0 && (
          <EmptyState
            icon={<Scissors size={40} />}
            title={intl.formatMessage({ id: 'services.noServices' })}
          />
        )}

        {services && services.length > 0 && (
          <div className={styles.servicesList}>
            {services.map((service) => (
              <Card
                key={service.id}
                onClick={() => handleSelectService(service.id)}
                className={styles.serviceCard}
              >
                <div className={styles.serviceColor} style={{ backgroundColor: service.color || 'var(--color-primary)' }} />
                <div className={styles.serviceInfo}>
                  <span className={styles.serviceName}>{service.name}</span>
                  {service.description && (
                    <span className={styles.serviceDesc}>{service.description}</span>
                  )}
                  <div className={styles.serviceMeta}>
                    <span>{intl.formatMessage({ id: 'booking.duration' }, { duration: service.durationMinutes })}</span>
                    <span className={styles.servicePrice}>
                      {(service.price / 100).toFixed(0)} {intl.formatMessage({ id: 'common.uah' })}
                    </span>
                  </div>
                </div>
                <span className={styles.chevron}>›</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
