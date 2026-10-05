/**
 * Browser tab icon = the boarding house logo saved in Settings (falls back to the house icon).
 * Also updates the iPhone home-screen icon used by "Add to Home Screen".
 */
export function applyFavicon(url) {
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) {
    if (url) icon.removeAttribute('type');
    else icon.setAttribute('type', 'image/svg+xml');
    icon.setAttribute('href', url || '/favicon.svg');
  }
  const touch = document.querySelector('link[rel="apple-touch-icon"]');
  if (touch) touch.setAttribute('href', url || '/apple-touch-icon.png');
}
