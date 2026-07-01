import { useState, useEffect, useRef } from 'react';

const ALERT_ICONS = {
  NEW_OPPORTUNITY: '🆕',
  BREAKOUT: '🚀',
  BREAKDOWN: '📉',
  TARGET_HIT: '🎯',
  STOPLOSS_HIT: '🛑',
  CONFIDENCE_UPGRADE: '📈',
  CONFIDENCE_DOWNGRADE: '📉',
  EXIT_SIGNAL: '🚪',
};

const ALERT_COLORS = {
  NEW_OPPORTUNITY: { border: 'var(--blue)', bg: 'var(--blue-bg)' },
  BREAKOUT: { border: 'var(--green)', bg: 'var(--green-bg)' },
  BREAKDOWN: { border: 'var(--red)', bg: 'var(--red-bg)' },
  TARGET_HIT: { border: 'var(--green)', bg: 'var(--green-bg)' },
  STOPLOSS_HIT: { border: 'var(--red)', bg: 'var(--red-bg)' },
  CONFIDENCE_UPGRADE: { border: 'var(--green)', bg: 'var(--green-bg)' },
  CONFIDENCE_DOWNGRADE: { border: 'var(--amber)', bg: 'var(--amber-bg)' },
  EXIT_SIGNAL: { border: 'var(--red)', bg: 'var(--red-bg)' },
};

const AUTO_DISMISS_MS = 8000;

function ToastItem({ toast, onDismiss }) {
  const colors = ALERT_COLORS[toast.type] || ALERT_COLORS.NEW_OPPORTUNITY;
  const icon = ALERT_ICONS[toast.type] || '🔔';
  return (
    <div className="card-enter" style={{ ...styles.toast, borderColor: colors.border, background: colors.bg }}>
      <span style={styles.toastIcon}>{icon}</span>
      <div style={styles.toastBody}>
        <div style={styles.toastMessage}>{toast.message}</div>
        <div className="num" style={styles.toastTime}>{new Date(toast.timestamp).toLocaleTimeString('en-IN')}</div>
      </div>
      <button style={styles.toastClose} onClick={() => onDismiss(toast.id)}>✕</button>
    </div>
  );
}

// RIGHT-SIDE ALERT TOASTS — built per explicit request: alerts previously
// only lived inside the Signals tab, requiring a manual check. This shows
// real-time notifications regardless of which tab is active, fixed to the
// top-right of the screen ("right side alert"), for both the backend
// alert engine's output (new opportunities, confidence changes, target/
// stop hits) AND Daily Top Picks exit signals. Toasts auto-dismiss after a
// few seconds but the underlying alert remains permanently visible in the
// Signals tab — this is a transient notification layer, not a replacement
// for that permanent log.
export default function ToastContainer({ alerts, dailyTopPicks }) {
  const [toasts, setToasts] = useState([]);
  const seenKeysRef = useRef(new Set());

  useEffect(() => {
    const newToasts = [];

    (alerts || []).forEach(a => {
      const key = `${a.symbol}-${a.type}-${a.timestamp}`;
      if (!seenKeysRef.current.has(key)) {
        seenKeysRef.current.add(key);
        newToasts.push({ id: key, type: a.type, message: a.message, timestamp: a.timestamp });
      }
    });

    (dailyTopPicks || []).forEach(p => {
      if (p.exitSignal) {
        const key = `exit-${p.stockName}-${p.exitSignal.flaggedAt}`;
        if (!seenKeysRef.current.has(key)) {
          seenKeysRef.current.add(key);
          newToasts.push({
            id: key, type: 'EXIT_SIGNAL',
            message: `${p.stockName.replace('.NS', '')}: ${p.exitSignal.reasons[0]}`,
            timestamp: p.exitSignal.flaggedAt,
          });
        }
      }
    });

    if (newToasts.length > 0) {
      setToasts(prev => [...prev, ...newToasts]);
      newToasts.forEach(t => {
        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), AUTO_DISMISS_MS);
      });
    }
  }, [alerts, dailyTopPicks]);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.slice(-5).map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
    </div>
  );
}

const styles = {
  container: { position: 'fixed', top: 70, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 },
  toast: { display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 12px', borderRadius: 10, border: '1px solid', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' },
  toastIcon: { fontSize: 15, marginTop: 1 },
  toastBody: { flex: 1, minWidth: 0 },
  toastMessage: { fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 },
  toastTime: { fontSize: 10, color: 'var(--text3)', marginTop: 3 },
  toastClose: { background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1 },
};
