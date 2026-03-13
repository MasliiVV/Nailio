import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Hand } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input, FormGroup } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { ApiResponse, Profile } from '@/types';
import styles from './OnboardingPage.module.css';

function normalizePhone(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.replace(/[\s()-]/g, '');

  if (/^\+380\d{9}$/.test(normalized)) {
    return normalized;
  }

  if (/^380\d{9}$/.test(normalized)) {
    return `+${normalized}`;
  }

  if (/^0\d{9}$/.test(normalized)) {
    return `+38${normalized}`;
  }

  return normalized;
}

export function ClientOnboardingPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { updateProfile, setOnboardingComplete } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async () => {
    if (!firstName.trim()) return;

    setSubmitError('');
    setSaving(true);
    try {
      const res = await api.post<ApiResponse<Profile>>('/clients/onboarding', {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: normalizePhone(phone),
      });
      updateProfile(res.data);
      setOnboardingComplete();
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      navigate('/client');
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message === 'Phone must be in format +380XXXXXXXXX'
            ? intl.formatMessage({ id: 'client.onboarding.phoneError' })
            : error.message
          : intl.formatMessage({ id: 'client.onboarding.submitError' });

      setSubmitError(message);
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`page animate-fade-in ${styles.page}`}>
      <div className={styles.hero}>
        <Hand size={48} color="var(--color-primary)" />
        <h1 className={styles.heroTitle}>{intl.formatMessage({ id: 'client.welcome' })}</h1>
        <p className={`text-secondary ${styles.heroSubtitle}`}>
          {intl.formatMessage({ id: 'client.onboarding.title' })}
        </p>
      </div>

      <FormGroup gap="lg">
        <Input
          label={intl.formatMessage({ id: 'client.onboarding.firstName' })}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoFocus
        />
        <Input
          label={intl.formatMessage({ id: 'client.onboarding.lastName' })}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <Input
          label={intl.formatMessage({ id: 'client.onboarding.phone' })}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="+380..."
          hint={intl.formatMessage({ id: 'client.onboarding.phoneHint' })}
          error={
            submitError === intl.formatMessage({ id: 'client.onboarding.phoneError' })
              ? submitError
              : undefined
          }
        />
        {submitError &&
          submitError !== intl.formatMessage({ id: 'client.onboarding.phoneError' }) && (
            <div className={styles.errorText}>{submitError}</div>
          )}
        <Button
          fullWidth
          size="lg"
          loading={saving}
          onClick={handleSubmit}
          disabled={!firstName.trim()}
        >
          {intl.formatMessage({ id: 'client.onboarding.submit' })}
        </Button>
      </FormGroup>
    </div>
  );
}
