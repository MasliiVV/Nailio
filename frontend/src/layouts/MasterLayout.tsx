import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Calendar, Users, Sparkles, Settings } from 'lucide-react';
import styles from './MasterLayout.module.css';
import { getTelegram } from '@/lib/telegram';
import { type ReactNode, useEffect } from 'react';
import { prefetchMasterInsights } from '@/lib/prefetch';

const ICON_SIZE = 20;

const NAV_ITEMS: { path: string; icon: ReactNode; labelKey: string }[] = [
  { path: '/master', icon: <Calendar size={ICON_SIZE} />, labelKey: 'master.calendar' },
  { path: '/master/clients', icon: <Users size={ICON_SIZE} />, labelKey: 'master.clients' },
  { path: '/master/rebooking', icon: <Sparkles size={ICON_SIZE} />, labelKey: 'master.rebooking' },
  { path: '/master/settings', icon: <Settings size={ICON_SIZE} />, labelKey: 'master.settings' },
];

export function MasterLayout() {
  const intl = useIntl();
  const location = useLocation();

  const handleIntentPrefetch = (path: string) => {
    if (path === '/master/finance' || path === '/master/settings') {
      prefetchMasterInsights();
    }
  };

  // Show/hide Telegram BackButton based on route depth
  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    tg.BackButton.show();

    return () => {
      tg.BackButton.hide();
    };
  }, [location.pathname]);

  return (
    <div className={styles.layout}>
      <>
        <main className={styles.content}>
          <Outlet />
        </main>

        <div className={styles.navWrap}>
          <nav className={styles.nav}>
            <>
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/master'}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                  onMouseEnter={() => handleIntentPrefetch(item.path)}
                  onFocus={() => handleIntentPrefetch(item.path)}
                  onTouchStart={() => handleIntentPrefetch(item.path)}
                  onClick={() => {
                    getTelegram()?.HapticFeedback.selectionChanged();
                  }}
                >
                  <>
                    <div className={styles.navIcon}>{item.icon}</div>
                    <span className={styles.navLabel}>
                      {intl.formatMessage({ id: item.labelKey })}
                    </span>
                  </>
                </NavLink>
              ))}
            </>
          </nav>
        </div>
      </>
    </div>
  );
}
