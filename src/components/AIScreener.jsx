import { useState } from 'react';
import { fmt, fmtPct, colorVar, verdictMeta } from '../utils/format';

function StockCard({ stock }) {
  const [expanded, setExpanded] = useState(false);
  const meta = verdictMeta(stock.verdict);

  return (
    <div style={styles.card}>
      <div style={styles.cardHead} onClick={() => setExpanded(!expanded)}>
        <div style={styles.cardHeadLeft}>
          <span style={styles.symbol}>{stock.symbol.replace('.NS', '')}</span>
          <span className="num" style={{ color: colorVar(stock.sessionChangePct), fontWeight: 600, fontSize: 13 }}>
            ₹{fmt(stock.price)} {fmtPct(stock.sessionChangePct)}
          </span>
        </div>
        <div style={styles.cardHeadRight}>
          <span style={{ ...styles.verdictPill, color: meta.color, background: meta.bg }}>{meta.label}</span>
          <span className="num" style={styles.scorePill}>Score {stock.score}</span>
          <span style={styles.toggleArrow}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          <div style={styles.metricsGrid}>
            <Metric label="RelVol" value={`${stock.relVol}x`} />
            <Metric label="RSI" value={stock.rsi} />
            <Metric label="VWAP" value={`₹${fmt(stock.vwap)}`} />
            <Metric label="Structure" value={stock.structure} />
            <Metric label="ATR" value={stock.atrExpanding ? 'Expanding' : 'Flat'} />
            <Metric label="Spike Dom." value={stock.spikeDominance} />
          </div>

          <div style={styles.reasonsBox}>
            <div style={styles.reasonsTitle}>Why this verdict</div>
            <ul style={styles.reasonsList}>
              {stock.reasons?.map((r, i) => <li key={i} style={styles.reasonItem}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={styles.metricBox}>
      <div style={styles.metricLabel}>{label}</div>
      <div className="num" style={styles.metricValue}>{String(value)}</div>
    </div>
  );
}

function MoverRow({ stock, isGainer }) {
  const color = isGainer ? 'var(--green)' : 'var(--red)';
  return (
    <div style={styles.moverRow}>
      <span style={styles.moverSymbol}>{stock.symbol.replace('.NS', '')}</span>
      <span className="num" style={{ color, fontWeight: 700 }}>{fmtPct(stock.sessionChangePct)}</span>
      <span className="num" style={{ color: 'var(--text2)', fontSize: 11 }}>₹{fmt(stock.price)}</span>
      <span className="num" style={{ color: 'var(--text3)', fontSize: 11 }}>RelVol {stock.relVol}x</span>
      <span style={{ ...styles.momentumTag, background: 'var(--green-bg)', color: 'var(--green)' }}>Real momentum</span>
    </div>
  );
}

// TOP GAINERS / TOP LOSERS — built per explicit request: the screener
// previously only separated stocks by VERDICT (BUY/SELL/etc), never by
// genuine price movement with real momentum specifically. This uses the
// full raw scan data (allResults), filtered to GENUINE momentum only
// (momentumQuality === 'REAL built gradually') — explicitly excluding fake
// single-candle spikes, since a stock up 8% on one manipulated candle is
// not what "profit-making momentum" means.
function MoversSection({ allResults }) {
  const realMomentum = allResults.filter(r => r.momentumQuality === 'REAL (built gradually)');
  // MOMENTUM FILTER, built per explicit spec, applied consistently here too
  // (the spec asked for this in BOTH Top Opportunities and Full Screener):
  // ignore weak movers — require at least 1.5% real price change, not just
  // genuine momentum quality regardless of how small the actual move was.
  const gainers = realMomentum.filter(r => r.sessionChangePct >= 1.5).sort((a, b) => b.sessionChangePct - a.sessionChangePct).slice(0, 10);
  const losers = realMomentum.filter(r => r.sessionChangePct <= -1.5).sort((a, b) => a.sessionChangePct - b.sessionChangePct).slice(0, 10);

  return (
    <div style={styles.moversGrid}>
      <div style={styles.moversCol}>
        <div style={styles.moversTitle}>📈 Top Gainers — Real Momentum</div>
        {gainers.length === 0 ? (
          <div style={styles.moversEmpty}>No genuine-momentum gainers found this scan — fake spikes are excluded, not shown here.</div>
        ) : (
          gainers.map(s => <MoverRow key={s.symbol} stock={s} isGainer />)
        )}
      </div>
      <div style={styles.moversCol}>
        <div style={styles.moversTitle}>📉 Top Losers — Real Momentum</div>
        {losers.length === 0 ? (
          <div style={styles.moversEmpty}>No genuine-momentum losers found this scan — fake spikes are excluded, not shown here.</div>
        ) : (
          losers.map(s => <MoverRow key={s.symbol} stock={s} isGainer={false} />)
        )}
      </div>
    </div>
  );
}

function SectionTabs({ active, onChange, counts }) {
  const tabs = [
    { key: 'movers', label: '📊 Top Gainers/Losers', count: null, color: 'var(--blue)' },
    { key: 'buys', label: 'BUY', count: counts.buys, color: 'var(--green)' },
    { key: 'sells', label: 'SELL', count: counts.sells, color: 'var(--red)' },
    { key: 'strongMoves', label: 'Strong Move / Weak Vol', count: counts.strongMoves, color: 'var(--amber)' },
    { key: 'watching', label: 'Watching', count: counts.watching, color: 'var(--text2)' },
  ];
  return (
    <div style={styles.tabsRow}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            ...styles.tabBtn,
            ...(active === t.key ? { borderColor: t.color, color: t.color, background: 'rgba(255,255,255,0.03)' } : {}),
          }}
        >
          {t.label}{t.count != null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}

export default function AIScreener({ scan }) {
  const [activeTab, setActiveTab] = useState('movers');
  const { buys, sells, strongMoves, watching, allResults, scanning, progress, error, lastScanCompletedAt, universe, fakeSpikesFiltered, runFullScan } = scan;

  const tabData = { buys, sells, strongMoves, watching };
  const currentList = tabData[activeTab] || [];

  return (
    <div>
      <div style={styles.statusBar}>
        <div style={styles.statusText}>
          {scanning ? (
            <span><span className="live-dot" style={{ marginRight: 6 }} /> Scanning market — page <span className="num">{progress.page}</span> of <span className="num">{progress.totalPages || '...'}</span></span>
          ) : error ? (
            <span style={{ color: 'var(--red)' }}>⚠️ {error}</span>
          ) : (
            <span style={{ color: 'var(--green)' }}>
              ✅ Scan complete{universe === 'FALLBACK_LIST' ? ' (using fallback list — live NSE fetch failed)' : ''}.
              {lastScanCompletedAt && ` Last completed ${new Date(lastScanCompletedAt).toLocaleTimeString('en-IN')} IST.`}
              {' '}<span className="num">{fakeSpikesFiltered}</span> fake spikes filtered out automatically.
            </span>
          )}
        </div>
        <button style={styles.refreshBtn} onClick={runFullScan} disabled={scanning}>
          ↻ {scanning ? 'Scanning...' : 'Rescan Now'}
        </button>
      </div>

      <SectionTabs active={activeTab} onChange={setActiveTab} counts={{
        buys: buys.length, sells: sells.length, strongMoves: strongMoves.length, watching: watching.length,
      }} />

      {activeTab === 'movers' ? (
        <MoversSection allResults={allResults} />
      ) : currentList.length === 0 ? (
        <div style={styles.emptyState}>
          {scanning
            ? 'Verifying stocks across the market — results will appear here as each page completes.'
            : 'No stocks currently qualify in this category. This is the engine being selective, not a bug — it only shows verified, confirmed setups.'}
        </div>
      ) : (
        <div>
          {currentList.map(stock => <StockCard key={stock.symbol} stock={stock} />)}
        </div>
      )}
    </div>
  );
}

const styles = {
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  statusText: { fontSize: 12, color: 'var(--text2)' },
  spinner: { display: 'inline-block', width: 11, height: 11, border: '2px solid var(--border2)', borderTopColor: 'var(--green)', borderRadius: '50%', marginRight: 5, animation: 'spin 0.6s linear infinite' },
  refreshBtn: { fontSize: 12, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' },
  tabsRow: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  tabBtn: { fontSize: 12, padding: '7px 13px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' },
  emptyState: { fontSize: 13, color: 'var(--text3)', padding: '24px 16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 11, border: '1px solid var(--border)' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, marginBottom: 10, overflow: 'hidden' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', cursor: 'pointer', flexWrap: 'wrap', gap: 10 },
  cardHeadLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  symbol: { fontSize: 14, fontWeight: 700 },
  cardHeadRight: { display: 'flex', alignItems: 'center', gap: 8 },
  verdictPill: { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 14, letterSpacing: 0.3 },
  scorePill: { fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: '3px 8px', borderRadius: 10 },
  toggleArrow: { fontSize: 10, color: 'var(--text3)' },
  cardBody: { padding: '0 16px 16px', borderTop: '1px solid var(--border)' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginTop: 12, marginBottom: 12 },
  metricBox: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' },
  metricLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 },
  metricValue: { fontSize: 13, fontWeight: 600 },
  reasonsBox: { background: 'var(--bg3)', borderRadius: 9, padding: '10px 13px' },
  reasonsTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 },
  reasonsList: { paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 },
  reasonItem: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  moversGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  moversCol: {},
  moversTitle: { fontSize: 12, fontWeight: 700, marginBottom: 10 },
  moversEmpty: { fontSize: 11, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', lineHeight: 1.5 },
  moverRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 6, flexWrap: 'wrap' },
  moverSymbol: { fontSize: 13, fontWeight: 700, minWidth: 90 },
  momentumTag: { fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, marginLeft: 'auto' },
};
