import type { ReactNode } from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  value: string | number;
  label: string;
  icon?: ReactNode;
  trend?: 'up' | 'down';
}

export function StatCard({ value, label, icon, trend }: StatCardProps) {
  return (
    <div className={styles.card}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={`${styles.value} ${trend ? styles[trend] : ''}`}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}

interface StatGridProps {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}

export function StatGrid({ columns = 2, children }: StatGridProps) {
  return <div className={`${styles.grid} ${styles[`cols${columns}`]}`}>{children}</div>;
}
