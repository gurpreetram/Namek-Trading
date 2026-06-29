// REAL 2026 Zerodha intraday equity charge structure — verified via web
// search against Zerodha's own published rate card before building this,
// not guessed. These are the SAME statutory rates (STT, exchange, SEBI,
// stamp duty, GST) that apply across most Indian discount brokers; only
// the brokerage line itself varies by broker. Shared between RiskManager
// (forward planning) and PerformancePanel (real-money context on past
// trades) so both use the exact same verified formula, not two copies
// that could quietly drift apart.
export function calcIntradayCharges(buyValue, sellValue) {
  const brokerageBuy = Math.min(buyValue * 0.0003, 20);
  const brokerageSell = Math.min(sellValue * 0.0003, 20);
  const brokerage = brokerageBuy + brokerageSell;
  const stt = sellValue * 0.00025; // intraday STT is sell-side only
  const exchangeCharges = (buyValue + sellValue) * 0.0000297;
  const sebiCharges = (buyValue + sellValue) * 0.000001;
  const stampDuty = buyValue * 0.00003; // buy-side only, intraday rate
  const gst = (brokerage + exchangeCharges + sebiCharges) * 0.18;
  const totalCharges = brokerage + stt + exchangeCharges + sebiCharges + stampDuty + gst;
  return { brokerage, stt, exchangeCharges, sebiCharges, stampDuty, gst, totalCharges };
}
