import { useState, useEffect, useCallback, useRef } from 'react';
import { useIntl } from 'react-intl';
import { Check, Camera, Trash2, Upload } from 'lucide-react';
import { useAuth, useSettings, useUpdateBranding, useUploadLogo, useDeleteLogo } from '@/hooks';
import { Button, Input, Card, PageHeader } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { getTelegram } from '@/lib/telegram';
import styles from './BrandingPage.module.css';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function BrandingPage() {
  const intl = useIntl();
  const { tenant, updateTenant } = useAuth();
  const { data: settings } = useSettings();
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadLogo();
  const deleteLogo = useDeleteLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [fileError, setFileError] = useState('');

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

  /** Sync auth context after any logo/branding change */
  const syncTenant = useCallback(
    (result: { displayName: string; logoUrl: string | null; branding: unknown }) => {
      if (tenant) {
        updateTenant({
          ...tenant,
          displayName: result.displayName,
          logoUrl: result.logoUrl,
          branding: result.branding as import('@/types').TenantBranding | null,
        });
      }
    },
    [tenant, updateTenant],
  );

  /** Open native file picker */
  const handleLogoTap = () => {
    setFileError('');
    fileInputRef.current?.click();
  };

  /** Handle file selection — validate + upload immediately */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected
    e.target.value = '';

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError(intl.formatMessage({ id: 'branding.upload.invalidType' }));
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError(intl.formatMessage({ id: 'branding.upload.tooLarge' }));
      getTelegram()?.HapticFeedback.notificationOccurred('error');
      return;
    }

    setFileError('');
    getTelegram()?.HapticFeedback.impactOccurred('medium');

    try {
      const result = await uploadLogo.mutateAsync(file);
      setLogoUrl(result.logoUrl || '');
      syncTenant(result);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setFileError(
        error instanceof ApiRequestError
          ? error.message
          : intl.formatMessage({ id: 'branding.upload.failed' }),
      );
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  /** Remove logo */
  const handleRemoveLogo = async () => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      const result = await deleteLogo.mutateAsync();
      setLogoUrl('');
      setFileError('');
      syncTenant(result);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setFileError(
        error instanceof ApiRequestError
          ? error.message
          : intl.formatMessage({ id: 'branding.upload.failed' }),
      );
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  /** Save display name + welcome message */
  const handleSave = async () => {
    getTelegram()?.HapticFeedback.impactOccurred('medium');
    try {
      const result = await updateBranding.mutateAsync({
        displayName: displayName.trim() || undefined,
        welcomeMessage: welcomeMessage.trim() || undefined,
      });
      syncTenant(result);
      setIsDirty(false);
      getTelegram()?.HapticFeedback.notificationOccurred('success');
    } catch {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    }
  };

  const isUploading = uploadLogo.isPending;
  const isDeleting = deleteLogo.isPending;
  const hasLogo = !!logoUrl.trim();

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'settings.branding' })} />

      <div className={styles.form}>
        {/* ── Logo upload section ── */}
        <Card className={styles.logoSection}>
          <div className={styles.logoHeader}>
            <Camera size={20} />
            <span className={styles.logoLabel}>
              {intl.formatMessage({ id: 'branding.logoUrl' })}
            </span>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className={styles.fileInput}
          />

          {/* Tappable preview area — like Telegram avatar picker */}
          <button
            type="button"
            className={styles.logoPreview}
            onClick={handleLogoTap}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className={styles.logoSpinner}>
                <span className="spinner" />
              </div>
            ) : hasLogo ? (
              <>
                <img
                  src={logoUrl}
                  alt="Logo"
                  className={styles.logoImage}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className={styles.logoOverlay}>
                  <Camera size={20} />
                </div>
              </>
            ) : (
              <div className={styles.logoPlaceholder}>
                <Upload size={28} />
                <span>{intl.formatMessage({ id: 'branding.upload.tap' })}</span>
              </div>
            )}
          </button>

          <p className={styles.logoHint}>{intl.formatMessage({ id: 'branding.upload.hint' })}</p>
          <p className={styles.syncNote}>
            {intl.formatMessage({ id: 'branding.upload.syncNote' })}
          </p>

          {fileError && <p className={styles.fileError}>{fileError}</p>}

          {hasLogo && (
            <button className={styles.clearBtn} onClick={handleRemoveLogo} disabled={isDeleting}>
              {isDeleting ? <span className="spinner spinner-sm" /> : <Trash2 size={16} />}
              {intl.formatMessage({ id: 'branding.removeLogo' })}
            </button>
          )}
        </Card>

        {/* ── Display name & welcome ── */}
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

        {/* Save button (for name + welcome, logo is saved immediately on upload) */}
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
