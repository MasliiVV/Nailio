import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Wallet, Crown, Palette, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Card, CardRow, Button, Input, BottomSheet, PageHeader, FormGroup } from '@/components/ui';
import { api } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import type { ApiResponse, Tenant, UpdateBrandingDto } from '@/types';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { tenant, updateTenant, logout } = useAuth();

  const [showBranding, setShowBranding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState(tenant?.displayName || '');
  const [welcomeMessage, setWelcomeMessage] = useState(tenant?.branding?.welcomeMessage || '');
  const [primaryColor, setPrimaryColor] = useState(tenant?.branding?.primaryColor || '#6C5CE7');

  // Color presets for quick selection
  const colorPresets = [
    '#6C5CE7',
    '#E84393',
    '#D63031',
    '#E17055',
    '#FDCB6E',
    '#00B894',
    '#0984E3',
    '#6D214F',
    '#B33771',
    '#FD7272',
    '#58B19F',
    '#2C3A47',
  ];

  // Apply color preview in real-time
  const handleColorChange = (color: string) => {
    setPrimaryColor(color);
    document.documentElement.style.setProperty('--tenant-primary', color);
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    try {
      const dto: UpdateBrandingDto = { displayName, primaryColor, welcomeMessage };
      const res = await api.put<ApiResponse<Tenant>>('/settings/branding', dto);
      updateTenant(res.data);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      setShowBranding(false);
    } catch (err) {
      // Revert color on error
      const prev = tenant?.branding?.primaryColor || '#6C5CE7';
      document.documentElement.style.setProperty('--tenant-primary', prev);
      setPrimaryColor(prev);
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      getTelegram()?.showAlert?.(
        intl.formatMessage({ id: 'common.error' }) +
          ': ' +
          (err instanceof Error ? err.message : 'Unknown error'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'master.settings' })} />

      <Card padding="none" className={styles.cardGroup}>
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

      <Card padding="none" className={styles.cardGroup}>
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

      <Card padding="none" className={styles.cardGroup}>
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
        <FormGroup>
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
            <label className={styles.colorLabel}>
              {intl.formatMessage({ id: 'settings.primaryColor' })}
            </label>
            <div className={styles.colorGrid}>
              {colorPresets.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    handleColorChange(color);
                    getTelegram()?.HapticFeedback.impactOccurred('light');
                  }}
                  className={styles.colorSwatch}
                  data-active={primaryColor === color}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className={styles.customColorRow}>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className={styles.colorPicker}
              />
              <span className={styles.colorValue}>{primaryColor}</span>
            </div>
          </div>
          <Button fullWidth loading={saving} onClick={handleSaveBranding}>
            {intl.formatMessage({ id: 'common.save' })}
          </Button>
        </FormGroup>
      </BottomSheet>
    </div>
  );
}
