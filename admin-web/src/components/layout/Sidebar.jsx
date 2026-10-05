import { Link, NavLink } from 'react-router-dom';
import { BedDouble, Building2, FileChartColumn, History, LayoutDashboard, LogOut, Megaphone, MessageSquareText, Receipt, Settings, Users, Wallet, Zap } from 'lucide-react';
import { cx } from '../ui';
import { fileUrl } from '../../api/client';

/** Menu order (unchanged); `group` only adds section labels in the sidebar. */
export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, primary: true, group: 'Overview' },
  { to: '/rooms', label: 'Rooms', icon: BedDouble, group: 'Property' },
  { to: '/tenants', label: 'Tenants', icon: Users, primary: true, group: 'Property' },
  { to: '/bills', label: 'Bills', icon: Receipt, primary: true, group: 'Money' },
  { to: '/payments', label: 'Payments', icon: Wallet, badge: 'pending', primary: true, group: 'Money' },
  { to: '/electricity', label: 'Electricity', icon: Zap, group: 'Money' },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, group: 'Communication' },
  { to: '/reports', label: 'Reports', icon: FileChartColumn, group: 'Records' },
  { to: '/inquiries', label: 'Inquiries', icon: MessageSquareText, badge: 'inquiries', group: 'Records' },
  { to: '/activity', label: 'Activity History', icon: History, group: 'Records' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const GROUPS = [...new Set(NAV.filter((n) => n.group).map((n) => n.group))];

/**
 * Left navigation, grouped into short sections. The current page is clearly highlighted.
 * In the phone drawer (`inDrawer`), pages already on the bottom tab bar are hidden below md.
 */
export default function Sidebar({ houseName, logoUrl, pendingCount, newInquiries = 0, onNavigate, onSignOut, inDrawer }) {
  const item = (n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
          inDrawer && n.primary && 'max-md:hidden',
          isActive ? 'bg-[#fff] text-[#0a1430] shadow-sm' : 'text-slate-700 hover:bg-panel/[0.07] hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cx(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-navy-700 text-white' : 'bg-panel/[0.06] text-slate-600 group-hover:text-white'
            )}
          >
            <n.icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="flex-1">{n.label}</span>
          {n.badge === 'pending' && pendingCount > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900 shadow-sm" aria-label={`${pendingCount} waiting for verification`}>
              {pendingCount}
            </span>
          )}
          {n.badge === 'inquiries' && newInquiries > 0 && (
            <span className="rounded-full bg-[#2f6bff] px-2 py-0.5 text-xs font-bold text-white shadow-sm" aria-label={`${newInquiries} new`}>
              {newInquiries}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#0b1736] to-navy-950 text-slate-700">
      <Link to="/" onClick={onNavigate} className={cx('mx-3 mt-3 mb-2 flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-panel/[0.05]', inDrawer && 'mr-14')}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#fff] text-[#0a1430] shadow-md ring-1 ring-white/20">
          {logoUrl ? <img src={fileUrl(logoUrl)} alt="" className="h-full w-full bg-[#fff] object-contain" /> : <Building2 className="h-5 w-5" aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm leading-snug font-bold text-white">{houseName || 'My Boarding House'}</span>
          <span className="block text-xs text-navy-300">Owner&apos;s portal</span>
        </span>
      </Link>
      <nav className="pb-safe flex-1 overflow-y-auto px-3 pt-1" aria-label={inDrawer ? 'More pages' : 'Main menu'}>
        {GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g);
          const allOnTabBar = inDrawer && items.every((n) => n.primary);
          return (
            <div key={g} className={cx('mb-3', allOnTabBar && 'max-md:hidden')}>
              <p className="px-3 pt-1 pb-1.5 text-xs font-semibold tracking-wider text-navy-300 uppercase">{g}</p>
              <div className="space-y-0.5">{items.map(item)}</div>
            </div>
          );
        })}
        <div className="mt-2 space-y-0.5 border-t border-white/10 pt-3 pb-4">
          {NAV.filter((n) => !n.group).map(item)}
          <button
            type="button"
            onClick={onSignOut}
            className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-700 transition-colors hover:bg-red-500/15 hover:text-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel/[0.06] text-slate-600 group-hover:text-red-300">
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
