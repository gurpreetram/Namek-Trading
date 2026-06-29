// PERSISTENCE — built per explicit request: "page refresh must not clear
// Top Opportunities" AND Full Screener. Uses browser localStorage, since
// this app is a standalone deployed React app (not a Claude Artifact), so
// the Artifact-specific storage API doesn't apply here — localStorage is
// the honest, immediately available option without requiring any new
// server-side infrastructure (like Cloudflare KV/D1) to be provisioned.
//
// HONEST LIMITATION, stated plainly: this persists per BROWSER/DEVICE only
// — it will survive a page refresh or closing/reopening the tab on the
// SAME device, but will NOT sync across different devices or browsers,
// and clearing browser data will reset it. That's a real constraint of
// this approach, not hidden.

const STORAGE_KEY = 'tradeiq_scan_state_v1';

// Trading day is determined in IST, not local browser time — a stored
// scan from earlier today (IST) should restore; one from a previous
// trading day should be treated as stale and discarded, not shown as if
// it were current.
function getISTDateString(date) {
  const istMs = date.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

export function saveScanState(state) {
  try {
    const payload = {
      ...state,
      savedAtIST: getISTDateString(new Date()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Storage can fail (quota exceeded, private browsing, etc.) — this is
    // a non-critical enhancement, so fail silently rather than break the
    // app over a persistence error.
    console.warn('Failed to save scan state to localStorage:', err);
  }
}

export function loadScanState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const todayIST = getISTDateString(new Date());
    if (payload.savedAtIST !== todayIST) {
      // Stale — from a previous trading day. Discard rather than restore,
      // since yesterday's picks/results should not appear as if current.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return payload;
  } catch (err) {
    console.warn('Failed to load scan state from localStorage:', err);
    return null;
  }
}

export function clearScanState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear scan state from localStorage:', err);
  }
}
