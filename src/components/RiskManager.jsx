import { useState, useMemo } from 'react';
import { fmt } from '../utils/format';
import { calcIntradayCharges } from '../utils/brokerage';

export default function RiskManager({ scan }) {
  const { topSelections } = scan || { topSelections: [] };
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [target, setTarget] = useState('');
  const [direction, setDirection] = useState('BUY');
  const [capital, setCapital] = useState(30000);
  const [leverage, setLeverage] = useState(4);
  const [riskPct, setRiskPct] = useState(1);

  // AUTOMATION — built per explicit request: pick a real stock from today's
  // Top Opportunities and auto-fill Entry/StopLoss/Target from its REAL,
  // live data, instead of typing numbers in manually. Handled directly in
  // the select's onChange (a genuine user action) rather than a useEffect,
  // since auto-filling fields in response to a deliberate selection isn't
  // "synchronizing with an external system" — it's a direct response to input.
  const handleSelectStock = (symbol) => {
    setSelectedSymbol(symbol);
    const stock = topSelections.find(s => s.stockName === symbol);
    if (stock) {
      setEntry(stock.entry);
      setSl(stock.stopLoss);
      setTarget(stock.target1);
      setDirection(stock.direction);
    }
  };

  const result = useMemo(() => {
    const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(target), c = parseFloat(capital), lev = parseFloat(leverage), rp = parseFloat(riskPct);
    if (!e || !s || !c || !lev) return null;
    const isLong = direction === 'BUY';
    const riskPerShare = isLong ? e - s : s - e;
    if (riskPerShare <= 0) return null;

    // LEVERAGE — explicitly requested as "4x leverage (4 times the money we
    // put)": with leverage, the capital you put in controls a LARGER
    // position than the cash itself, so buying power = capital × leverage.
    const buyingPower = c * lev;
    const riskAmount = c * (rp / 100); // risk % is applied to your real capital, not the leveraged buying power — risking 1% of leveraged exposure would be far riskier than intended
    const qtyByRisk = Math.floor(riskAmount / riskPerShare);
    const qtyByCapital = Math.floor(buyingPower / e);
    const qty = Math.min(qtyByRisk, qtyByCapital); // never exceed what the leveraged capital can actually buy, even if the risk-based formula would allow more shares
    const limitedByCapital = qtyByCapital < qtyByRisk;

    const actualRisk = qty * riskPerShare;
    const rewardPerShare = t ? (isLong ? t - e : e - t) : riskPerShare * 2;
    const riskReward = rewardPerShare / riskPerShare;
    const grossProfit = qty * rewardPerShare;
    const capitalUsed = qty * e;
    const marginRequired = capitalUsed / lev; // how much of YOUR capital this specific trade actually ties up

    const buyValue = isLong ? capitalUsed : qty * t;
    const sellValue = isLong ? qty * t : capitalUsed;
    const charges = calcIntradayCharges(buyValue, sellValue);
    const netProfit = grossProfit - charges.totalCharges;

    const lossBuyValue = isLong ? capitalUsed : qty * s;
    const lossSellValue = isLong ? qty * s : capitalUsed;
    const lossCharges = calcIntradayCharges(lossBuyValue, lossSellValue);
    const netLoss = -actualRisk - lossCharges.totalCharges;

    return { qty, actualRisk, riskReward, grossProfit, netProfit, capitalUsed, marginRequired, charges, netLoss, limitedByCapital, buyingPower };
  }, [entry, sl, target, capital, leverage, riskPct, direction]);

  return (
    <div>
      <div style={styles.note}>
        ⚙️ Pick a stock from today's Top Opportunities below to auto-fill Entry/Stop/Target from its real,
        live data — or enter values manually. Leverage and real Indian intraday brokerage/STT/GST charges
        (2026 rates) are calculated automatically, so Net Profit reflects what you'd actually keep, not the
        gross move.
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>Pick from Today's Opportunities</div>
        <select style={styles.select} value={selectedSymbol} onChange={e => handleSelectStock(e.target.value)}>
          <option value="">— Enter manually instead —</option>
          {topSelections.map(s => (
            <option key={s.stockName} value={s.stockName}>
              {s.stockName.replace('.NS', '')} — {s.direction} (Score {s.aiScore}/{s.achievableMax})
            </option>
          ))}
        </select>
        {topSelections.length === 0 && <div style={styles.selectEmptyNote}>No Top Opportunities yet — run a scan first, or enter values manually below.</div>}
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Trade Setup</div>
          <div style={styles.inputGrid}>
            <Field label="Direction" type="select" value={direction} onChange={setDirection} options={['BUY', 'SELL']} />
            <Field label="Entry Price (₹)" value={entry} onChange={setEntry} />
            <Field label="Stop Loss (₹)" value={sl} onChange={setSl} />
            <Field label="Target (₹)" value={target} onChange={setTarget} />
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Capital & Leverage</div>
          <div style={styles.inputGrid}>
            <Field label="Capital (₹)" value={capital} onChange={setCapital} />
            <Field label="Leverage (x)" value={leverage} onChange={setLeverage} step="1" />
            <Field label="Risk % per trade" value={riskPct} onChange={setRiskPct} step="0.5" />
          </div>
          {result && <div style={styles.buyingPowerNote}>Buying power with {leverage}x leverage: ₹{fmt(result.buyingPower)}</div>}
        </div>
      </div>

      {result ? (
        <>
          <div style={styles.resultGrid}>
            <ResultItem label="Quantity" value={`${result.qty} shares`} />
            <ResultItem label="Margin Required" value={`₹${fmt(result.marginRequired)}`} />
            <ResultItem label="Capital Used" value={`₹${fmt(result.capitalUsed)}`} />
            <ResultItem label="Risk:Reward" value={`1:${result.riskReward.toFixed(2)}`} color="var(--purple)" />
            <ResultItem label="Risk Amount" value={`₹${fmt(result.actualRisk)}`} color="var(--red)" />
            <ResultItem label="Gross Profit (if target hit)" value={`₹${fmt(result.grossProfit)}`} color="var(--green)" />
          </div>
          {result.limitedByCapital && (
            <div style={styles.limitNote}>⚠️ Quantity limited by your leveraged buying power, not your 1% risk rule — your real risk on this trade is below {riskPct}% of capital.</div>
          )}

          <div style={styles.chargesCard}>
            <div style={styles.cardTitle}>Real Charges Breakdown (2026 rates, intraday equity)</div>
            <div style={styles.chargesGrid}>
              <ChargeRow label="Brokerage (both legs)" value={result.charges.brokerage} />
              <ChargeRow label="STT (sell side)" value={result.charges.stt} />
              <ChargeRow label="Exchange charges" value={result.charges.exchangeCharges} />
              <ChargeRow label="SEBI charges" value={result.charges.sebiCharges} />
              <ChargeRow label="Stamp duty (buy side)" value={result.charges.stampDuty} />
              <ChargeRow label="GST (18%)" value={result.charges.gst} />
            </div>
            <div style={styles.totalChargesRow}>
              <span>Total Charges</span>
              <span className="num" style={{ color: 'var(--red)', fontWeight: 700 }}>₹{fmt(result.charges.totalCharges)}</span>
            </div>
          </div>

          <div style={styles.outcomeGrid}>
            <div style={{ ...styles.outcomeCard, borderColor: 'var(--green-border)' }}>
              <div style={styles.outcomeLabel}>If Target Hit — Net Profit</div>
              <div className="num" style={{ ...styles.outcomeValue, color: 'var(--green)' }}>₹{fmt(result.netProfit)}</div>
              <div style={styles.outcomeSub}>after all charges above</div>
            </div>
            <div style={{ ...styles.outcomeCard, borderColor: 'var(--red-border)' }}>
              <div style={styles.outcomeLabel}>If Stop Loss Hit — Net Loss</div>
              <div className="num" style={{ ...styles.outcomeValue, color: 'var(--red)' }}>₹{fmt(result.netLoss)}</div>
              <div style={styles.outcomeSub}>including charges on the losing trade</div>
            </div>
          </div>
        </>
      ) : (
        <div style={styles.resultEmpty}>Pick a stock above or enter valid Entry/Stop Loss/Capital/Leverage values — Stop Loss must be on the correct side of Entry for the selected direction.</div>
      )}

      <div style={styles.rulesCard}>
        <div style={styles.cardTitle}>Professional Rules</div>
        <Rule label="Max 1% risk per trade" ok />
        <Rule label="Min 1:2 Risk:Reward" ok />
        <Rule label="Max 3 losses per day" ok />
        <Rule label="Never average a losing trade" ok={false} />
        <Rule label="Stop trading after daily loss limit" ok={false} />
      </div>
    </div>
  );
}

