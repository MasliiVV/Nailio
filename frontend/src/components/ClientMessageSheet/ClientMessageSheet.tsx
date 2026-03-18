import { useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { CheckCircle, Send, Wand2 } from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { useSendClientMessage } from '@/hooks';
import { useGenerateRebookingMessage, useRebookingOverview } from '@/hooks/useRebooking';
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
  const [tone, setTone] = useState<'soft' | 'friendly'>('friendly');
  const [topic, setTopic] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useSendClientMessage(clientId);
  const { data: rebookingOverview } = useRebookingOverview();
  const generatePromoMessage = useGenerateRebookingMessage();

  const titleId = mode === 'promo' ? 'clients.reminderPromoTitle' : 'clients.messageClientTitle';
  const placeholderId =
    mode === 'promo' ? 'clients.reminderPromoPlaceholder' : 'clients.messageClientPlaceholder';
  const successId = mode === 'promo' ? 'clients.reminderPromoSent' : 'clients.messageClientSent';

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
        setTone('friendly');
        setTopic('');
        sendMessage.reset();
        generatePromoMessage.reset();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [generatePromoMessage, open, sendMessage]);

  const promoSlotOptions = useMemo(
    () =>
      (rebookingOverview?.emptySlots || []).slice(0, 3).map((slot) => ({
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    [rebookingOverview?.emptySlots],
  );

  const focusTextareaToEnd = () => {
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      const cursorPosition = textarea.value.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
  };

  const handleGeneratePromoMessage = async () => {
    if (mode !== 'promo') return;

    const fallbackDate = new Date().toLocaleDateString('en-CA');
    const firstSlot = promoSlotOptions[0];

    try {
      const response = await generatePromoMessage.mutateAsync({
        campaignType: 'cycle_followup',
        clientIds: [clientId],
        date: rebookingOverview?.selectedDate || firstSlot?.date || fallbackDate,
        startTime: firstSlot?.startTime || '09:00',
        endTime: firstSlot?.endTime || '09:30',
        tone,
        extraInstructions: topic.trim() || undefined,
        slotOptions: promoSlotOptions.length > 0 ? promoSlotOptions : undefined,
      });
      setMessage((previous) => {
        const trimmedPrevious = previous.trim();
        const trimmedNext = response.message.trim();
        if (!trimmedPrevious) {
          return trimmedNext;
        }

        return `${trimmedPrevious}\n\n${trimmedNext}`;
      });
      focusTextareaToEnd();
    } catch {
      // Error state is shown in UI
    }
  };

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
          {mode === 'promo' && (
            <>
              <div className={styles.helperText}>
                {intl.formatMessage({ id: 'clients.aiPromoHint' })}
              </div>
              <textarea
                className={`${styles.textarea} ${styles.topicTextarea}`}
                placeholder={intl.formatMessage({ id: 'clients.aiPromoTopicPlaceholder' })}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={300}
                rows={3}
              />
              <div className={styles.toneRow}>
                <Button
                  size="sm"
                  variant={tone === 'soft' ? 'primary' : 'secondary'}
                  onClick={() => setTone('soft')}
                >
                  {intl.formatMessage({ id: 'rebooking.toneSoft' })}
                </Button>
                <Button
                  size="sm"
                  variant={tone === 'friendly' ? 'primary' : 'secondary'}
                  onClick={() => setTone('friendly')}
                >
                  {intl.formatMessage({ id: 'rebooking.toneFriendly' })}
                </Button>
              </div>
              <Button
                variant="ghost"
                fullWidth
                loading={generatePromoMessage.isPending}
                disabled={!topic.trim()}
                onClick={handleGeneratePromoMessage}
                icon={<Wand2 size={18} />}
              >
                {intl.formatMessage({
                  id: message.trim() ? 'clients.aiPromoRegenerate' : 'clients.aiPromoGenerate',
                })}
              </Button>
            </>
          )}
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
          {generatePromoMessage.isError && mode === 'promo' && (
            <span className={styles.errorText}>
              {intl.formatMessage({ id: 'clients.aiPromoError' })}
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
