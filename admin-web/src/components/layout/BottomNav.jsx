import { NavLink, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { cx } from '../ui';
import { NAV } from './Sidebar';

const TABS = NAV.filter((n) => n.primary);
const MORE_PATHS = NAV.filter((n) => !n.primary).map((n) => n.to);

function TabInner({ icon: Icon, label, active, badge }) {
  return (
    <>
      <span className={cx('relative flex h-8 w-full max-w-14 items-center justify-center rounded-full transition-colors', active && 'bg-navy-700 text-white')}>
        <Icon className="h-5 w-5" aria-hidden />
        {badge > 0 && (
          <span className="absolute -top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900" aria-hidden>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1">{label}</span>
    </>
  );
}

const itemCls = (active) =>
  cx('flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold', active ? 'text-white' : 'text-slate-500 hover:text-slate-800');

/** Phone navigation (below md): the four most-used pages plus "More" (opens the menu drawer). */
export default function BottomNav({ pendingCount, newInquiries = 0, onMore, moreOpen }) {
  const { pathname } = useLocation();
  const inMore = MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#071025]/90 backdrop-blur-xl pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur md:hidden" aria-label="Main menu">
      <ul className="grid grid-cols-5">
        {TABS.map((t) => (
          <li key={t.to} className="min-w-0">
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) => itemCls(isActive)}
              aria-label={t.badge === 'pending' && pendingCount > 0 ? `${t.label}, ${pendingCount} waiting for verification` : undefined}
            >
              {({ isActive }) => <TabInner icon={t.icon} label={t.label} active={isActive} badge={t.badge === 'pending' ? pendingCount : 0} />}
            </NavLink>
          </li>
        ))}
        <li className="min-w-0">
          <button type="button" onClick={onMore} className={itemCls(inMore || moreOpen)} aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={inMore ? 'page' : undefined} aria-label={newInquiries > 0 ? `More, ${newInquiries} new inquiries` : undefined}>
            <TabInner icon={Menu} label="More" active={inMore || moreOpen} badge={newInquiries} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