function Rule({ label, ok }) {
  return (
    <div style={styles.ruleRow}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? '✓' : '✗ Never'}</span>
    </div>
  );
}

function Field({ label, value, onChange, step = '1', type = 'number', options }) {
  return (
    <div>
      <div style={styles.fieldLabel}>{label}</div>
      {type === 'select' ? (
        <select style={styles.input} value={value} onChange={e => onChange(e.target.value)}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type="number" step={step} value={value} onChange={e => onChange(e.target.value)} style={styles.input} />
      )}
    </div>
  );
}

function ResultItem({ label, value, color = 'var(--text)' }) {
  return (
    <div>
      <div style={styles.resultLabel}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ChargeRow({ label, value }) {
  return (
    <div style={styles.chargeRow}>
      <span style={styles.chargeLabel}>{label}</span>
      <span className="num" style={styles.chargeValue}>₹{fmt(value)}</span>
    </div>
  );
}

const styles = {
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 16, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  select: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 13, padding: '9px 10px' },
  selectEmptyNote: { fontSize: 11, color: 'var(--text3)', marginTop: 8 },
  ruleRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  inputGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 },
  fieldLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 5 },
  input: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 14, padding: '8px 10px' },
  buyingPowerNote: { fontSize: 11, color: 'var(--blue)', marginTop: 10 },
  resultGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16, marginBottom: 10 },
  resultLabel: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 3 },
  resultEmpty: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 9, padding: 13 },
  limitNote: { fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },
  chargesCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16, marginBottom: 14 },
  chargesGrid: { marginBottom: 8 },
  chargeRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 },
  chargeLabel: { color: 'var(--text2)' },
  chargeValue: { color: 'var(--text)' },
  totalChargesRow: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 13 },
  outcomeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  outcomeCard: { background: 'var(--bg2)', border: '1px solid', borderRadius: 11, padding: 16, textAlign: 'center' },
  outcomeLabel: { fontSize: 11, color: 'var(--text3)', marginBottom: 6 },
  outcomeValue: { fontSize: 20, fontWeight: 800 },
  outcomeSub: { fontSize: 10, color: 'var(--text3)', marginTop: 4 },
  rulesCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 16 },
};
