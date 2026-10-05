import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useApi } from '../../hooks/useApi';
import { fileUrl } from '../../api/client';
import { applyFavicon } from '../../lib/favicon';
import { ConfirmDialog, PageSkeleton } from '../ui';
import ErrorBoundary from '../ErrorBoundary';
import NotificationPanel from '../NotificationPanel';
import BottomNav from './BottomNav';
import Sidebar, { NAV } from './Sidebar';

/** Detail screens: phone title + where the back arrow goes when there is no history. */
const DETAIL = [
  { re: /^\/rooms\/[^/]+/, title: 'Room', parent: '/rooms' },
  { re: /^\/tenants\/[^/]+/, title: 'Tenant', parent: '/tenants' },
  { re: /^\/bills\/[^/]+/, title: 'Bill', parent: '/bills' },
];

/** Settings groups opened on phones (?s=…), mirrors GROUPS in SettingsPage. */
const SETTINGS_TITLES = { general: 'General', billing: 'Billing & payments', notifications: 'Notifications', account: 'Account & security' };

function screenFor(pathname, search) {
  const group = pathname === '/settings' && SETTINGS_TITLES[new URLSearchParams(search).get('s')];
  if (group) return { title: group, parent: '/settings' };
  const detail = DETAIL.find((d) => d.re.test(pathname));
  if (detail) return detail;
  const nav = NAV.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return { title: nav?.label || '' };
}

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'O';
const today = () => new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Top bar.
 * Phones: back arrow on detail screens + the page title. Tablets: menu button. Desktop: unchanged.
 */
function Header({ onMenu, user, screen }) {
  const navigate = useNavigate();
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(screen.parent));
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-white/[0.06] bg-[#050a18]/75 px-2 backdrop-blur-xl sm:px-4 md:h-16 md:gap-3 md:px-6">
      {screen.parent && (
        <button type="button" onClick={back} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      <button type="button" className="-ml-2 hidden h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 md:inline-flex lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <p className={`min-w-0 flex-1 truncate text-lg font-bold text-slate-900 md:hidden ${screen.parent ? '' : 'pl-2'}`}>{screen.title}</p>
      <p className="hidden flex-1 text-sm font-medium text-slate-500 md:block">{today()}</p>
      <NotificationPanel />
      <div className="hidden items-center gap-3 border-l border-slate-200 pl-3 sm:flex">
        <div className="text-right">
          <p className="max-w-48 truncate text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="text-xs text-slate-500">Owner</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-600 to-navy-800 text-sm font-bold text-white shadow-sm ring-2 ring-white" aria-hidden>
          {initials(user?.name)}
        </span>
      </div>
    </header>
  );
}

/** Slide-in menu for phones ("More") and tablets. Closes on backdrop tap, the close button or Escape. */
function Drawer({ open, onClose, sidebarProps }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
        <Sidebar {...sidebarProps} inDrawer onNavigate={onClose} />
        <button ref={closeRef} type="button" onClick={onClose} className="absolute top-3 right-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-800 hover:bg-navy-800" aria-label="Close menu">
          <X className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pendingSignal, inquirySignal } = useNotifications();
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const location = useLocation();
  const pending = useApi('/payments', { status: 'PENDING_VERIFICATION', limit: 1 });
  const settings = useApi('/settings');
  const inquiries = useApi('/inquiries/new-count');
  const reloadInquiries = inquiries.reload;
  useEffect(() => {
    reloadInquiries();
  }, [inquirySignal, location.pathname, reloadInquiries]);
  useEffect(() => {
    window.addEventListener('inquiries:changed', reloadInquiries);
    return () => window.removeEventListener('inquiries:changed', reloadInquiries);
  }, [reloadInquiries]);
  const { reload } = pending;

  useEffect(() => {
    reload();
  }, [pendingSignal, location.pathname, reload]);
  useEffect(() => setDrawer(false), [location.pathname]);
  const reloadSettings = settings.reload;
  useEffect(() => {
    window.addEventListener('settings:changed', reloadSettings);
    return () => window.removeEventListener('settings:changed', reloadSettings);
  }, [reloadSettings]);
  useEffect(() => {
    window.addEventListener('payments:changed', reload);
    return () => window.removeEventListener('payments:changed', reload);
  }, [reload]);

  const pendingCount = pending.data?.pendingCount || 0;
  const sidebarProps = {
    houseName: settings.data?.settings?.houseName,
    logoUrl: settings.data?.settings?.logoUrl,
    pendingCount,
    newInquiries: inquiries.data?.count || 0,
    onSignOut: () => {
      setDrawer(false);
      setConfirmSignOut(true);
    },
  };
  const screen = screenFor(location.pathname, location.search);
  const logoUrl = settings.data?.settings?.logoUrl;
  useEffect(() => {
    if (settings.data) applyFavicon(logoUrl ? fileUrl(logoUrl) : null);
  }, [logoUrl, settings.data]);
  useEffect(() => {
    const house = settings.data?.settings?.houseName;
    document.title = [screen.title, house || 'Boarding House Admin'].filter(Boolean).join(' · ');
  }, [screen.title, settings.data]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar {...sidebarProps} />
      </aside>
      <Drawer open={drawer} onClose={closeDrawer} sidebarProps={sidebarProps} />
      <div className="lg:pl-64">
        <Header onMenu={() => setDrawer(true)} user={user} screen={screen} />
        <main id="main" className="mx-auto max-w-7xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 md:pb-6 lg:py-8">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <div key={location.pathname} className="animate-page-in">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav pendingCount={pendingCount} newInquiries={inquiries.data?.count || 0} onMore={() => setDrawer(true)} moreOpen={drawer} />
      <ConfirmDialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out?"
        message="You will need your email and password to sign in again."
        confirmLabel="Sign Out"
        onConfirm={() => {
          setConfirmSignOut(false);
          logout();
        }}
      />
    </div>
  );
}
