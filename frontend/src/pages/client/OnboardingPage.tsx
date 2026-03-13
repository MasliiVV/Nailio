import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Hand } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input } from '@/components/ui';
import { api, ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { ApiResponse, Profile } from '@/types';

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
    <div className="page animate-fade-in" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Hand size={48} color="var(--color-primary)" />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>
          {intl.formatMessage({ id: 'client.welcome' })}
        </h1>
        <p className="text-secondary" style={{ marginTop: 4 }}>
          {intl.formatMessage({ id: 'client.onboarding.title' })}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          error={submitError === intl.formatMessage({ id: 'client.onboarding.phoneError' }) ? submitError : undefined}
        />
        {submitError && submitError !== intl.formatMessage({ id: 'client.onboarding.phoneError' }) && (
          <div className="text-secondary" style={{ color: 'var(--color-danger, #ef4444)', fontSize: 14 }}>
            {submitError}
          </div>
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
      </div>
    </div>
  );
}
