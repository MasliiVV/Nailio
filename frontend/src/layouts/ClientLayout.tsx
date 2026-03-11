import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Home, ClipboardList, User } from 'lucide-react';
import styles from './ClientLayout.module.css';
import { getTelegram } from '@/lib/telegram';
import { type ReactNode, useEffect } from 'react';

const ICON_SIZE = 20;

const NAV_ITEMS: { path: string; icon: ReactNode; labelKey: string }[] = [
  { path: '/client', icon: <Home size={ICON_SIZE} />, labelKey: 'booking.title' },
  { path: '/client/bookings', icon: <ClipboardList size={ICON_SIZE} />, labelKey: 'client.myBookings' },
  { path: '/client/profile', icon: <User size={ICON_SIZE} />, labelKey: 'client.profile' },
];

export function ClientLayout() {
  const intl = useIntl();
  const location = useLocation();

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    const isSubPage = location.pathname.split('/').length > 3;
    if (isSubPage) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }, [location.pathname]);

  return (
    <div className={styles.layout}>
      <main className={styles.content}>
        <Outlet />
      </main>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/client'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
            onClick={() => {
              getTelegram()?.HapticFeedback.selectionChanged();
            }}
          >
            <div className={styles.navIcon}>{item.icon}</div>
            <span className={styles.navLabel}>
              {intl.formatMessage({ id: item.labelKey })}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
