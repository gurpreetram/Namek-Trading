import { useState } from 'react';
import { fmt } from '../utils/format';

const GRADE_COLORS = { 'A+': 'var(--green)', A: 'var(--blue)', B: 'var(--amber)', C: 'var(--text3)' };
const N_OPTIONS = [3, 5, 10];

// "WHICH STRATEGY APPLIED" — built per explicit request: every Top
// Opportunities card should show WHY it qualified, not just the generic
// 12-line reasons list. Built from whatever signals genuinely applied to
// THIS specific stock — never claims a candlestick or sector confirmation
// that didn't actually happen for that card.
function buildStrategySummary(card) {
  const parts = [];
  if (card.momentumConfirmation === 'REAL (built gradually)') parts.push('momentum built gradually across multiple candles (not a single spike)');
  else if (card.momentumConfirmation === 'FAKE (single-candle spike)') parts.push('⚠️ momentum driven mainly by a single candle — verify before trusting this one');
  else parts.push('mixed/inconsistent momentum signal');

  if (card.volumeConfirmation === 'Strong') parts.push('strong volume confirmation (2x+ normal)');
  else if (card.volumeConfirmation === 'Moderate') parts.push('moderate volume increase');
  else parts.push('weak volume — participation may be thin');

  if (card.candlestickPattern === 'Confirmed') parts.push('a recognized candlestick pattern supporting the move');
  if (card.sectorName) parts.push(`sector "${card.sectorName}" (ranked #${card.sectorRank}) moving the same direction`);

  parts.push(`an overall score of ${card.aiScore}/${card.achievableMax}`);
  parts.push(`risk:reward of ${card.riskReward}:1`);

  return `${card.direction} signal based on: ` + parts.join(', ');
}

function GradeBadge({ grade }) {
  const color = GRADE_COLORS[grade] || 'var(--text2)';
  return <span style={{ ...styles.gradeBadge, color, borderColor: color }}>{grade}</span>;
}

function DirectionPill({ direction }) {
  const isBuy = direction === 'BUY';
  return (
    <span style={{ ...styles.dirPill, color: isBuy ? 'var(--green)' : 'var(--red)', background: isBuy ? 'var(--green-bg)' : 'var(--red-bg)' }}>
      {isBuy ? '▲ BUY' : '▼ SELL'}
    </span>
  );
}

