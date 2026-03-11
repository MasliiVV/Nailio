import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, onClick, className = '', style, padding = 'md' }: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={[
        styles.card,
        styles[`padding-${padding}`],
        onClick ? styles.clickable : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      style={style}
    >
      {children}
    </Component>
  );
}

interface CardRowProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
}

export function CardRow({ icon, title, subtitle, right, onClick }: CardRowProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component className={`${styles.row} ${onClick ? styles.clickable : ''}`} onClick={onClick}>
      {icon && <span className={styles.rowIcon}>{icon}</span>}
      <div className={styles.rowContent}>
        <span className={styles.rowTitle}>{title}</span>
        {subtitle && <span className={styles.rowSubtitle}>{subtitle}</span>}
      </div>
      {right && <div className={styles.rowRight}>{right}</div>}
      {onClick && <span className={styles.chevron}>›</span>}
    </Component>
  );
}
