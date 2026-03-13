import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface SectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  spacing?: 'sm' | 'md' | 'lg';
}

export function Section({ title, action, children, spacing = 'md' }: SectionProps) {
  return (
    <section className={`${styles.section} ${styles[spacing]}`}>
      {(title || action) && (
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action && <div className={styles.action}>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
