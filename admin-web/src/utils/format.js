export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
/** ₱3,520.83 */
export const peso = (n) => pesoFmt.format(Number(n || 0));

export function formatDate(d, opts = {}) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', ...opts });
}
/** October 4, 2026 */
export const formatLongDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' }) : '—');
/** Oct 4, 2026 • 2:39 AM */
export function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  return `${formatDate(date)} • ${date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}`;
}
/** Oct 10 */
export const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '—');

export const periodLabel = (year, month) => `${MONTHS[month - 1]} ${year}`;
export const toDateInput = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d));
export function currentPeriod() {
  const [y, m] = toDateInput().split('-').map(Number);
  return { year: y, month: m };
}
export function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return formatDate(d);
}
export function yearOptions(span = 3) {
  const { year } = currentPeriod();
  return Array.from({ length: span * 2 + 1 }, (_, i) => year - span + i);
}

export const METHOD_LABELS = { GCASH: 'GCash', MAYA: 'Maya', BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', OTHER: 'Other' };
export const methodLabel = (method, provider) => (method === 'BANK_TRANSFER' && provider ? `${provider} (bank transfer)` : METHOD_LABELS[method] || 'Other');

export const REJECTION_REASONS = [
  { value: 'INCORRECT_AMOUNT', label: 'Incorrect amount' },
  { value: 'INVALID_REFERENCE', label: 'Invalid reference number' },
  { value: 'UNCLEAR_PROOF', label: 'Payment proof is unclear' },
  { value: 'NOT_VERIFIED', label: 'Payment could not be verified' },
  { value: 'OTHER', label: 'Other' },
];

export const AMENITIES = ['Wi-Fi', 'Bed', 'Cabinet', 'Electric fan', 'Air conditioning', 'Private CR', 'Shared CR', 'Study table'];
export const SHARING_LABELS = {
  EQUAL: 'Split equally between occupants',
  PRORATED: 'Split by days each tenant stayed',
  CUSTOM: 'Custom amount per tenant',
  INDIVIDUAL_METER: 'Each tenant has their own meter',
};

/** "Good morning / afternoon / evening" for the owner's local time. */
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 18 ? 'Good afternoon' : 'Good evening');
