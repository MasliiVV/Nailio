import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Hand } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { ApiResponse, Profile } from '@/types';

export function ClientOnboardingPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { updateProfile, setOnboardingComplete } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!firstName.trim()) return;
    setSaving(true);
    try {
      const res = await api.post<ApiResponse<Profile>>('/api/v1/clients/onboarding', {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      updateProfile(res.data);
      setOnboardingComplete();
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      navigate('/client');
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
        />
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
