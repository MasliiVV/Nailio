import { type ReactNode, useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      document.body.style.overflow = '';
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = '';
    };
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

  return (
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
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}
