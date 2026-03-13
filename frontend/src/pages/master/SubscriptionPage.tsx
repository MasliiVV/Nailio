import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Gift, CheckCircle, AlertTriangle, XCircle, Ban, Crown, HelpCircle } from 'lucide-react';
import {
  useSubscription,
  useSubscriptionPayments,
  useCheckout,
  useCancelSubscription,
} from '@/hooks';
import { Card, Button, EmptyState, SkeletonList } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { SubscriptionPayment } from '@/types';
import styles from './SubscriptionPage.module.css';

const STATUS_ICON: Record<string, ReactNode> = {
  trial: <Gift size={28} color="var(--color-primary)" />,
  active: <CheckCircle size={28} color="var(--color-success)" />,
  past_due: <AlertTriangle size={28} color="var(--color-warning)" />,
  expired: <XCircle size={28} color="var(--color-destructive)" />,
  cancelled: <Ban size={28} color="var(--color-text-secondary)" />,
};

export function SubscriptionPage() {
  const intl = useIntl();
  const { data: subscription, isLoading } = useSubscription();
  const { data: payments } = useSubscriptionPayments();
  const checkout = useCheckout();
  const cancel = useCancelSubscription();

  const handleCheckout = () => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    checkout.mutate('monobank');
  };

  const handleCancel = () => {
    getTelegram()?.HapticFeedback.impactOccurred('heavy');
    const tg = getTelegram();
    if (tg) {
      tg.showConfirm(intl.formatMessage({ id: 'subscription.confirmCancel' }), (confirmed) => {
        if (confirmed) cancel.mutate();
      });
    }
  };

  if (isLoading) {
    return (
      <div className="page">
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="page">
        <EmptyState
          icon={<Crown size={40} color="var(--color-primary)" />}
          title={intl.formatMessage({ id: 'subscription.noSubscription' })}
          action={
            <Button onClick={handleCheckout} loading={checkout.isPending}>
              {intl.formatMessage({ id: 'subscription.subscribe' })}
            </Button>
          }
        />
      </div>
    );
  }

  const daysLeft = subscription.currentPeriodEnd
    ? Math.max(
        0,
        Math.ceil((new Date(subscription.currentPeriodEnd).getTime() - Date.now()) / 86400000),
      )
    : 0;

  const statusKey = subscription.status;

  return (
    <div className="page animate-fade-in">
      <h1 className="page-title">{intl.formatMessage({ id: 'subscription.title' })}</h1>

      <Card style={{ marginBottom: 16, textAlign: 'center' as const }}>
        <div className={styles.statusSection}>
          <span className={styles.statusEmoji}>
            {STATUS_ICON[statusKey] || <HelpCircle size={28} />}
          </span>
          <span className={styles.statusText}>
            {intl.formatMessage({ id: `subscription.status.${statusKey}` })}
          </span>
          {daysLeft > 0 && (
            <span className={styles.daysLeft}>
              {intl.formatMessage({ id: 'subscription.daysLeft' }, { days: daysLeft })}
            </span>
          )}
        </div>

        {subscription.plan && (
          <div className={styles.planInfo}>
            <span className={styles.planName}>{subscription.plan}</span>
            {subscription.pricePerMonth && (
              <span className={styles.planPrice}>
                {(subscription.pricePerMonth / 100).toFixed(0)} ₴/
                {intl.formatMessage({ id: 'analytics.month' })}
              </span>
            )}
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(statusKey === 'expired' || statusKey === 'cancelled' || statusKey === 'trial') && (
          <Button fullWidth onClick={handleCheckout} loading={checkout.isPending}>
            {intl.formatMessage({ id: 'subscription.subscribe' })}
          </Button>
        )}
        {(statusKey === 'active' || statusKey === 'trial') && (
          <Button fullWidth variant="destructive" onClick={handleCancel} loading={cancel.isPending}>
            {intl.formatMessage({ id: 'subscription.cancel' })}
          </Button>
        )}
      </div>

      {payments && payments.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>
            {intl.formatMessage({ id: 'subscription.payments' })}
          </h2>
          {payments.map((payment: SubscriptionPayment) => (
            <Card key={payment.id} style={{ marginBottom: 6 }}>
              <div className={styles.paymentRow}>
                <div>
                  <div style={{ fontWeight: 500 }}>{(payment.amount / 100).toFixed(0)} ₴</div>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    {new Date(payment.createdAt).toLocaleDateString('uk-UA')}
                  </div>
                </div>
                <span
                  className={`badge badge--${payment.status === 'success' ? 'success' : payment.status === 'pending' ? 'warning' : 'destructive'}`}
                >
                  {payment.status}
                </span>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
