import { type ReactNode } from 'react';
import styles from './Tabs.module.css';
import { getTelegram } from '@/lib/telegram';

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeId, onChange }: TabsProps) {
  const handleClick = (id: string) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    onChange(id);
  };

  return (
    <div className={styles.tabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeId ? styles.active : ''}`}
          onClick={() => handleClick(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabContentProps {
  children: ReactNode;
}

export function TabContent({ children }: TabContentProps) {
  return <div className={styles.content}>{children}</div>;
}
