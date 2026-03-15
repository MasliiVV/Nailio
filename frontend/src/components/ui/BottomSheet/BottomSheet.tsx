import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => setAnimating(true));

      // Disable Telegram swipe-to-close while sheet is open
      try {
        window.Telegram?.WebApp?.disableVerticalSwipes();
      } catch { /* ignore */ }
    } else {
      setAnimating(false);
      document.body.style.overflow = '';
      const timer = setTimeout(() => setVisible(false), 300);

      // Re-enable Telegram swipe-to-close
      try {
        window.Telegram?.WebApp?.enableVerticalSwipes();
      } catch { /* ignore */ }

      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = '';
      try {
        window.Telegram?.WebApp?.enableVerticalSwipes();
      } catch { /* ignore */ }
    };
  }, [open]);

  // Prevent body scroll when touching the sheet content
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;

    const handleTouch = (e: TouchEvent) => {
      // Allow scrolling inside content, block propagation to body
      if (el.scrollHeight > el.clientHeight) {
        e.stopPropagation();
      }
    };

    el.addEventListener('touchmove', handleTouch, { passive: true });
    return () => el.removeEventListener('touchmove', handleTouch);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return createPortal(
    <>
      <div
        className={`${styles.backdrop} ${animating ? styles.backdropVisible : ''}`}
        onClick={handleBackdropClick}
      />
      <div className={`${styles.sheet} ${animating ? styles.sheetVisible : ''}`}>
        <div className={styles.handleArea}>
          <div className={styles.handle} />
        </div>
        {title && <h3 className={styles.title}>{title}</h3>}
        <div className={styles.content} ref={contentRef}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
