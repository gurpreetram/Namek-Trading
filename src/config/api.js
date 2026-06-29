// Your Cloudflare Worker — the real backend for this app.
// All live price, candle, and verification data flows through here.
export const WORKER_BASE = 'https://namek-trading.gurpreetramdev2004.workers.dev';

// How often the dashboard's key indices (Nifty, BankNifty, Sensex, VIX) refresh.
export const FAST_REFRESH_MS = 7000;

// How often the full market verification scan re-runs automatically.
// 15 minutes, chosen to stay well within Cloudflare's free daily request quota
// while still catching new setups reasonably quickly through the trading day.
export const MARKET_SCAN_INTERVAL_MS = 15 * 60 * 1000;

// Pagination must match PAGE_SIZE in the Worker's /scan-market route.
// Cloudflare Workers free tier caps each invocation at 50 outgoing requests,
// so the full ~500 stock universe is fetched in pages rather than one call.
export const SCAN_PAGE_DELAY_MS = 250; // brief pause between page requests, polite to the Worker/Yahoo

export const INDEX_SYMBOLS = {
  '^NSEI':       { name: 'NIFTY 50',     priority: true },
  '^NSEBANK':    { name: 'BANK NIFTY',   priority: true },
  '^BSESN':      { name: 'SENSEX',       priority: true },
  '^INDIAVIX':   { name: 'INDIA VIX',    priority: true },
  '^CNXFINANCE': { name: 'FIN NIFTY',    priority: false },
  '^CNXMIDCAP':  { name: 'MIDCAP 50',    priority: false },
  '^CNXIT':      { name: 'NIFTY IT',     priority: false },
  '^CNXPHARMA':  { name: 'NIFTY PHARMA', priority: false },
  '^CNXAUTO':    { name: 'NIFTY AUTO',   priority: false },
  '^CNXFMCG':    { name: 'NIFTY FMCG',   priority: false },
  '^CNXMETAL':   { name: 'NIFTY METAL',  priority: false },
};

// Verdicts the screener treats as "actionable" — worth showing the person.
export const ACTIONABLE_VERDICTS = ['BUY', 'SELL', 'STRONG_MOVE_WEAK_VOLUME_UP', 'STRONG_MOVE_WEAK_VOLUME_DOWN', 'WATCH'];
export const NON_ACTIONABLE_VERDICTS = ['NO_SIGNAL', 'AVOID', 'AVOID_FAKE_SPIKE'];
