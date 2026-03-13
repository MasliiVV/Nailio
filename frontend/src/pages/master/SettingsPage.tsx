import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wallet, Crown, Palette, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Card, CardRow, Button, Input, BottomSheet } from '@/components/ui';
import { api } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { ApiResponse, Tenant, UpdateBrandingDto } from '@/types';

export function SettingsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { tenant, updateTenant, logout } = useAuth();

  const [showBranding, setShowBranding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(tenant?.displayName || '');
  const [welcomeMessage, setWelcomeMessage] = useState(tenant?.branding?.welcomeMessage || '');
  const [primaryColor, setPrimaryColor] = useState(tenant?.branding?.primaryColor || '#6C5CE7');

  const handleSaveBranding = async () => {
    setSaving(true);
    try {
      const dto: UpdateBrandingDto = { displayName, primaryColor, welcomeMessage };
      const res = await api.put<ApiResponse<Tenant>>('/settings/branding', dto);
      updateTenant(res.data);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      setShowBranding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <h1 className="page-title">{intl.formatMessage({ id: 'master.settings' })}</h1>

      <Card padding="none" style={{ marginBottom: 16 }}>
        <CardRow
          icon={<BarChart3 size={20} />}
          title={intl.formatMessage({ id: 'master.analytics' })}
          onClick={() => navigate('/master/analytics')}
        />
        <CardRow
          icon={<Wallet size={20} />}
          title={intl.formatMessage({ id: 'master.finance' })}
          onClick={() => navigate('/master/finance')}
        />
        <CardRow
          icon={<Crown size={20} />}
          title={intl.formatMessage({ id: 'master.subscription' })}
          onClick={() => navigate('/master/subscription')}
        />
      </Card>

      <Card padding="none" style={{ marginBottom: 16 }}>
        <CardRow
          icon={<Palette size={20} />}
          title={intl.formatMessage({ id: 'settings.branding' })}
          subtitle={tenant?.displayName}
          onClick={() => setShowBranding(true)}
        />
        <CardRow
          icon={<Clock size={20} />}
          title={intl.formatMessage({ id: 'schedule.title' })}
          onClick={() => navigate('/master/schedule')}
        />
      </Card>

      <Card padding="none" style={{ marginBottom: 24 }}>
        <CardRow
          icon={<LogOut size={20} />}
          title={intl.formatMessage({ id: 'common.logout' })}
          onClick={() => {
            getTelegram()?.HapticFeedback.impactOccurred('medium');
            logout();
          }}
        />
      </Card>

      <BottomSheet
        open={showBranding}
        onClose={() => setShowBranding(false)}
        title={intl.formatMessage({ id: 'settings.branding' })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label={intl.formatMessage({ id: 'settings.displayName' })}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label={intl.formatMessage({ id: 'settings.welcomeMessage' })}
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
          />
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
              }}
            >
              {intl.formatMessage({ id: 'settings.primaryColor' })}
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                style={{
                  width: 48,
                  height: 48,
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
                {primaryColor}
              </span>
            </div>
          </div>
          <Button fullWidth loading={saving} onClick={handleSaveBranding}>
            {intl.formatMessage({ id: 'common.save' })}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
