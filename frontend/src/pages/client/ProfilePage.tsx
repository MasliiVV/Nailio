import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useAuth } from '@/hooks/useAuth';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import type { ApiResponse, Profile } from '@/types';
import { getTelegram } from '@/lib/telegram';

export function ClientProfilePage() {
  const intl = useIntl();
  const { profile, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.lastName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put<ApiResponse<Profile>>('/api/v1/profile', {
        firstName,
        lastName,
        phone,
      });
      updateProfile(res.data);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{intl.formatMessage({ id: 'client.profile' })}</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label={intl.formatMessage({ id: 'client.onboarding.firstName' })}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
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
        <Button fullWidth loading={saving} onClick={handleSave}>
          {intl.formatMessage({ id: 'common.save' })}
        </Button>
      </div>
    </div>
  );
}
