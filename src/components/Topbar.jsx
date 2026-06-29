import { useState, useEffect } from 'react';
import { fmt, fmtPct, colorVar } from '../utils/format';

function getISTParts() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return {
    h: ist.getUTCHours(),
    m: ist.getUTCMinutes(),
    s: ist.getUTCSeconds(),
    day: ist.getUTCDay(),
  };
}

function isMarketOpen({ h, m, day }) {
  const minOfDay = h * 60 + m;
  const isWeekday = day >= 1 && day <= 5;
  return isWeekday && minOfDay >= 555 && minOfDay <= 930; // 9:15 AM - 3:30 PM
}

export default function Topbar({ quotes }) {
  const [clock, setClock] = useState(getISTParts());

  useEffect(() => {
    const id = setInterval(() => setClock(getISTParts()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n) => n.toString().padStart(2, '0');
  const marketOpen = isMarketOpen(clock);

  const priorityIndices = [
    { symbol: '^NSEI', label: 'NIFTY 50' },
    { symbol: '^NSEBANK', label: 'BANK NIFTY' },
    { symbol: '^BSESN', label: 'SENSEX' },
  ];

  return (
    <div style={styles.topbar}>
      <div style={styles.logo}>
        <span className={marketOpen ? 'live-dot' : ''} style={{ ...styles.liveDot, background: marketOpen ? 'var(--green)' : 'var(--red)' }} />
        TradeIQ India
      </div>

      <div style={styles.indicesRow}>
        {priorityIndices.map(({ symbol, label }) => {
          const q = quotes[symbol];
          return (
            <div key={symbol} style={styles.idxPill}>
              <span style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: 0.4 }}>{label}</span>
              {q ? (
                <span className="num" style={{ color: colorVar(q.changePct), fontWeight: 600 }}>
                  {fmt(q.price)} <span style={{ fontSize: 11 }}>{fmtPct(q.changePct)}</span>
                </span>
              ) : (
                <span style={{ color: 'var(--text3)' }}>Loading...</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.rightSide}>
        <span style={{ ...styles.statusBadge, ...(marketOpen ? styles.statusOpen : styles.statusClosed) }}>
          {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </span>
        <span className="num" style={styles.clock}>{pad(clock.h)}:{pad(clock.m)}:{pad(clock.s)} IST</span>
      </div>
    </div>
  );
}

const styles = {
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 18px', height: 54, background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100,
    gap: 12, flexWrap: 'wrap',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' },
  liveDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  indicesRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  idxPill: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 },
  rightSide: { display: 'flex', alignItems: 'center', gap: 10 },
  statusBadge: { fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: 0.5 },
  statusOpen: { background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)' },
  statusClosed: { background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red-border)' },
  clock: { fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)' },
};
