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
  const [expanded, setExpanded] = useState(false);
  const color = isGainer ? 'var(--green)' : 'var(--red)';
  return (
    <div style={styles.moverRowWrap}>
      <div style={styles.moverRow} onClick={() => setExpanded(!expanded)}>
        <span style={styles.moverSymbol}>{stock.symbol.replace('.NS', '')}</span>
        <span className="num" style={{ color, fontWeight: 700 }}>{fmtPct(stock.sessionChangePct)}</span>
        <span className="num" style={{ color: 'var(--text2)', fontSize: 11 }}>₹{fmt(stock.price)}</span>
        <span className="num" style={{ color: 'var(--text3)', fontSize: 11 }}>RelVol {stock.relVol}x</span>
        <span style={{ ...styles.momentumTag, background: 'var(--green-bg)', color: 'var(--green)' }}>Real momentum</span>
        <span style={styles.moverExpandArrow}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={styles.moverReasonsBox}>
          <div style={styles.reasonsTitle}>Why this stock moved</div>
          <ul style={styles.reasonsList}>
            {stock.reasons?.map((r, i) => <li key={i} style={styles.reasonItem}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function DailyMoverCard({ mover }) {
  const hasExit = !!mover.exitSignal;
  const color = mover.isGainer ? 'var(--green)' : 'var(--red)';
  return (
    <div style={{ ...styles.dailyMoverCard, borderColor: hasExit ? 'var(--red-border)' : (mover.isGainer ? 'var(--green-border)' : 'var(--red-border)') }}>
      <div style={styles.dailyMoverHead}>
        <span style={styles.moverSymbol}>{mover.symbol.replace('.NS', '')}</span>
        <span className="num" style={{ color, fontWeight: 700, fontSize: 14 }}>{fmtPct(mover.sessionChangePct)}</span>
        <span className="num" style={{ color: 'var(--text2)', fontSize: 11 }}>₹{fmt(mover.price)}</span>
        {hasExit && <span style={styles.dailyMoverExitBadge}>EXIT</span>}
      </div>
      <div style={styles.reasonsBox}>
        <div style={styles.reasonsTitle}>Why this stock was locked in</div>
        <ul style={styles.reasonsList}>
          {mover.reasons?.slice(0, 3).map((r, i) => <li key={i} style={styles.reasonItem}>{r}</li>)}
        </ul>
      </div>
      {hasExit && (
        <div style={styles.moverExitAlert}>
          <div style={styles.moverExitHead}>🚪 EXIT SIGNAL — the move that justified this pick has broken down</div>
          <ul style={styles.reasonsList}>
            {mover.exitSignal.reasons.map((r, i) => <li key={i} style={styles.reasonItem}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// DAILY MOVERS — built per explicit request: Full Screener should have
// its OWN locked, validated daily picks, the SAME mechanism as Daily Top
// Picks ("Today's Best Intraday Setups" on the Top Opportunities tab) but
// using gainer/loser-specific criteria instead of the BUY/SELL scoring
// engine. Locks 2 genuine gainers + 2 genuine losers for the day once
// they qualify, then holds steady and actively monitors for a real exit
// signal if the move that justified the pick genuinely fades or reverses.
function DailyMoversSection({ movers, onReset }) {
  const gainers = movers.filter(m => m.isGainer);
  const losers = movers.filter(m => !m.isGainer);
  return (
    <div style={styles.dailyMoversWrap}>
      <div style={styles.dailyMoversHead}>
        <span style={styles.dailyMoversTitle}>📌 Today's Locked Movers</span>
        {movers.length > 0 && (
          <button style={styles.resetBtn} onClick={onReset} title="Clear and re-evaluate (e.g. for a new trading day)">
            ↻ Reset for new day
          </button>
        )}
      </div>
      {movers.length === 0 ? (
        <div style={styles.dailyMoversEmpty}>
          Nothing has locked in yet today — needs real momentum (not a fake spike) and a genuine {'>'}=1.5%
          price move. This will lock automatically (up to 2 gainers + 2 losers) the moment something
          qualifies, then hold steady for the rest of the day rather than reshuffling — and once locked,
          each one is actively monitored, with a clear exit reason if the move genuinely fades or reverses.
        </div>
      ) : (
        <div style={styles.dailyMoversGrid}>
          {gainers.map(m => <DailyMoverCard key={m.symbol} mover={m} />)}
          {losers.map(m => <DailyMoverCard key={m.symbol} mover={m} />)}
        </div>
      )}
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
  const { buys, sells, strongMoves, watching, allResults, scanning, progress, error, lastScanCompletedAt, universe, fakeSpikesFiltered, runFullScan, dailyMovers, resetDailyMovers } = scan;

  const tabData = { buys, sells, strongMoves, watching };
  const currentList = tabData[activeTab] || [];

  return (
    <div>
      <DailyMoversSection movers={dailyMovers} onReset={resetDailyMovers} />

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
  moverRowWrap: { marginBottom: 6 },
  dailyMoversWrap: { marginBottom: 22 },
  dailyMoversHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  dailyMoversTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 },
  resetBtn: { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)' },
  dailyMoversEmpty: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: '14px 16px', lineHeight: 1.5 },
  dailyMoversGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 },
  dailyMoverCard: { background: 'var(--bg2)', border: '1.5px solid', borderRadius: 11, padding: 14 },
  dailyMoverHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  dailyMoverExitBadge: { fontSize: 9, fontWeight: 700, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 8px', borderRadius: 10, marginLeft: 'auto' },
  moverExitAlert: { marginTop: 10, background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 9, padding: '9px 12px' },
  moverExitHead: { fontSize: 11.5, fontWeight: 700, color: 'var(--red)', marginBottom: 5 },
  moverRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, flexWrap: 'wrap', cursor: 'pointer' },
  moverSymbol: { fontSize: 13, fontWeight: 700, minWidth: 90 },
  momentumTag: { fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 8, marginLeft: 'auto' },
  moverExpandArrow: { fontSize: 9, color: 'var(--text3)' },
  moverReasonsBox: { background: 'var(--bg3)', borderRadius: 9, padding: '8px 12px', marginTop: 4 },
};
