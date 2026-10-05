import { useCallback, useState } from 'react';
import { errorMessage } from '../api/client';
import { useToast } from '../context/ToastContext';

const UNDO_MS = 5000;

/**
 * Delete with Undo: the item disappears right away, a toast offers "Undo" for 5 seconds,
 * and only then is `run()` (the real API call) made. Undo simply cancels it.
 * Returns { hidden, isHidden, remove(id, message, run) }.
 */
export function useUndoableRemove() {
  const toast = useToast();
  const [hidden, setHidden] = useState([]);
  const unhide = useCallback((id) => setHidden((h) => h.filter((x) => x !== id)), []);

  const remove = useCallback(
    (id, message, run) => {
      setHidden((h) => [...h, id]);
      let cancelled = false;
      const timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          await run();
        } catch (e) {
          unhide(id);
          toast.error(errorMessage(e));
        }
      }, UNDO_MS);
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            cancelled = true;
            clearTimeout(timer);
            unhide(id);
          },
        },
      });
    },
    [toast, unhide]
  );

  return { hidden, isHidden: (id) => hidden.includes(id), remove };
}
