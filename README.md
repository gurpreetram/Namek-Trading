# TradeIQ India — React App

A real React app for live Indian intraday market data, built on Vite.
Connects to your own Cloudflare Worker (`namek-trading.gurpreetramdev2004.workers.dev`)
for all live data — no third-party CORS proxies.

## Run it locally

```
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

## Build for deployment

```
npm run build
```

This creates a `dist/` folder — that's what you deploy (e.g. drag-and-drop onto Netlify).

## Project structure

```
src/
  config/api.js          — Worker URL, refresh intervals, index symbol list
  hooks/
    useLiveQuotes.js      — live price polling for indices/stocks
    useMarketScan.js      — paginated full-market verification scan
  components/
    Topbar.jsx            — live Nifty/BankNifty/Sensex + market clock
    NavTabs.jsx            — tab navigation
    AIScreener.jsx         — verified BUY/SELL/WATCH picks from the scan engine
    IndicesPanel.jsx       — full index grid
    RiskManager.jsx        — position size calculator + trading rules
  utils/format.js          — shared number/verdict formatting helpers
  App.jsx                  — wires everything together
```

## What's real vs not yet built

- **Real, live, tested:** index/stock prices, the verification engine
  (RSI/VWAP/structure/fake-spike detection), the paginated market scanner.
- **Not yet built:** Sectors tab, News tab, Strategy Guide tab, and the
  Deep Analysis per-stock breakdown cards from the earlier HTML version —
  these existed in the single-file HTML version and can be ported into
  React components the same way as AIScreener/IndicesPanel/RiskManager,
  following the same pattern.

## Known limitations (same as the Worker backend)

- Cloudflare free tier: ~13.5% of daily quota used by 15-minute full scans —
  comfortable headroom, but don't drop the scan interval below a few minutes.
- The verification engine's score thresholds were tuned on synthetic test
  data and one real live test batch — they may need adjustment as you watch
  more real trading days play out.
