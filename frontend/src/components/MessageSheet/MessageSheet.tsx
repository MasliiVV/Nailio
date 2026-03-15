import { useState, useRef, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Send, CheckCircle } from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { useSendMessageToMaster } from '@/hooks';
import styles from './MessageSheet.module.css';

interface MessageSheetProps {
  open: boolean;
  onClose: () => void;
  bookingId?: string;
}

export function MessageSheet({ open, onClose, bookingId }: MessageSheetProps) {
  const intl = useIntl();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendMessageToMaster();

  // Focus textarea when sheet opens
  useEffect(() => {
    if (open && !sent) {
      setTimeout(() => textareaRef.current?.focus(), 400);
    }
  }, [open, sent]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setMessage('');
        setSent(false);
        sendMessage.reset();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSend = async () => {
    if (!message.trim()) return;

    try {
      await sendMessage.mutateAsync({
        message: message.trim(),
        bookingId,
      });
      setSent(true);
      // Auto-close after success
      setTimeout(() => onClose(), 1500);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={intl.formatMessage({ id: 'client.messageTitle' })}
    >
      {sent ? (
        <div className={styles.successMessage}>
          <div className={styles.successIcon}>
            <CheckCircle size={28} />
          </div>
          <span className={styles.successText}>
            {intl.formatMessage({ id: 'client.messageSent' })}
          </span>
        </div>
      ) : (
        <div className={styles.form}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder={intl.formatMessage({ id: 'client.messagePlaceholder' })}
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
