import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';

/** Public room states, with words and a color (never color alone). */
export const ROOM_STATE = {
  AVAILABLE: { label: 'Space Available', dot: 'bg-[#34d399]', cls: 'bg-[#064e3b]/85 text-[#a7f3d0] ring-[#34d399]/40' },
  LIMITED: { label: 'Limited Spaces', dot: 'bg-[#fbbf24]', cls: 'bg-[#4a3407]/85 text-[#fde68a] ring-[#fbbf24]/40' },
  FULL: { label: 'Fully Occupied', dot: 'bg-[#f87171]', cls: 'bg-[#4c1414]/85 text-[#fecaca] ring-[#f87171]/40' },
  UNAVAILABLE: { label: 'Temporarily Unavailable', dot: 'bg-[#94a3b8]', cls: 'bg-[#1e293b]/85 text-[#cbd5e1] ring-[#94a3b8]/40' },
};

export const spaces = (n) => `${n} Space${n === 1 ? '' : 's'} Available`;

/**
 * Loads a public endpoint and keeps it fresh: every 30 seconds and whenever the visitor comes back
 * to the tab, so room availability follows the owner's changes (move-ins, move-outs).
 */
function useLive(url, pick) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(async () => {
    try {
      const res = await api.get(url);
      setState({ data: pick(res.data), error: '', loading: false });
    } catch (e) {
      setState((s) => ({ ...s, error: errorMessage(e, 'Something went wrong. Please try again.'), loading: false }));
    }
    // pick is a stable top-level function in every caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);
  return { ...state, reload: load };
}

const pickHouse = (d) => ({ ...d.house, allowWaitlistInquiries: d.allowWaitlistInquiries });
const pickRooms = (d) => d.rooms;
const pickRoom = (d) => d.room;

export const usePublicHouse = () => useLive('/public/house', pickHouse);
export const usePublicRooms = () => useLive('/public/rooms', pickRooms);
export const usePublicRoom = (id) => useLive(`/public/rooms/${id}`, pickRoom);
