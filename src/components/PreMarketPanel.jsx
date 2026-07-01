import { useState, useCallback } from 'react';
import { WORKER_BASE } from '../config/api';
import { fmt } from '../utils/format';

async function fetchPremarketPage(page) {
  const res = await fetch(`${WORKER_BASE}/premarket-scan?page=${page}&universe=full`);
  if (!res.ok) throw new Error(`Pre-market scan page ${page} failed: HTTP ${res.status}`);
  return res.json();
}

function WatchCard({ item }) {
  const nearHigh = item.nearLevel?.type === '52-Week High';
  return (
    <div className="card-enter" style={{ ...styles.card, borderColor: nearHigh ? 'var(--green-border)' : 'var(--amber)' + '40' }}>
      <div style={styles.cardHead}>
        <span style={styles.symbol}>{item.symbol.replace('.NS', '')}</span>
        <span style={{ ...styles.levelBadge, color: nearHigh ? 'var(--green)' : 'var(--amber)', background: nearHigh ? 'var(--green-bg)' : 'var(--amber-bg)' }}>
          Near {item.nearLevel?.type} ({item.nearLevel?.distance})
        </span>
        <span className="num" style={styles.watchScore}>Watch Score {item.watchScore}</span>
      </div>
      <div style={styles.statRow}>
        <Stat label="Last Close" value={`₹${fmt(item.lastClose)}`} />
        <Stat label="52W High" value={`₹${fmt(item.fiftyTwoWeekHigh)}`} />
        <Stat label="52W Low" value={`₹${fmt(item.fiftyTwoWeekLow)}`} />
        <Stat label="Yesterday Rel. Vol" value={item.yesterdayRelVol != null ? `${item.yesterdayRelVol}x` : '—'} color={item.yesterdayRelVol >= 1.5 ? 'var(--green)' : 'var(--text2)'} />
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div className="num" style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

// PRE-MARKET SCREENER — built per explicit request, with the same honesty
// the backend route states: this does NOT analyze live intraday price
// action (none exists before 9:15 IST). It surfaces stocks worth watching
// at market open based on yesterday's volume and proximity to 52-week
// highs/lows — a real, different, WEAKER signal than the live engine, kept
// visually and functionally separate so it's never mistaken for a BUY/SELL
// verdict.
export default function PreMarketPanel() {
  const [watchlist, setWatchlist] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ page: 0, totalPages: 0 });
  const [error, setError] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [totalScanned, setTotalScanned] = useState(0);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    const merged = [];
    let page = 0;
    let totalPages = 1;
    let scannedCount = 0;
    try {
      while (page < totalPages) {
        const data = await fetchPremarketPage(page);
        totalPages = data.totalPages || 1;
        scannedCount += data.scannedThisPage || 0;
        merged.push(...(data.watchlist || []));
        setProgress({ page: page + 1, totalPages });
        setWatchlist([...merged].sort((a, b) => b.watchScore - a.watchScore));
        setTotalScanned(scannedCount);
        if (data.isLastPage) break;
        page += 1;
      }
      setCompletedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  return (
    <div>
      <div style={styles.note}>
        🌅 Pre-market watchlist using only data that genuinely exists before market open: yesterday's
        closing volume and proximity to 52-week highs/lows. This does <strong>not</strong> analyze live
        intraday price action — none exists yet — and does <strong>not</strong> produce BUY/SELL verdicts
        or entry/target/stoploss. It's a list of stocks worth checking once the live scanner has real
        intraday data to work with after 9:15 IST, not a standalone trading signal.
      </div>

      <div style={styles.statusBar}>
        <div style={styles.statusText}>
          {scanning ? (
            <span><span className="live-dot" style={{ marginRight: 6 }} /> Scanning — page <span className="num">{progress.page}</span> of <span className="num">{progress.totalPages || '...'}</span></span>
          ) : error ? (
            <span style={{ color: 'var(--red)' }}>⚠️ {error}</span>
          ) : completedAt ? (
            <span style={{ color: 'var(--green)' }}>
              ✅ Last run {new Date(completedAt).toLocaleTimeString('en-IN')} IST — <span className="num">{watchlist.length}</span> stocks on watchlist out of <span className="num">{totalScanned}</span> scanned.
            </span>
          ) : (
            <span style={{ color: 'var(--text3)' }}>Not run yet — click "Run Pre-Market Scan" to build today's watchlist.</span>
          )}
        </div>
        <button style={styles.actionBtn} onClick={runScan} disabled={scanning}>
          ↻ {scanning ? 'Scanning...' : 'Run Pre-Market Scan'}
        </button>
      </div>

      {watchlist.length === 0 && !scanning ? (
        <div style={styles.emptyState}>
          {completedAt
            ? "No stocks met the watch threshold this run — that's a quiet pre-market day, not a bug."
            : 'Click "Run Pre-Market Scan" above to check yesterday\'s volume and 52-week proximity across the market.'}
        </div>
      ) : (
        watchlist.map((item, i) => <WatchCard key={item.symbol + i} item={item} />)
      )}
    </div>
  );
}

const styles = {
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 16, lineHeight: 1.5 },
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  statusText: { fontSize: 12, color: 'var(--text2)' },
  actionBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--green-border)', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 },
  emptyState: { fontSize: 13, color: 'var(--text3)', padding: '24px 16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 11, border: '1px solid var(--border)' },
  card: { background: 'var(--bg2)', border: '1px solid', borderRadius: 11, padding: 14, marginBottom: 10 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  symbol: { fontSize: 14, fontWeight: 700, minWidth: 110 },
  levelBadge: { fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 12 },
  watchScore: { fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 },
  stat: { textAlign: 'center' },
  statLabel: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 },
  statValue: { fontSize: 13, fontWeight: 700 },
};
