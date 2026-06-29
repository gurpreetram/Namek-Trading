import { useState, useEffect, useCallback, useMemo } from 'react';
import { WORKER_BASE } from '../config/api';
import { fmt } from '../utils/format';
import { calcIntradayCharges } from '../utils/brokerage';

async function fetchPerformance() {
  const res = await fetch(`${WORKER_BASE}/performance`);
  if (!res.ok) throw new Error(`Performance fetch failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchBacktest(symbol) {
  const res = await fetch(`${WORKER_BASE}/backtest?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Backtest fetch failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchBacktestBatch() {
  const res = await fetch(`${WORKER_BASE}/backtest-batch`);
  if (!res.ok) throw new Error(`Batch backtest fetch failed: HTTP ${res.status}`);
  return res.json();
}

// REAL-MONEY CONTEXT — built per explicit request: "what's the use of
// Live Performance Tracking, how does it work with [a capital amount]?"
// The backend genuinely tracks real entry/exit PRICES per call, but has no
// way to know a person's actual capital — that's correctly a frontend
// concern, applied here using the SAME verified 2026 brokerage formula as
// Risk Manager, not a separate, possibly-drifting copy. For each CLOSED
// trade, this computes what a 1%-risk position size would have been on
// that REAL entry/stoploss distance, and what the REAL net rupee result
// would have been after actual charges — not just an abstract win/loss count.
function applyRealMoneyContext(closedTrades, capital, riskPct) {
  return closedTrades.map(trade => {
    const isLong = trade.direction === 'BUY';
    const riskPerShare = Math.abs(trade.entry - trade.stopLoss);
    if (riskPerShare <= 0) return { ...trade, qty: 0, netResult: 0 };

    const riskAmount = capital * (riskPct / 100);
    const qty = Math.floor(riskAmount / riskPerShare);
    const buyValue = isLong ? qty * trade.entry : qty * trade.exitPrice;
    const sellValue = isLong ? qty * trade.exitPrice : qty * trade.entry;
    const grossPL = isLong ? qty * (trade.exitPrice - trade.entry) : qty * (trade.entry - trade.exitPrice);
    const charges = calcIntradayCharges(buyValue, sellValue);
    const netResult = grossPL - charges.totalCharges;

    return { ...trade, qty, grossPL, charges: charges.totalCharges, netResult };
  });
}


function StatBox({ label, value, color, sub }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statLabel}>{label}</div>
      <div className="num" style={{ ...styles.statValue, color }}>{value}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function EVExplainer({ ev }) {
  if (ev == null) return null;
  const isPositive = ev > 0;
  return (
    <div style={{ ...styles.evBox, borderColor: isPositive ? 'var(--green-border)' : 'var(--red-border)' }}>
      <div style={{ fontWeight: 700, color: isPositive ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
        {isPositive ? '✓ Historically net positive' : '✗ Historically net negative or flat'} ({ev > 0 ? '+' : ''}{ev}R per trade)
      </div>
      <div style={styles.evNote}>
        Every trade targets a fixed 1:2 risk:reward, so win rate alone can mislead — a 40% win rate can still
        be profitable, a 60% win rate can still lose money, depending on exactly where wins and losses land.
        Expected Value (R) is the honest single number for "does this actually make money," and it does NOT
        include real trading costs (brokerage, STT, slippage), which would reduce it further.
      </div>
    </div>
  );
}

// PRIORITY 7 — PERFORMANCE & BACKTESTING DASHBOARD. Shows both:
// 1. Live forward-tracking (/performance) — real calls made today, checked
//    against actual subsequent prices.
// 2. Historical backtesting (/backtest, /backtest-batch) — the SAME scoring
//    engine replayed against up to 60 days of real history, to check whether
//    the underlying strategy has shown a genuine statistical edge.
// These answer DIFFERENT questions and are kept visually distinct rather
// than blended into one number — conflating them would be misleading.
export default function PerformancePanel() {
  const [perf, setPerf] = useState(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [perfError, setPerfError] = useState(null);
  const [capital, setCapital] = useState(30000);
  const [riskPct, setRiskPct] = useState(1);

  const [batchResult, setBatchResult] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState(null);

  const [singleSymbol, setSingleSymbol] = useState('RELIANCE.NS');
  const [singleResult, setSingleResult] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState(null);

  const loadPerformance = useCallback(() => {
    setPerfLoading(true);
    setPerfError(null);
    fetchPerformance()
      .then(setPerf)
      .catch(err => setPerfError(err.message))
      .finally(() => setPerfLoading(false));
  }, []);

  // Initial load on mount only — fetch directly here rather than calling a
  // function that synchronously sets state at its top, which is what the
  // cascading-render lint rule flags. The refresh BUTTON still uses
  // loadPerformance() directly, which is fine since that's a genuine
  // user-triggered event handler, not effect-body state setting.
  useEffect(() => {
    let cancelled = false;
    fetchPerformance()
      .then(data => { if (!cancelled) { setPerf(data); setPerfError(null); } })
      .catch(err => { if (!cancelled) setPerfError(err.message); })
      .finally(() => { if (!cancelled) setPerfLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const moneyResults = useMemo(() => {
    if (!perf?.recentClosed?.length) return [];
    const c = parseFloat(capital), rp = parseFloat(riskPct);
    if (!c || !rp) return [];
    return applyRealMoneyContext(perf.recentClosed, c, rp);
  }, [perf, capital, riskPct]);

  const totalNetMoney = useMemo(() => moneyResults.reduce((sum, p) => sum + (p.netResult || 0), 0), [moneyResults]);

  const runBatchBacktest = () => {
    setBatchLoading(true);
    setBatchError(null);
    fetchBacktestBatch()
      .then(setBatchResult)
      .catch(err => setBatchError(err.message))
      .finally(() => setBatchLoading(false));
  };

  const runSingleBacktest = () => {
    if (!singleSymbol.trim()) return;
    setSingleLoading(true);
    setSingleError(null);
    fetchBacktest(singleSymbol.trim().toUpperCase())
      .then(setSingleResult)
      .catch(err => setSingleError(err.message))
      .finally(() => setSingleLoading(false));
  };

  return (
    <div>
      <div style={styles.note}>
        📊 Two different questions, kept separate on purpose: <strong>Live Tracking</strong> below checks
        whether TODAY's actual calls hit their target or stoploss. <strong>Backtesting</strong> replays the
        exact same scoring engine against up to 60 days of real history, to check whether the underlying
        strategy has shown a genuine statistical edge BEFORE trusting it on live picks.
      </div>

      <div style={styles.engineNote}>
        ⚙️ <strong>Which engine produces these calls:</strong> every call tracked below comes from this
        app's main scoring engine (Trend + Momentum + Volume + Smart Money Concepts + Candlestick + Sector
        + Risk:Reward, weighted into one score) — the same one powering the Top Opportunities tab.
      </div>

      {/* ---------- LIVE FORWARD-TRACKING ---------- */}
      <div style={styles.sectionTitle}>Live Performance Tracking</div>
      <div style={styles.moneyContextNote}>
        💰 The numbers below apply YOUR capital and risk % to each call's real entry/exit prices, using the
        same verified 2026 brokerage formula as Risk Manager — turning "9 wins, 12 losses" into an actual
        ₹ result, including real charges, not just an abstract count.
      </div>
      <div style={styles.moneyInputRow}>
        <div>
          <div style={styles.fieldLabel}>Your Capital (₹)</div>
          <input type="number" value={capital} onChange={e => setCapital(e.target.value)} style={styles.moneyInput} />
        </div>
        <div>
          <div style={styles.fieldLabel}>Risk % per trade</div>
          <input type="number" step="0.5" value={riskPct} onChange={e => setRiskPct(e.target.value)} style={styles.moneyInput} />
        </div>
      </div>

      {perfLoading ? (
        <div style={styles.loadingText}>Loading live track record...</div>
      ) : perfError ? (
        <div style={styles.errorText}>⚠️ {perfError}</div>
      ) : perf && (
        <>
          <div style={styles.statGrid}>
            <StatBox label="Total Calls" value={perf.totalCalls} color="var(--text)" />
            <StatBox label="Open" value={perf.openPositions} color="var(--blue)" />
            <StatBox label="Closed" value={perf.closedPositions} color="var(--text)" />
            <StatBox label="Wins" value={perf.wins} color="var(--green)" />
            <StatBox label="Losses" value={perf.losses} color="var(--red)" />
            <StatBox
              label="Win Rate"
              value={perf.winRatePct != null ? `${perf.winRatePct}%` : '—'}
              color={perf.winRatePct == null ? 'var(--text3)' : 'var(--text)'}
              sub={perf.winRatePct == null ? 'No closed calls yet' : null}
            />
          </div>

          {moneyResults.length > 0 && (
            <div style={{ ...styles.realMoneyTotal, borderColor: totalNetMoney >= 0 ? 'var(--green-border)' : 'var(--red-border)' }}>
              <span style={styles.realMoneyLabel}>If you'd risked ₹{fmt(capital)} at {riskPct}% on every closed call so far:</span>
              <span className="num" style={{ ...styles.realMoneyValue, color: totalNetMoney >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {totalNetMoney >= 0 ? '+' : ''}₹{fmt(totalNetMoney)} net (after real charges)
              </span>
            </div>
          )}

          {perf.openNow?.length > 0 && (
            <div style={styles.subSection}>
              <div style={styles.subTitle}>Currently Open ({perf.openNow.length})</div>
              {perf.openNow.map((p, i) => (
                <div key={i} style={styles.posRow}>
                  <span style={styles.posSymbol}>{p.symbol.replace('.NS', '')}</span>
                  <span style={{ color: p.direction === 'BUY' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{p.direction}</span>
                  <span className="num" style={styles.posDetail}>Entry ₹{fmt(p.entry)}</span>
                  <span className="num" style={styles.posDetail}>Target ₹{fmt(p.target1)}</span>
                  <span className="num" style={styles.posDetail}>Stop ₹{fmt(p.stopLoss)}</span>
                </div>
              ))}
            </div>
          )}

          {moneyResults.length > 0 && (
            <div style={styles.subSection}>
              <div style={styles.subTitle}>Recently Closed — Real ₹ Result</div>
              {moneyResults.map((p, i) => (
                <div key={i} style={styles.posRow}>
                  <span style={styles.posSymbol}>{p.symbol.replace('.NS', '')}</span>
                  <span style={{ ...styles.outcomeBadge, ...(p.outcome === 'WIN' ? styles.outcomeWin : styles.outcomeLoss) }}>{p.outcome}</span>
                  <span className="num" style={styles.posDetail}>{p.qty} shares · Entry ₹{fmt(p.entry)} → Exit ₹{fmt(p.exitPrice)}</span>
                  <span className="num" style={{ ...styles.posDetail, color: p.netResult >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, marginLeft: 'auto' }}>
                    {p.netResult >= 0 ? '+' : ''}₹{fmt(p.netResult)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {perf.totalCalls === 0 && (
            <div style={styles.emptyState}>
              No calls tracked yet — run a market scan from the Top Opportunities tab to start building a real track record.
            </div>
          )}

          <button style={styles.refreshBtn} onClick={loadPerformance}>↻ Refresh</button>
        </>
      )}

      {/* ---------- BACKTESTING ---------- */}
      <div style={{ ...styles.sectionTitle, marginTop: 28 }}>Backtesting — Proof Before Trust</div>

      <div style={styles.backtestControls}>
        <input
          style={styles.input}
          value={singleSymbol}
          onChange={e => setSingleSymbol(e.target.value)}
          placeholder="e.g. RELIANCE.NS"
        />
        <button style={styles.actionBtn} onClick={runSingleBacktest} disabled={singleLoading}>
          {singleLoading ? 'Running...' : 'Backtest This Stock'}
        </button>
        <button style={styles.actionBtnAlt} onClick={runBatchBacktest} disabled={batchLoading}>
          {batchLoading ? 'Running batch (24 stocks)...' : 'Run Diverse Sample (24 stocks)'}
        </button>
      </div>

      {singleError && <div style={styles.errorText}>⚠️ {singleError}</div>}
      {singleResult && !singleResult.error && (
        <div style={styles.backtestResult}>
          <div style={styles.subTitle}>{singleResult.symbol} — {singleResult.approxTradingDaysCovered} trading days, {singleResult.totalTrades} trades</div>
          <EVExplainer ev={null} />
          <div style={styles.statGrid}>
            <StatBox label="Trades" value={singleResult.totalTrades} color="var(--text)" />
            <StatBox label="Wins" value={singleResult.wins} color="var(--green)" />
            <StatBox label="Losses" value={singleResult.losses} color="var(--red)" />
            <StatBox label="Win Rate" value={singleResult.winRatePct != null ? `${singleResult.winRatePct}%` : '—'} color="var(--text)" />
          </div>
        </div>
      )}
      {singleResult?.error && <div style={styles.errorText}>⚠️ {singleResult.error}</div>}

      {batchError && <div style={styles.errorText}>⚠️ {batchError}</div>}
      {batchResult && (
        <div style={styles.backtestResult}>
          <div style={styles.subTitle}>{batchResult.sampleSize} stocks across all sectors — {batchResult.totalTradesAcrossSample} total trades</div>
          <EVExplainer ev={batchResult.expectedValuePerTradeR} />
          <div style={styles.statGrid}>
            <StatBox label="Trades" value={batchResult.totalTradesAcrossSample} color="var(--text)" />
            <StatBox label="Win Rate" value={`${batchResult.aggregateWinRatePct}%`} color="var(--text)" />
            <StatBox label="Profitable Stocks" value={batchResult.stocksProfitable} color="var(--green)" />
            <StatBox label="Unprofitable Stocks" value={batchResult.stocksUnprofitable} color="var(--red)" />
          </div>
          <div style={styles.methodNote}>{batchResult.methodologyNote}</div>
        </div>
      )}
    </div>
  );
}

const styles = {
  moneyContextNote: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 12, lineHeight: 1.5 },
  engineNote: { fontSize: 12, color: 'var(--text2)', background: 'var(--blue-bg)', border: '1px solid rgba(77,158,255,0.2)', borderRadius: 8, padding: '10px 13px', marginBottom: 16, lineHeight: 1.5 },
  moneyInputRow: { display: 'flex', gap: 14, marginBottom: 16 },
  fieldLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 5 },
  moneyInput: { background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 14, padding: '8px 10px', width: 140 },
  realMoneyTotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, border: '1px solid', borderRadius: 11, padding: '12px 16px', marginBottom: 16 },
  realMoneyLabel: { fontSize: 12, color: 'var(--text2)' },
  realMoneyValue: { fontSize: 16, fontWeight: 800 },
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 18, lineHeight: 1.5 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  loadingText: { fontSize: 12, color: 'var(--text3)' },
  errorText: { fontSize: 12, color: 'var(--red)', margin: '8px 0' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10, marginBottom: 16 },
  statBox: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 10px', textAlign: 'center' },
  statLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 5 },
  statValue: { fontSize: 18, fontWeight: 700 },
  statSub: { fontSize: 9, color: 'var(--text3)', marginTop: 3 },
  subSection: { marginBottom: 16 },
  subTitle: { fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 },
  posRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, fontSize: 12, flexWrap: 'wrap' },
  posSymbol: { fontWeight: 700, minWidth: 90 },
  posDetail: { color: 'var(--text2)' },
  outcomeBadge: { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  outcomeWin: { background: 'var(--green-bg)', color: 'var(--green)' },
  outcomeLoss: { background: 'var(--red-bg)', color: 'var(--red)' },
  emptyState: { fontSize: 13, color: 'var(--text3)', padding: '20px 16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 11, border: '1px solid var(--border)' },
  refreshBtn: { fontSize: 12, padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' },
  backtestControls: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  input: { fontSize: 12, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', fontFamily: 'var(--font-mono)', minWidth: 140 },
  actionBtn: { fontSize: 12, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--green-border)', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 },
  actionBtnAlt: { fontSize: 12, padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' },
  backtestResult: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16, marginBottom: 16 },
  evBox: { border: '1px solid', borderRadius: 9, padding: '10px 13px', marginBottom: 14 },
  evNote: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 },
  methodNote: { fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, marginTop: 8 },
};
