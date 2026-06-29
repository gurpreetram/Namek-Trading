import { fmt, fmtPct, colorVar } from '../utils/format';
import { INDEX_SYMBOLS } from '../config/api';

export default function IndicesPanel({ quotes, loading }) {
  const entries = Object.entries(INDEX_SYMBOLS);

  return (
    <div>
      <div style={styles.note}>
        Live index data via your own Cloudflare Worker, pulling real Yahoo Finance prices.
        NSE/BSE feeds are delayed ~15 min by exchange rules.
      </div>
      <div style={styles.grid}>
        {entries.map(([symbol, { name }]) => {
          const q = quotes[symbol];
          return (
            <div key={symbol} style={styles.card}>
              <div style={styles.label}>{name}</div>
              {q ? (
                <>
                  <div style={{ ...styles.price, color: colorVar(q.changePct) }}>{fmt(q.price)}</div>
                  <div style={{ ...styles.change, color: colorVar(q.changePct) }}>
                    {fmtPct(q.changePct)} ({q.change >= 0 ? '+' : ''}{fmt(q.change)})
                  </div>
                  <div style={styles.ohlc}>O: {fmt(q.open)} H: {fmt(q.high)} L: {fmt(q.low)}</div>
                </>
              ) : (
                <div style={styles.loading}>{loading ? 'Loading...' : 'Unavailable'}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 14 },
  label: { fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  price: { fontSize: 21, fontWeight: 700, marginBottom: 4 },
  change: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  ohlc: { fontSize: 11, color: 'var(--text3)' },
  loading: { fontSize: 12, color: 'var(--text3)' },
};
