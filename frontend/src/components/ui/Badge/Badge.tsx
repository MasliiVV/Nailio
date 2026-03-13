import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'destructive' | 'secondary';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = 'primary', className = '' }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${className}`}>{children}</span>
  );
}
