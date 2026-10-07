/**
 * The one link that the login page's QR code and "Download tenant app" button share.
 * VITE_TENANT_APP_URL is the public address of this portal's /tenant-app page
 * (e.g. https://portal.example.com/tenant-app). When it isn't set, this portal's own /tenant-app is used.
 */
export const TENANT_APP_LINK = (import.meta.env.VITE_TENANT_APP_URL || '').trim() || `${window.location.origin}/tenant-app`;

/** True when the link only works on this computer (a phone scanning it would get nowhere). */
export const linkIsLocalOnly = (url) => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return true;
  }
};

/** 'ios' | 'android' | 'desktop' from the browser's user agent. */
export function detectPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** What kind of download link the owner set: the Play Store, an Android app file (.apk), or a web page. */
export function linkKind(url) {
  if (/play\.google\.com/.test(url || '')) return 'play';
  if (/\.apk([?#]|$)/i.test(url || '') || /github\.com\/[^/]+\/[^/]+\/releases/.test(url || '')) return 'apk';
  return 'web';
}
