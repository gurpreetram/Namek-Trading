const STRATEGIES = [
  { num: '1', numColor: 'var(--green)', name: 'Trend Following', by: 'Richard Dennis, Ed Seykota', desc: 'Buy stocks getting stronger, sell stocks getting weaker. Never fight the trend.', tags: [['20 EMA', 'blue'], ['50 EMA', 'blue'], ['VWAP', 'green'], ['Volume', 'amber']], entry: 'Entry: Price above VWAP + HH+HL pattern + Volume breakout' },
  { num: '2', numColor: 'var(--amber)', name: 'ORB Breakout', by: 'Mark Minervini', desc: 'Stock breaks major resistance on 2x+ volume. Best at 9:15–10:30 AM open.', tags: [['ORB High', 'amber'], ['2x Volume', 'amber'], ['Resistance break', 'green']], entry: 'Wait for 15-min candle to close above opening range high before entering' },
  { num: '3', numColor: 'var(--purple)', name: 'Pullback Trading', by: 'Linda Bradford Raschke', desc: 'Trade the retracement inside a strong trend. Buy dips, not tops.', tags: [['Strong trend', 'purple'], ['VWAP pullback', 'purple'], ['EMA support', 'purple']], entry: 'Entry: Bullish candle (Hammer/Engulfing) at VWAP or 20 EMA' },
  { num: '4', numColor: 'var(--blue)', name: 'Momentum Trading', by: 'Ross Cameron', desc: 'Buy stocks moving the fastest. RelVol > 2, sector strong, breakout confirmed.', tags: [['RelVol >2', 'blue'], ['Sector strong', 'blue'], ['Breakout', 'green']], entry: 'Exit fast — book partial at 1R, trail stop above VWAP' },
  { num: '5', numColor: 'var(--green)', name: 'VWAP Institutional', by: 'Hedge Funds, FIIs', desc: 'Institutions use VWAP as benchmark. When price retests VWAP with volume — they buy.', tags: [['Above VWAP', 'green'], ['VWAP retest', 'green'], ['Vol confirm', 'green']], entry: 'Best signal: Bounce off VWAP + strong bullish candle + volume spike' },
  { num: 'SMC', numColor: 'var(--red)', name: 'Smart Money Concepts', by: 'ICT, Modern Pro Traders', desc: 'Track institutions using BOS, CHOCH, Fair Value Gaps, and Order Blocks.', tags: [['BOS', 'red'], ['CHOCH', 'red'], ['FVG', 'red'], ['Order Block', 'red']], entry: 'BOS = trend continues. CHOCH = reversal. FVG = imbalance fill. OB = institutional zone.' },
];

const BULLISH_PATTERNS = [
  ['Cup & Handle', 'Continuation'], ['Ascending Triangle', 'Breakout'], ['Bull Flag', 'Momentum'],
  ['Inv. Head & Shoulders', 'Reversal'], ['🔨 Hammer', 'Candle reversal'], ['🟢 Bullish Engulfing', 'Strong reversal'], ['⭐ Morning Star', '3-candle reversal'],
];
const BEARISH_PATTERNS = [
  ['Head & Shoulders', 'Reversal'], ['Descending Triangle', 'Breakdown'], ['Bear Flag', 'Continuation'],
  ['Double Top', 'Reversal'], ['🌠 Shooting Star', 'Candle reversal'], ['🔴 Bearish Engulfing', 'Strong reversal'], ['⭐ Evening Star', '3-candle reversal'],
];

const TAG_COLORS = {
  blue: { bg: 'var(--blue-bg)', color: 'var(--blue)' },
  green: { bg: 'var(--green-bg)', color: 'var(--green)' },
  amber: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  purple: { bg: 'var(--purple-bg)', color: 'var(--purple)' },
  red: { bg: 'var(--red-bg)', color: 'var(--red)' },
};

function Tag({ label, color }) {
  const c = TAG_COLORS[color] || TAG_COLORS.blue;
  return <span style={{ ...styles.tag, background: c.bg, color: c.color }}>{label}</span>;
}

function StrategyCard({ s }) {
  return (
    <div style={styles.stratCard}>
      <div style={styles.stratHead}>
        <span style={{ ...styles.stratNum, color: s.numColor, background: s.numColor.replace(')', '-bg)').replace('var(--', 'var(--') }}>
          <span style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 7px' }}>{s.num}</span>
        </span>
        <span style={styles.stratName}>{s.name}</span>
      </div>
      <div style={styles.stratBy}>{s.by}</div>
      <div style={styles.stratDesc}>{s.desc}</div>
      <div style={styles.stratTags}>{s.tags.map(([label, color]) => <Tag key={label} label={label} color={color} />)}</div>
      <hr style={styles.divider} />
      <div style={styles.stratEntry}>{s.entry}</div>
    </div>
  );
}

function PatternRow({ name, tag, tagColor }) {
  return (
    <div style={styles.patternRow}>
      <span style={styles.patternLabel}>{name}</span>
      <Tag label={tag} color={tagColor} />
    </div>
  );
}

export default function StrategyGuide() {
  return (
    <div>
      <div style={styles.sectionHead}>World's Best Intraday Strategies</div>
      <div style={styles.stratGrid}>
        {STRATEGIES.map(s => <StrategyCard key={s.name} s={s} />)}
      </div>

      <div style={styles.sectionHead}>Chart Patterns & Candlestick Reference</div>
      <div style={styles.twoCol}>
        <div style={styles.refCard}>
          <div style={{ ...styles.refTitle, color: 'var(--green)' }}>Bullish Patterns</div>
          {BULLISH_PATTERNS.map(([name, tag]) => <PatternRow key={name} name={name} tag={tag} tagColor="green" />)}
        </div>
        <div style={styles.refCard}>
          <div style={{ ...styles.refTitle, color: 'var(--red)' }}>Bearish Patterns</div>
          {BEARISH_PATTERNS.map(([name, tag]) => <PatternRow key={name} name={name} tag={tag} tagColor="red" />)}
        </div>
      </div>

      <div style={styles.honestNote}>
        📌 This guide is educational reference content — the live scanner currently checks RSI, VWAP, ATR, relative volume,
        and basic HH/HL structure automatically. Full automatic chart-pattern recognition (Bull Flag, Head & Shoulders, etc.)
        shown here as reference is not yet wired into the live scoring engine.
      </div>
    </div>
  );
}

const styles = {
  sectionHead: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12, marginTop: 6 },
  stratGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 },
  stratCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 15 },
  stratHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  stratNum: { fontSize: 11, fontWeight: 700 },
  stratName: { fontSize: 14, fontWeight: 700 },
  stratBy: { fontSize: 11, color: 'var(--text3)', marginBottom: 8 },
  stratDesc: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 },
  stratTags: { marginBottom: 8 },
  tag: { display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, marginRight: 5, marginBottom: 4 },
  divider: { border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' },
  stratEntry: { fontSize: 12, color: 'var(--text2)' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 },
  refCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16 },
  refTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  patternRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  patternLabel: { color: 'var(--text2)' },
  honestNote: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 9, padding: '12px 14px', lineHeight: 1.6 },
};
