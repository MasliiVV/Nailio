import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return ((parts[0][0] ?? '') + (parts[1][0] ?? '')).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getColor(name: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? '#85C1E9';
}

export function Avatar({ name, photoUrl, size = 'md', className = '' }: AvatarProps) {
  if (photoUrl) {
    return (
      <div className={`${styles.avatar} ${styles[size]} ${className}`}>
        <img src={photoUrl} alt={name} className={styles.img} />
      </div>
    );
  }

  return (
    <div
      className={`${styles.avatar} ${styles[size]} ${className}`}
      style={{ backgroundColor: getColor(name) }}
    >
      <span className={styles.initials}>{getInitials(name)}</span>
    </div>
  );
}
