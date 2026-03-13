import styles from './Toggle.module.css';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label className={`${styles.toggle} ${disabled ? styles.disabled : ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.track}>
        <input
          type="checkbox"
          className={styles.input}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className={`${styles.slider} ${checked ? styles.active : ''}`} />
      </div>
    </label>
  );
}
