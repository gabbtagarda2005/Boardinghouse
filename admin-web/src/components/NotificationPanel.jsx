import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { cx } from './ui';
import { timeAgo } from '../utils/format';

/** Bell with unread count and a dropdown list of the owner's notifications. */
/** Where a notification leads, and the button text for it. */
function actionFor(n) {
  if (n.type === 'tenant_signup') return { to: '/tenants?view=signups', label: 'Review' };
  if (n.type === 'inquiry') return { to: '/inquiries', label: 'View Inquiry' };
  if (n.data?.paymentId) return { to: `/payments?open=${n.data.paymentId}`, label: n.type === 'payment_submitted' || /verification/i.test(n.title) ? 'Review Payment' : 'View Payment' };
  if (n.data?.billId) return { to: `/bills/${n.data.billId}`, label: 'View Bill' };
  return null;
}

export default function NotificationPanel() {
  const { items, unread, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openItem = async (n) => {
    if (!n.readAt) markRead(n._id).catch(() => {});
    setOpen(false);
    const go = actionFor(n);
    if (go) navigate(go.to);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button type="button" className="-my-2 min-h-11 rounded-lg px-2 text-sm font-medium text-navy-300 hover:underline" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[min(24rem,60dvh)] divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">You have no notifications.</li>}
            {items.map((n) => (
              <li key={n._id} className={cx('flex items-start', !n.readAt && 'bg-navy-50/60')}>
                <button type="button" onClick={() => openItem(n)} className="block min-w-0 flex-1 py-3 pl-4 text-left hover:bg-slate-50/70">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-navy-600" aria-label="New" />}
                    {n.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{n.message}</p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    {timeAgo(n.createdAt)}
                    {actionFor(n) && <span className="rounded-full bg-[#2f6bff]/15 px-2.5 py-0.5 font-semibold text-[#8fb0ff]">{actionFor(n).label}</span>}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(n)}
                  className="m-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label={`Remove notification: ${n.title}`}
                  title="Remove"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