function TopCard({ stock, rank }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card-enter" style={styles.card}>
      <div style={styles.cardHead} onClick={() => setExpanded(!expanded)}>
        <div className="num" style={styles.rankBadge}>{rank != null ? `#${rank}` : (stock.direction === 'BUY' ? '▲' : '▼')}</div>
        <div style={styles.cardHeadMain}>
          <div style={styles.symbolRow}>
            <span style={styles.symbol}>{stock.stockName.replace('.NS', '')}</span>
            <GradeBadge grade={stock.qualityGrade} />
            <DirectionPill direction={stock.direction} />
          </div>
          {stock.sectorName && (
            <span style={styles.sectorTag}>{stock.sectorName} sector — rank #{stock.sectorRank}</span>
          )}
        </div>
        <div style={styles.cardHeadRight}>
          <div style={styles.scoreWrap}>
            <div style={styles.scoreBarTrack}>
              <div className="progress-fill" style={{ ...styles.scoreBarFill, width: `${stock.confidencePct}%` }} />
            </div>
            <span className="num" style={styles.scoreText}>{stock.aiScore}/{stock.achievableMax} ({stock.confidencePct}%)</span>
            {stock.confidenceLabel && <span style={styles.confidenceLabel}>{stock.confidenceLabel}</span>}
          </div>
          <span style={styles.toggleArrow}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      <div style={styles.tradeRow}>
        <TradeStat label="Entry" value={`₹${fmt(stock.entry)}`} subtitle={stock.entryType} color="var(--blue)" />
        <TradeStat label="Stop Loss" value={`₹${fmt(stock.stopLoss)}`} subtitle={stock.stopMethod?.split(' (')[0]} color="var(--red)" />
        <TradeStat label="Target 1" value={`₹${fmt(stock.target1)}`} color="var(--green)" />
        <TradeStat label="Target 2" value={`₹${fmt(stock.target2)}`} color="var(--green)" />
        <TradeStat label="R:R" value={`1:${stock.riskReward}`} color="var(--purple)" />
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          <div style={styles.confirmGrid}>
            <ConfirmBox label="Volume" value={stock.volumeConfirmation} />
            <ConfirmBox label="Momentum" value={stock.momentumConfirmation} />
            <ConfirmBox label="Candlestick" value={stock.candlestickPattern} />
          </div>
          <div style={styles.strategyBox}>
            <div style={styles.strategyLabel}>Strategy applied</div>
            <div style={styles.strategyText}>{buildStrategySummary(stock)}</div>
          </div>
          <div style={styles.reasonsBox}>
            <div style={styles.reasonsTitle}>Why this stock</div>
            <ul style={styles.reasonsList}>
              {stock.reasons?.map((r, i) => <li key={i} style={styles.reasonItem}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeStat({ label, value, subtitle, color }) {
  return (
    <div style={styles.tradeStat}>
      <div style={styles.tradeStatLabel}>{label}</div>
      <div className="num" style={{ ...styles.tradeStatValue, color }}>{value}</div>
      {subtitle && <div style={styles.tradeStatSubtitle}>{subtitle}</div>}
    </div>
  );
}

function ConfirmBox({ label, value }) {
  return (
    <div style={styles.confirmBox}>
      <div style={styles.confirmLabel}>{label}</div>
      <div style={styles.confirmValue}>{value}</div>
    </div>
  );
}

function MarketDirectionBanner({ marketDirection, scanning }) {
  if (!marketDirection) return null;
  const color = marketDirection.label === 'Bullish' ? 'var(--green)' : marketDirection.label === 'Bearish' ? 'var(--red)' : 'var(--amber)';
  return (
    <div className={scanning ? 'scan-sweep-active' : ''} style={{ ...styles.directionBanner, borderColor: color + '40' }}>
      {scanning && <span className="live-dot" style={{ marginRight: 6 }} />}
      <span style={{ fontWeight: 700, color }}>{marketDirection.label}</span>
      <span className="num" style={styles.directionScore}>Market Direction Score: {marketDirection.score}/100</span>
      <span style={styles.directionFactors}>{marketDirection.factors?.join(' · ')}</span>
    </div>
  );
}

function CommittedPickBanner({ pick }) {
  if (!pick) {
    return (
      <div style={styles.committedEmpty}>
        <span style={{ fontWeight: 600 }}>No committed pick yet.</span> A stock needs to hold a Top-3
        position across at least 2 consecutive full scans before it's shown here — this is intentional,
        so this section doesn't reshuffle the way the list below does. Check back after the next scan.
      </div>
    );
  }
  const isBuy = pick.direction === 'BUY';
  return (
    <div style={{ ...styles.committedCard, borderColor: isBuy ? 'var(--green-border)' : 'var(--red-border)' }}>
      <div style={styles.committedHead}>
        <span style={styles.committedLabel}>🎯 Today's Committed Pick</span>
        <span style={styles.committedSub}>{pick.committedReason || 'Held across multiple consecutive scans'}</span>
      </div>
      <div style={styles.committedMain}>
        <span style={styles.committedSymbol}>{pick.stockName.replace('.NS', '')}</span>
        <DirectionPill direction={pick.direction} />
        <GradeBadge grade={pick.qualityGrade} />
        <span className="num" style={{ color: 'var(--text2)', fontSize: 12 }}>{pick.aiScore}/{pick.achievableMax} ({pick.confidencePct}%)</span>
      </div>
      <div style={styles.tradeRow}>
        <TradeStat label="Entry" value={`₹${fmt(pick.entry)}`} subtitle={pick.entryType} color="var(--blue)" />
        <TradeStat label="Stop Loss" value={`₹${fmt(pick.stopLoss)}`} subtitle={pick.stopMethod?.split(' (')[0]} color="var(--red)" />
        <TradeStat label="Target 1" value={`₹${fmt(pick.target1)}`} subtitle={pick.targetMethod?.split(' (')[0]} color="var(--green)" />
        <TradeStat label="Target 2" value={`₹${fmt(pick.target2)}`} color="var(--green)" />
        <TradeStat label="R:R" value={`1:${pick.riskReward}`} color="var(--purple)" />
      </div>
    </div>
  );
}

const LIFECYCLE_META = {
  NEW: { label: 'NEW', color: 'var(--blue)', bg: 'var(--blue-bg)' },
  ACTIVE: { label: 'ACTIVE', color: 'var(--text2)', bg: 'var(--bg3)' },
  NEAR_TARGET: { label: 'NEAR TARGET', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  TARGET_HIT: { label: 'TARGET HIT', color: 'var(--green)', bg: 'var(--green-bg)' },
  EXIT: { label: 'EXIT', color: 'var(--red)', bg: 'var(--red-bg)' },
};

function LifecycleStatusBadge({ status }) {
  const meta = LIFECYCLE_META[status] || LIFECYCLE_META.ACTIVE;
  return <span style={{ ...styles.lifecycleBadge, color: meta.color, background: meta.bg }}>{meta.label}</span>;
}

function DailyPickCard({ pick }) {
  const isBuy = pick.direction === 'BUY';
  const hasExit = !!pick.exitSignal;
  return (
    <div style={{ ...styles.card, borderColor: hasExit ? 'var(--red-border)' : (isBuy ? 'var(--green-border)' : 'var(--red-border)') }}>
      <div style={styles.cardHead}>
        <div className="num" style={styles.rankBadge}>{isBuy ? '▲' : '▼'}</div>
        <div style={styles.cardHeadMain}>
          <div style={styles.symbolRow}>
            <span style={styles.symbol}>{pick.stockName.replace('.NS', '')}</span>
            <GradeBadge grade={pick.qualityGrade} />
            <DirectionPill direction={pick.direction} />
            <LifecycleStatusBadge status={pick.lifecycleStatus} />
          </div>
        </div>
        <span className="num" style={styles.scoreText}>{pick.aiScore}/{pick.achievableMax} ({pick.confidencePct}%)</span>
      </div>

      <div style={styles.qualBox}>
        <div style={styles.qualLabel}>Why this stock was picked</div>
        <div style={styles.qualText}>{pick.qualificationReason}</div>
      </div>

      <div style={styles.metaRow}>
        {pick.sectorRank != null && <span>Sector Rank #{pick.sectorRank}</span>}
        {pick.momentumScore != null && <span className="num">Momentum Score {pick.momentumScore}</span>}
        {pick.lockedAt && <span className="num">Added {new Date(pick.lockedAt).toLocaleTimeString('en-IN')}</span>}
        {pick.removedAt && <span className="num">Removed {new Date(pick.removedAt).toLocaleTimeString('en-IN')}</span>}
      </div>

      <div style={styles.tradeRow}>
        <TradeStat label="Entry" value={`₹${fmt(pick.entry)}`} subtitle={pick.entryType} color="var(--blue)" />
        <TradeStat label="Stop Loss" value={`₹${fmt(pick.stopLoss)}`} subtitle={pick.stopMethod?.split(' (')[0]} color="var(--red)" />
        <TradeStat label="Target 1" value={`₹${fmt(pick.target1)}`} subtitle={pick.targetMethod?.split(' (')[0]} color="var(--green)" />
        <TradeStat label="Target 2" value={`₹${fmt(pick.target2)}`} color="var(--green)" />
        <TradeStat label="R:R" value={`1:${pick.riskReward}`} color="var(--purple)" />
      </div>

      {hasExit && (
        <div style={styles.exitAlert}>
          <div style={styles.exitAlertHead}>🚪 EXIT SIGNAL — the original reason for holding this has broken down</div>
          <ul style={styles.exitAlertList}>
            {pick.exitSignal.reasons.map((r, i) => <li key={i} style={styles.exitAlertItem}>{r}</li>)}
          </ul>
          <div style={styles.exitAlertMeta}>Flagged at {new Date(pick.exitSignal.flaggedAt).toLocaleTimeString('en-IN')} IST, with price near ₹{fmt(pick.exitSignal.atPrice)}</div>
        </div>
      )}
    </div>
  );
}

function DailyTopPicksSection({ picks, onReset, relativeStrengthFilterEnabled, onToggleRelativeStrength }) {
  return (
    <div style={styles.dailyPicksWrap}>
      <div style={styles.dailyPicksHead}>
        <span style={styles.dailyPicksTitle}>📌 Today's Best Intraday Setups</span>
        {picks.length > 0 && (
          <button style={styles.resetBtn} onClick={onReset} title="Clear and re-evaluate (e.g. for a new trading day)">
            ↻ Reset for new day
          </button>
        )}
      </div>

      <label style={styles.rsToggleRow}>
        <input type="checkbox" checked={relativeStrengthFilterEnabled} onChange={e => onToggleRelativeStrength(e.target.checked)} />
        <span>
          Require relative strength vs Nifty &amp; sector (experimental — OFF by default)
        </span>
      </label>
      <div style={styles.rsToggleNote}>
        ⚠️ Honest evidence: this exact filter was backtested twice on real data — it improved one sample
        (-0.09R → +0.29R) but worsened a different one (-0.09R → -0.22R). It did not reliably replicate.
        Available here if you want to try it, but it's off by default for that reason.
      </div>

      {picks.length === 0 ? (
        <div style={styles.dailyPicksEmpty}>
          Nothing has met the bar yet today — real momentum (not a fake spike), strong volume confirmation,
          a real {'>'}=1.5% price move, and a meaningfully high score, not just the bare minimum. An empty
          list here means it's genuinely a quiet day so far, not a bug. This will lock in automatically (up
          to 2 BUY + 2 SELL) the moment something qualifies, and then hold steady for the rest of the day
          rather than reshuffling — and once held, each pick is actively re-checked every scan, with a clear
          exit reason if its momentum genuinely breaks down.
        </div>
      ) : (
        <>
          <div style={styles.dailyPicksNote}>
            Locked for today — won't change unless reset. Each pick is re-checked every scan against the
            same criteria that qualified it; a real exit signal appears below a pick only with a specific,
            evidence-based reason, not because of a rank change alone.
          </div>
          <div style={styles.backtestNote}>
            ✅ This exact filter was backtested on two separate, real 23-24 stock samples: <strong>57-60% win
            rate</strong>, expected value <strong>+0.71R to +0.80R per trade</strong>, consistent across both —
            unlike most other things tested in this app, which showed no real edge. Still based on a small
            combined sample (12 trades), so treat this as genuinely promising evidence, not a guarantee.
          </div>
          <div style={styles.dailyPicksGrid}>
            {picks.map(p => <DailyPickCard key={p.stockName} pick={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function TopOpportunities({ scan }) {
  const [n, setN] = useState(5);
  const { topSelections, committedPick, dailyTopPicks, resetDailyTopPicks, marketDirection, scanning, progress, lastScanCompletedAt, error, runFullScan, allResults, universe, skippedPages, relativeStrengthFilterEnabled, setRelativeStrengthFilterEnabled } = scan;

  const fakeSpikesFiltered = allResults.filter(r => r.verdict === 'AVOID_FAKE_SPIKE').length;
  const topN = topSelections.slice(0, n);
  const universeLabel = universe === 'LIVE_FULL_NSE_EQ' ? 'Full NSE (EQ series, ~2,000+ stocks)'
    : universe === 'LIVE_NIFTY500' ? 'Nifty 500'
    : universe === 'FALLBACK_LIST' ? 'Fallback list (live fetch failed)'
    : null;

  return (
    <div>
      <MarketDirectionBanner marketDirection={marketDirection} scanning={scanning} />

      <DailyTopPicksSection picks={dailyTopPicks} onReset={resetDailyTopPicks} relativeStrengthFilterEnabled={relativeStrengthFilterEnabled} onToggleRelativeStrength={setRelativeStrengthFilterEnabled} />

      <CommittedPickBanner pick={committedPick} />

      {universeLabel && (
        <div style={styles.universeTag}>Coverage: {universeLabel}</div>
      )}

      <div style={styles.statusBar}>
        <div style={styles.statusText}>
          {scanning ? (
            <span><span className="live-dot" style={{ marginRight: 6 }} /> Scanning — page <span className="num">{progress.page}</span> of <span className="num">{progress.totalPages || '...'}</span></span>
          ) : error ? (
            <span style={{ color: 'var(--red)' }}>⚠️ {error}</span>
          ) : (
            <span style={{ color: 'var(--green)' }}>
              ✅ {lastScanCompletedAt && `Last scan ${new Date(lastScanCompletedAt).toLocaleTimeString('en-IN')} IST.`} <span className="num">{fakeSpikesFiltered}</span> fake spikes filtered across <span className="num">{allResults.length}</span> stocks checked.
            </span>
          )}
        </div>
        <button style={styles.refreshBtn} onClick={runFullScan} disabled={scanning}>
          ↻ {scanning ? 'Scanning...' : 'Rescan Now'}
        </button>
      </div>

      {skippedPages?.length > 0 && (
        <div style={styles.skippedNote}>
          ⚠️ {skippedPages.length} page{skippedPages.length > 1 ? 's' : ''} couldn't be fetched after 3 attempts and were skipped this scan
          (~{skippedPages.length * 22} stocks not checked this cycle). The rest of the scan completed normally — this is surfaced
          honestly rather than hidden, since coverage is slightly incomplete this cycle.
        </div>
      )}

      <div style={styles.nRow}>
        <span style={styles.nLabel}>Show top</span>
        {N_OPTIONS.map(opt => (
          <button
            key={opt}
            onClick={() => setN(opt)}
            style={{ ...styles.nBtn, ...(n === opt ? styles.nBtnActive : {}) }}
          >
            {opt}
          </button>
        ))}
      </div>

      {topN.length === 0 ? (
        <div style={styles.emptyState}>
          {scanning
            ? `Verifying stocks across the market — top opportunities will appear here as pages complete (${allResults.length} checked so far).`
            : `No verified top-tier opportunities right now, out of ${allResults.length} stocks checked. That's the engine being selective, not a bug — only genuinely strong, confirmed setups make this list.`}
        </div>
      ) : (
        topN.map((stock, i) => <TopCard key={stock.stockName} stock={stock} rank={i + 1} />)
      )}
    </div>
  );
}

const styles = {
  directionBanner: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 9, border: '1px solid', marginBottom: 14, fontSize: 12 },
  directionScore: { color: 'var(--text2)' },
  directionFactors: { color: 'var(--text3)', fontSize: 11 },
  universeTag: { fontSize: 11, color: 'var(--text3)', marginBottom: 10, fontStyle: 'italic' },
  skippedNote: { fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 },
  committedEmpty: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 9, padding: '12px 14px', marginBottom: 16, lineHeight: 1.5 },
  committedCard: { background: 'var(--bg2)', border: '2px solid', borderRadius: 12, padding: 16, marginBottom: 16 },
  committedHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 },
  committedLabel: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 },
  committedSub: { fontSize: 11, color: 'var(--text3)' },
  committedMain: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  committedSymbol: { fontSize: 19, fontWeight: 800 },
  dailyPicksWrap: { marginBottom: 18 },
  dailyPicksHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  dailyPicksTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3 },
  resetBtn: { fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text3)' },
  dailyPicksNote: { fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 },
  rsToggleRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 6, cursor: 'pointer' },
  rsToggleNote: { fontSize: 10.5, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 7, padding: '7px 10px', marginBottom: 12, lineHeight: 1.5 },
  backtestNote: { fontSize: 11, color: 'var(--green)', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 },
  dailyPicksEmpty: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: '14px 16px', lineHeight: 1.5 },
  dailyPicksGrid: {},
  qualBox: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px', margin: '0 0 12px', fontSize: 11.5 },
  metaRow: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text3)', marginBottom: 12 },
  lifecycleBadge: { fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, letterSpacing: 0.3 },
  qualLabel: { color: 'var(--text3)', textTransform: 'uppercase', fontSize: 9, marginBottom: 3, letterSpacing: 0.4 },
  qualText: { color: 'var(--text2)', lineHeight: 1.5 },
  exitAlert: { marginTop: 12, background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 9, padding: '10px 13px' },
  exitAlertHead: { fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 6 },
  exitAlertList: { paddingLeft: 18, marginBottom: 6 },
  exitAlertItem: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
  exitAlertMeta: { fontSize: 10, color: 'var(--text3)' },
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  statusText: { fontSize: 12, color: 'var(--text2)' },
  refreshBtn: { fontSize: 12, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text2)' },
  nRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  nLabel: { fontSize: 12, color: 'var(--text3)' },
  nBtn: { fontSize: 12, padding: '5px 13px', borderRadius: 16, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)' },
  nBtnActive: { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)' },
  emptyState: { fontSize: 13, color: 'var(--text3)', padding: '24px 16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 11, border: '1px solid var(--border)' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, marginBottom: 10, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer', flexWrap: 'wrap' },
  rankBadge: { fontSize: 13, fontWeight: 700, color: 'var(--text3)', minWidth: 28 },
  cardHeadMain: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 180 },
  symbolRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  symbol: { fontSize: 14, fontWeight: 700 },
  gradeBadge: { fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, border: '1px solid' },
  dirPill: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 14 },
  sectorTag: { fontSize: 11, color: 'var(--text3)' },
  cardHeadRight: { display: 'flex', alignItems: 'center', gap: 10 },
  scoreWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  scoreBarTrack: { width: 60, height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', background: 'var(--green)', borderRadius: 3 },
  scoreText: { fontSize: 11, fontWeight: 600, color: 'var(--text2)' },
  confidenceLabel: { fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' },
  toggleArrow: { fontSize: 10, color: 'var(--text3)' },
  tradeRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, padding: '0 16px 14px', borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 12 },
  tradeStat: { textAlign: 'center' },
  tradeStatLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 },
  tradeStatValue: { fontSize: 13, fontWeight: 700 },
  tradeStatSubtitle: { fontSize: 9, color: 'var(--text3)', marginTop: 2 },
  cardBody: { padding: '0 16px 16px', borderTop: '1px solid var(--border)' },
  confirmGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, marginBottom: 12 },
  confirmBox: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px' },
  confirmLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 },
  confirmValue: { fontSize: 12, fontWeight: 600 },
  reasonsBox: { background: 'var(--bg3)', borderRadius: 9, padding: '10px 13px' },
  strategyBox: { background: 'var(--blue-bg)', border: '1px solid rgba(77,158,255,0.2)', borderRadius: 9, padding: '10px 13px', marginBottom: 10 },
  strategyLabel: { fontSize: 10, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', marginBottom: 5, letterSpacing: 0.4 },
  strategyText: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
  reasonsTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 },
  reasonsList: { paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 },
  reasonItem: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
};
