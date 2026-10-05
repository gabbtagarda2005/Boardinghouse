import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CircleCheck, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  error: { icon: CircleX, cls: 'border-red-200 bg-red-50 text-red-800' },
  info: { icon: Info, cls: 'border-navy-200 bg-navy-50 text-navy-300' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  /** opts.action = { label, onClick }, e.g. an Undo button. Toasts with an action stay a little longer. */
  const push = useCallback(
    (type, message, opts = {}) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t.slice(-3), { id, type, message, action: opts.action }]);
      setTimeout(() => dismiss(id), opts.duration || (type === 'error' ? 7000 : opts.action ? 6000 : 4000));
      return id;
    },
    [dismiss]
  );
  const value = useMemo(
    () => ({ success: (m, o) => push('success', m, o), error: (m, o) => push('error', m, o), info: (m, o) => push('info', m, o), dismiss }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[100] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const S = STYLES[t.type];
          return (
            <div key={t.id} role="status" className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${S.cls}`}>
              <S.icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p className="flex-1 self-center">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                  className="-my-2 min-h-11 shrink-0 rounded-lg px-3 font-bold underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" onClick={() => dismiss(t.id)} className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
