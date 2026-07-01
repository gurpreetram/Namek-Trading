export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

export function colorVar(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'var(--text3)';
  return n >= 0 ? 'var(--green)' : 'var(--red)';
}

export function arrow(n) {
  return n >= 0 ? '▲' : '▼';
}

// Human-readable label for each verdict the verification engine can return.
export const VERDICT_LABELS = {
  BUY: { label: 'BUY', color: 'var(--green)', bg: 'var(--green-bg)' },
  SELL: { label: 'SELL', color: 'var(--red)', bg: 'var(--red-bg)' },
  WATCH: { label: 'WATCH', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  STRONG_MOVE_WEAK_VOLUME_UP: { label: 'STRONG MOVE \u2014 WEAK VOLUME (UP)', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  STRONG_MOVE_WEAK_VOLUME_DOWN: { label: 'STRONG MOVE \u2014 WEAK VOLUME (DOWN)', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  AVOID: { label: 'AVOID', color: 'var(--text3)', bg: 'rgba(255,255,255,0.03)' },
  AVOID_FAKE_SPIKE: { label: 'FAKE SPIKE \u2014 AVOID', color: 'var(--red)', bg: 'var(--red-bg)' },
  NO_SIGNAL: { label: 'NO SIGNAL', color: 'var(--text3)', bg: 'rgba(255,255,255,0.03)' },
};

export function verdictMeta(verdict) {
  return VERDICT_LABELS[verdict] || { label: verdict, color: 'var(--text2)', bg: 'rgba(255,255,255,0.03)' };
}

export const GRADE_COLORS = {
  'A+': 'var(--green)',
  A: 'var(--blue)',
  B: 'var(--amber)',
  C: 'var(--text3)',
};

export const CATEGORY_LABELS = {
  trend: { label: 'Trend', max: 15 },
  momentum: { label: 'Momentum', max: 15 },
  volume: { label: 'Volume', max: 15 },
  smartMoney: { label: 'Smart Money', max: 15 },
  riskReward: { label: 'Risk:Reward', max: 10 },
  pattern: { label: 'Pattern (not yet built)', max: 10 },
  sectorStrength: { label: 'Sector Strength (not yet built)', max: 10 },
  newsSentiment: { label: 'News Sentiment (not yet built)', max: 10 },
};

// The realistic max score right now — Pattern/Sector/News categories aren't
// implemented yet, so the achievable ceiling is 70, not the full spec's 100.
export const REALISTIC_MAX_SCORE = 70;

