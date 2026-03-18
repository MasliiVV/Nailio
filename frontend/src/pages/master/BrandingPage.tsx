import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { Check, Image, Trash2 } from 'lucide-react';
import { useAuth, useSettings, useUpdateBranding } from '@/hooks';
import { Button, Input, Card, PageHeader } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import styles from './BrandingPage.module.css';

export function BrandingPage() {
  const intl = useIntl();
  const { tenant, updateTenant } = useAuth();
  const { data: settings } = useSettings();
  const updateBranding = useUpdateBranding();

  const [displayName, setDisplayName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Populate from server data
  useEffect(() => {
    if (settings) {
      setDisplayName(settings.displayName || tenant?.displayName || '');
      setWelcomeMessage(settings.branding?.welcomeMessage || '');
      setLogoUrl(settings.logoUrl || '');
    } else if (tenant) {
      setDisplayName(tenant.displayName || '');
      setWelcomeMessage(tenant.branding?.welcomeMessage || '');
      setLogoUrl(tenant.logoUrl || '');
    }
  }, [settings, tenant]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const handleSave = async () => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      const result = await updateBranding.mutateAsync({
        displayName: displayName.trim() || undefined,
        welcomeMessage: welcomeMessage.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });

      // Update auth context so client app sees changes immediately
      if (tenant) {
        updateTenant({
          ...tenant,
          displayName: result.displayName,
          logoUrl: result.logoUrl,
          branding: result.branding as import('@/types').TenantBranding | null,
        });
      }

      setIsDirty(false);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const handleClearLogo = () => {
    setLogoUrl('');
    setIsDirty(true);
  };

  const logoPreviewUrl = logoUrl.trim();

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'settings.branding' })} />

      <div className={styles.form}>
        {/* Logo section */}
        <Card className={styles.logoSection}>
          <div className={styles.logoHeader}>
            <Image size={20} />
            <span className={styles.logoLabel}>
              {intl.formatMessage({ id: 'branding.logoUrl' })}
            </span>
          </div>

          {/* Logo preview */}
          <div className={styles.logoPreview}>
            {logoPreviewUrl ? (
              <img
                src={logoPreviewUrl}
                alt="Logo"
                className={styles.logoImage}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Image size={32} />
                <span>{intl.formatMessage({ id: 'branding.noLogo' })}</span>
              </div>
            )}
          </div>

          <Input
            placeholder={intl.formatMessage({ id: 'branding.logoUrlPlaceholder' })}
            value={logoUrl}
            onChange={(e) => {
              setLogoUrl(e.target.value);
              markDirty();
            }}
            hint={intl.formatMessage({ id: 'branding.logoUrlHint' })}
          />

          {logoPreviewUrl && (
            <button className={styles.clearBtn} onClick={handleClearLogo}>
              <Trash2 size={16} />
              {intl.formatMessage({ id: 'branding.removeLogo' })}
            </button>
          )}
        </Card>

        {/* Display name & welcome */}
        <Card className={styles.fieldsCard}>
          <Input
            label={intl.formatMessage({ id: 'settings.displayName' })}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              markDirty();
            }}
            placeholder={intl.formatMessage({ id: 'branding.displayNamePlaceholder' })}
          />

          <div className={styles.textareaWrapper}>
            <label className={styles.textareaLabel}>
              {intl.formatMessage({ id: 'settings.welcomeMessage' })}
            </label>
            <textarea
              className={styles.textarea}
              value={welcomeMessage}
              onChange={(e) => {
                setWelcomeMessage(e.target.value);
                markDirty();
              }}
              placeholder={intl.formatMessage({ id: 'branding.welcomePlaceholder' })}
              rows={3}
            />
          </div>
        </Card>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateBranding.isPending}
          className={styles.saveBtn}
        >
          {updateBranding.isPending ? <span className="spinner spinner-sm" /> : <Check size={18} />}
          {intl.formatMessage({ id: 'common.save' })}
        </Button>

        {updateBranding.isSuccess && !isDirty && (
          <p className={styles.successMsg}>✓ {intl.formatMessage({ id: 'branding.saved' })}</p>
        )}
      </div>
    </div>
  );
}
