import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api, apiOrigin } from '../api/client';
import { auth } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

/** The owner's notifications, live over Socket.IO with a slow polling fallback. */
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [pendingSignal, setPendingSignal] = useState(0);
  const [inquirySignal, setInquirySignal] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: 20 } });
      setItems(res.data.items);
      setUnread(res.data.unread);
    } catch {
      /* polling will retry */
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    load();
    const poll = setInterval(load, 120000);
    const socket = io(apiOrigin, {
      path: '/socket.io',
      auth: (cb) => (auth.currentUser ? auth.currentUser.getIdToken().then((token) => cb({ token })) : cb({})),
      transports: ['websocket', 'polling'],
    });
    socket.on('notification', (n) => {
      setItems((list) => [n, ...list].slice(0, 20));
      setUnread((u) => u + 1);
      toast.info(n.title);
    });
    socket.on('payment:pending', () => setPendingSignal((x) => x + 1));
    socket.on('inquiry:new', () => setInquirySignal((x) => x + 1));
    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [user, load, toast]);

  const markRead = useCallback(async (id) => {
    await api.post(`/notifications/${id}/read`);
    setItems((list) => list.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }, []);

  /** Remove one notification (the ✕). Hidden right away; restored if the server refuses. */
  const remove = useCallback(
    async (n) => {
      setItems((list) => list.filter((x) => x._id !== n._id));
      if (!n.readAt) setUnread((u) => Math.max(0, u - 1));
      try {
        await api.delete(`/notifications/${n._id}`);
      } catch {
        load();
      }
    },
    [load]
  );

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnread(0);
  }, []);

  const value = useMemo(() => ({ items, unread, reload: load, markRead, markAllRead, remove, pendingSignal, inquirySignal }), [items, unread, load, markRead, markAllRead, remove, pendingSignal, inquirySignal]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
