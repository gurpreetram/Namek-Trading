import { fmt, fmtPct, colorVar } from '../utils/format';

const SECTOR_SYMBOLS = [
  { symbol: '^NSEBANK', name: 'Banking' },
  { symbol: '^CNXIT', name: 'IT' },
  { symbol: '^CNXPHARMA', name: 'Pharma' },
  { symbol: '^CNXAUTO', name: 'Auto' },
  { symbol: '^CNXFMCG', name: 'FMCG' },
  { symbol: '^CNXMETAL', name: 'Metal' },
  { symbol: '^CNXFINANCE', name: 'Financial Services' },
  { symbol: '^CNXMIDCAP', name: 'MidCap' },
];

function strengthLabel(changePct) {
  if (changePct >= 1.5) return { label: 'Strongest', color: 'var(--green)' };
  if (changePct >= 0.5) return { label: 'Strong', color: 'var(--green)' };
  if (changePct >= -0.5) return { label: 'Neutral', color: 'var(--amber)' };
  if (changePct >= -1.5) return { label: 'Weak', color: 'var(--red)' };
  return { label: 'Weakest', color: 'var(--red)' };
}

function SectorCard({ name, quote, rank, loading }) {
  if (!quote) {
    return (
      <div style={styles.card}>
        <div style={styles.cardName}>{name}</div>
        <div style={styles.loading}>{loading ? 'Loading...' : 'Unavailable'}</div>
      </div>
    );
  }
  const strength = strengthLabel(quote.changePct);
  return (
    <div style={{ ...styles.card, borderColor: strength.color + '40', animation: 'fadeInUp 0.4s ease-out' }}>
      <div style={styles.cardTop}>
        <span style={styles.rankTag}>#{rank}</span>
        <span style={{ ...styles.strengthTag, color: strength.color }}>{strength.label}</span>
      </div>
      <div style={styles.cardName}>{name}</div>
      <div style={{ ...styles.cardPct, color: colorVar(quote.changePct) }}>{fmtPct(quote.changePct)}</div>
      <div style={styles.cardPrice}>{fmt(quote.price)}</div>
    </div>
  );
}

export default function SectorsPanel({ quotes, loading }) {
  const ranked = SECTOR_SYMBOLS
    .map(s => ({ ...s, quote: quotes[s.symbol] }))
    .filter(s => s.quote)
    .sort((a, b) => b.quote.changePct - a.quote.changePct);
  const unranked = SECTOR_SYMBOLS.filter(s => !quotes[s.symbol]);

  return (
    <div>
      <div style={styles.note}>
        📡 Live NSE sector index data via your Cloudflare Worker. Sector strength is ranked in real time by today's % change —
        this is genuinely calculated, not pre-written.
      </div>

      <div style={styles.grid}>
        {ranked.map((s, i) => <SectorCard key={s.symbol} name={s.name} quote={s.quote} rank={i + 1} loading={loading} />)}
        {unranked.map(s => <SectorCard key={s.symbol} name={s.name} quote={null} rank="-" loading={loading} />)}
      </div>

      <div style={styles.twoCol}>
        <div style={styles.infoCard}>
          <div style={styles.infoTitle}>FII / DII Activity (NSE Official — EOD)</div>
          <Row label="FII Net Flow" value="+₹2,840 Cr" color="var(--green)" />
          <Row label="FII Gross Buy" value="₹14,210 Cr" />
          <Row label="FII Gross Sell" value="₹11,370 Cr" />
          <Row label="DII Net Flow" value="−₹1,120 Cr" color="var(--red)" />
          <Row label="DII Gross Buy" value="₹9,880 Cr" />
          <Row label="DII Gross Sell" value="₹11,000 Cr" />
          <div style={styles.honestNote}>
            ⚠️ Static placeholder data — NSE only publishes FII/DII flows end-of-day, not via a free live API. Not yet wired to a real source.
          </div>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoTitle}>Options Pulse — Nifty (Estimated)</div>
          <Row label="PCR Ratio" value={quotes['^NSEI'] ? (1.1 + quotes['^NSEI'].changePct / 20).toFixed(2) : '--'} />
          <Row label="India VIX" value={quotes['^INDIAVIX'] ? fmt(quotes['^INDIAVIX'].price) : '--'} />
          <Row label="Max Pain (Est.)" value={quotes['^NSEI'] ? `₹${fmt(Math.round(quotes['^NSEI'].price / 50) * 50)}` : '--'} />
          <div style={styles.honestNote}>
            ⚠️ Estimated from live Nifty price, not real options chain OI data — a real options feed needs a broker API (Fyers/Dhan), not yet integrated.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, color = 'var(--text)' }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

const styles = {
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 13, transition: 'border-color 0.3s' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rankTag: { fontSize: 10, color: 'var(--text3)', fontWeight: 700 },
  strengthTag: { fontSize: 10, fontWeight: 700 },
  cardName: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
  cardPct: { fontSize: 17, fontWeight: 700 },
  cardPrice: { fontSize: 11, color: 'var(--text3)', marginTop: 3 },
  loading: { fontSize: 12, color: 'var(--text3)' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  infoCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16 },
  infoTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  rowLabel: { color: 'var(--text2)' },
  honestNote: { fontSize: 11, color: 'var(--amber)', marginTop: 10, lineHeight: 1.5, background: 'var(--amber-bg)', padding: '8px 10px', borderRadius: 7 },
};
