import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { CheckCircle, Send } from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { useSendClientMessage } from '@/hooks';
import styles from '@/components/MessageSheet/MessageSheet.module.css';

interface ClientMessageSheetProps {
  clientId: string;
  mode: 'telegram' | 'promo';
  open: boolean;
  onClose: () => void;
}

export function ClientMessageSheet({ clientId, mode, open, onClose }: ClientMessageSheetProps) {
  const intl = useIntl();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendClientMessage(clientId);

  const titleId = mode === 'promo' ? 'clients.reminderPromoTitle' : 'clients.messageClientTitle';
  const placeholderId =
    mode === 'promo' ? 'clients.reminderPromoPlaceholder' : 'clients.messageClientPlaceholder';
  const successId =
    mode === 'promo' ? 'clients.reminderPromoSent' : 'clients.messageClientSent';

  useEffect(() => {
    if (open && !sent) {
      setTimeout(() => textareaRef.current?.focus(), 400);
    }
  }, [open, sent]);

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setMessage('');
        setSent(false);
        sendMessage.reset();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, sendMessage]);

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage.mutateAsync({
        message: message.trim(),
      });
      setSent(true);
      setTimeout(() => onClose(), 1500);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={intl.formatMessage({ id: titleId })}>
      {sent ? (
        <div className={styles.successMessage}>
          <div className={styles.successIcon}>
            <CheckCircle size={28} />
          </div>
          <span className={styles.successText}>{intl.formatMessage({ id: successId })}</span>
        </div>
      ) : (
        <div className={styles.form}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={intl.formatMessage({ id: placeholderId })}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={4}
          />
          {sendMessage.isError && (
            <span className={styles.errorText}>
              {intl.formatMessage({ id: 'client.messageError' })}
            </span>
          )}
          <Button
            variant="primary"
            fullWidth
            loading={sendMessage.isPending}
            disabled={!message.trim()}
            onClick={handleSend}
            icon={<Send size={18} />}
          >
            {intl.formatMessage({ id: 'client.messageSend' })}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}