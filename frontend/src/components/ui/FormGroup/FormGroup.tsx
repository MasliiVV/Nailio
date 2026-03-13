import type { ReactNode } from 'react';
import styles from './FormGroup.module.css';

interface FormGroupProps {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg';
}

export function FormGroup({ children, gap = 'md' }: FormGroupProps) {
  return <div className={`${styles.group} ${styles[gap]}`}>{children}</div>;
}
