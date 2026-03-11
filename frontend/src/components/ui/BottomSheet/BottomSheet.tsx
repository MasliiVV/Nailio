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
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

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
