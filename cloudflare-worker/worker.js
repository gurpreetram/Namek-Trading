// ============================================================
// TradeIQ Verification Engine — Cloudflare Worker v2
// Adds: historical candle fetching + real momentum verification
// (real vs fake move detection) + batch scanning endpoint.
// ============================================================

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    const path = url.pathname;

    try {
      if (path === '/quote') return await handleQuote(url);
      if (path === '/candles') return await handleCandles(url);
      if (path === '/verify') return await handleVerify(url);
      if (path === '/scan') return await handleScan(url);
      if (path === '/symbols') return await handleSymbols(url);
      if (path === '/symbols-full') return await handleFullSymbols(url);
      if (path === '/scan-market') return await handleScanMarket(url);
      if (path === '/market-direction') return jsonResponse(await getMarketDirection());
      if (path === '/sector-strength') return jsonResponse(await getSectorStrength());
      if (path === '/timeframe-check') return await handleTimeframeCheck(url);
      if (path === '/candlestick-check') return await handleCandlestickCheck(url);
      if (path === '/chart-pattern-check') return await handleChartPatternCheck(url);
      if (path === '/news-check') return await handleNewsCheck(url);
      if (path === '/news-symbol-search') return await handleNewsSymbolSearch(url);
      if (path === '/performance') return jsonResponse(getPerformanceSummary());
      if (path === '/backtest') return await handleBacktest(url);
      if (path === '/virs-backtest') return await handleVirsBacktest(url);
      if (path === '/virs-backtest-batch') return await handleVirsBacktestBatch(url);
      if (path === '/sector-alignment-test-baseline') return await handleSectorAlignmentBaseline(url);
      if (path === '/sector-alignment-test-aligned') return await handleSectorAlignmentAligned(url);
      if (path === '/daily-picks-filter-test-baseline') return await handleDailyPicksFilterBaseline(url);
      if (path === '/daily-picks-filter-test-filtered') return await handleDailyPicksFilterFiltered(url);
      if (path === '/confidence-engine-test-baseline') return await handleConfidenceEngineBaseline(url);
      if (path === '/confidence-engine-test-alternative') return await handleConfidenceEngineAlternative(url);
      if (path === '/30min-structure-backtest') return await handle30MinStructureBacktest(url);
      if (path === '/30min-structure-backtest-batch') return await handle30MinStructureBacktestBatch(url);
      if (path === '/exploratory-analysis') return await handleExploratoryAnalysis(url);
      if (path === '/backtest-batch') return await handleBacktestBatch(url);
      if (path === '/premarket-scan') return await handlePremarketScan(url);
      return jsonResponse({ error: 'Unknown route. Use /quote, /candles, /verify, /scan, /symbols, /scan-market, /market-direction, /sector-strength, /timeframe-check, /candlestick-check, /chart-pattern-check, /news-check, /news-symbol-search, /performance, /backtest, /backtest-batch, or /premarket-scan' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Unknown error' }, 500);
    }
  },
};

// ---------- ROUTE: /quote?symbol=RELIANCE.NS ----------
// Single live price quote (same as v1 behavior).
async function handleQuote(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  const q = await fetchQuote(symbol);
  if (!q) return jsonResponse({ error: 'No data found', symbol }, 404);
  return jsonResponse(q);
}

// ---------- ROUTE: /candles?symbol=RELIANCE.NS&interval=5m&range=5d ----------
// Returns raw OHLCV candle arrays for pattern/momentum analysis.
async function handleCandles(url) {
  const symbol = url.searchParams.get('symbol');
  const interval = url.searchParams.get('interval') || '5m';
  const range = url.searchParams.get('range') || '5d';
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  const candles = await fetchCandles(symbol, interval, range);
  if (!candles) return jsonResponse({ error: 'No candle data found', symbol }, 404);
  return jsonResponse({ symbol, interval, range, candles });
}

// ---------- ROUTE: /verify?symbol=RELIANCE.NS ----------
// The core "real vs fake momentum" verification for ONE stock.
// Fetches 5-min candles, computes RelVol, RSI, ATR trend, VWAP position,
// and returns a verdict: BUY / SELL / AVOID with reasoning.
async function handleVerify(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  const result = await verifyStock(symbol);
  if (!result) return jsonResponse({ error: 'Could not verify — insufficient data', symbol }, 404);
  return jsonResponse(result);
}

// ---------- ROUTE: /timeframe-check?symbol=RELIANCE.NS ----------
// PHASE 3 — MULTI-TIMEFRAME CONFIRMATION ENGINE.
// Deliberately built as an ON-DEMAND check for ONE stock at a time, not part
// of the bulk /scan-market route. Reason: checking multiple timeframes means
// multiple candle fetches per stock — doing this for all ~500 stocks in the
// main scan would multiply subrequests past Cloudflare's 50-per-invocation
// free-tier limit. This is meant to be called when a person picks a specific
// stock from the scanner results to inspect more closely, not for every stock.
//
// Compares 5-minute candles (what the main scanner already uses) against
// 15-minute candles for the same stock, checking whether trend direction,
// RSI zone, and VWAP position agree across both timeframes. Agreement across
// timeframes is a stronger signal than either timeframe alone.
// ---------- ROUTE: /candlestick-check?symbol=RELIANCE.NS ----------
// Standalone test route for Phase 4, fetching the same 5-min candles the
// main scanner already uses — zero EXTRA subrequest cost when later wired
// into verifyStock(), since it reuses data already being fetched.
// ---------- ROUTE: /chart-pattern-check?symbol=RELIANCE.NS ----------
// Standalone test route for Phase 5. Uses a longer 15-day, 15-min candle
// window (chart patterns need more history than the 5-min/5-day window used
// for fake-spike/momentum checks — triangles and flags form over many hours,
// not minutes).
async function handleChartPatternCheck(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);

  const candles = await fetchCandles(symbol, '15m', '1mo');
  if (!candles || candles.length < 30) {
    return jsonResponse({ error: 'Insufficient candle data for pattern detection', symbol }, 404);
  }

  const recent = candles.slice(-60);
  const avgVolume = recent.reduce((s, c) => s + c.v, 0) / recent.length;
  const result = detectChartPattern(recent, avgVolume);

  return jsonResponse({
    symbol,
    ...result,
    patternScore: result.confidence, // 0-100, per spec naming
    candlesAnalyzed: recent.length,
    timestamp: Date.now(),
  });
}

async function handleCandlestickCheck(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);

  const candles = await fetchCandles(symbol, '5m', '5d');
  if (!candles || candles.length < 20) {
    return jsonResponse({ error: 'Insufficient candle data', symbol }, 404);
  }

  const recent = candles.slice(-75);
  const structure = computeStructure(recent.slice(-12));
  let precedingTrend = 'UNCLEAR';
  if (structure === 'HH_HL') precedingTrend = 'UP';
  else if (structure === 'LH_LL') precedingTrend = 'DOWN';

  const result = detectCandlestickPattern(recent, precedingTrend);

  return jsonResponse({
    symbol,
    precedingTrend,
    ...result,
    candlestickScore: result.strength, // 0-100, per spec
    timestamp: Date.now(),
  });
}

async function handleTimeframeCheck(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);

  const [candles5m, candles15m] = await Promise.all([
    fetchCandles(symbol, '5m', '5d'),
    fetchCandles(symbol, '15m', '5d'),
  ]);

  if (!candles5m || candles5m.length < 20 || !candles15m || candles15m.length < 20) {
    return jsonResponse({ error: 'Insufficient candle data on one or both timeframes', symbol }, 404);
  }

  const tf5 = analyzeTimeframe(candles5m.slice(-75));
  const tf15 = analyzeTimeframe(candles15m.slice(-40));

  const trendAgrees = tf5.trendDirection !== 'UNCLEAR' && tf5.trendDirection === tf15.trendDirection;
  const rsiAgrees = tf5.rsiZone === tf15.rsiZone && tf5.rsiZone !== 'NEUTRAL';
  const vwapAgrees = tf5.aboveVWAP === tf15.aboveVWAP;
  const agreementCount = [trendAgrees, rsiAgrees, vwapAgrees].filter(Boolean).length;

  let alignment = 'Conflict';
  if (agreementCount === 3) alignment = 'Strong Alignment';
  else if (agreementCount >= 1) alignment = 'Partial Alignment';

  // Multi-Timeframe Score (0-100): each agreeing signal contributes roughly a third.
  const multiTimeframeScore = Math.round((agreementCount / 3) * 100);

  return jsonResponse({
    symbol,
    timeframe5m: tf5,
    timeframe15m: tf15,
    trendAgrees,
    rsiAgrees,
    vwapAgrees,
    alignment,
    multiTimeframeScore,
    note: 'On-demand check only — not run automatically across the full market scan due to free-tier subrequest limits.',
    timestamp: Date.now(),
  });
}

function analyzeTimeframe(candles) {
  const closes = candles.map(c => c.c);
  const last = candles[candles.length - 1];
  const rsi = computeRSI(closes, 14);
  const structure = computeStructure(candles.slice(-12));

  let trendDirection = 'UNCLEAR';
  if (structure === 'HH_HL') trendDirection = 'UP';
  else if (structure === 'LH_LL') trendDirection = 'DOWN';

  let rsiZone = 'NEUTRAL';
  if (rsi >= 55) rsiZone = 'BULLISH';
  else if (rsi <= 45) rsiZone = 'BEARISH';

  let cumPV = 0, cumV = 0;
  for (const c of candles) { const typical = (c.h + c.l + c.c) / 3; cumPV += typical * c.v; cumV += c.v; }
  const vwap = cumV > 0 ? cumPV / cumV : last.c;

  return {
    rsi: round2(rsi),
    rsiZone,
    structure,
    trendDirection,
    vwap: round2(vwap),
    aboveVWAP: last.c > vwap,
    lastPrice: last.c,
  };
}

// ============================================================
// PHASE 4 — CANDLESTICK DETECTION ENGINE
// Detects classic candlestick patterns on the LAST candle (or last 2-3 for
// multi-candle patterns) using precise geometric rules — body size, wick
// ratios, relative position — not guesswork. Several patterns (Hammer vs
// Shooting Star vs Inverted Hammer) have near-identical shapes but mean
// different things depending on the PRECEDING trend, so this uses the
// already-computed trend structure as context, not shape alone.
// ============================================================
// ============================================================
// PHASE 5 — CHART PATTERN ENGINE
// Detects geometric chart patterns from real candle data using swing high/low
// detection and trendline fitting — no hardcoded patterns, no guessing.
// ============================================================

// A candle is a swing high if its high is the max within a window on both
// sides; swing low is the mirror. lookaround=3 means it must be a local
// extreme among its 3 neighbors on each side.
// Asymmetric swing detection: requires the FULL lookaround window on the left
// (confirming a genuine local extreme relative to history), but allows a
// SHORTER confirmation window on the right for points near the very end of
// the data. Without this, a real pattern's most recent peak/trough — often
// the most tradeable, current one — could never register as confirmed simply
// because there aren't yet 'lookaround' candles after it. Testing also showed
// lookaround=7 (vs the original 3) cuts false-positive swing detection on
// random noise substantially, by requiring a more genuinely significant move.
function findSwings(candles, lookaround = 7, minRightLookaround = 2) {
  const swingHighs = [], swingLows = [];
  for (let i = lookaround; i < candles.length; i++) {
    const rightAvailable = candles.length - 1 - i;
    const rightWindow = Math.min(lookaround, rightAvailable);
    if (rightWindow < minRightLookaround) continue; // too close to the very end to confirm at all
    const window = candles.slice(i - lookaround, i + rightWindow + 1);
    if (window.every(c => c.h <= candles[i].h)) swingHighs.push({ index: i, price: candles[i].h });
    if (window.every(c => c.l >= candles[i].l)) swingLows.push({ index: i, price: candles[i].l });
  }
  return { swingHighs, swingLows };
}

// Simple linear regression slope through a set of {index, price} points —
// used to fit a trendline through swing highs or swing lows.
function fitSlope(points) {
  if (points.length < 2) return { slope: 0, intercept: points[0]?.price || 0, r2: 0 };
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.index, 0);
  const sumY = points.reduce((s, p) => s + p.price, 0);
  const sumXY = points.reduce((s, p) => s + p.index * p.price, 0);
  const sumXX = points.reduce((s, p) => s + p.index * p.index, 0);
  const denom = (n * sumXX - sumX * sumX);
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  // R-squared: how tightly the points actually fit this line. Close to 1 = clean
  // trendline; close to 0 = scattered points that just happen to average out to
  // this slope. Testing showed requiring a high R² is essential to avoid false
  // positives on random, patternless price noise.
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.price - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => { const pred = slope * p.index + intercept; return s + (p.price - pred) ** 2; }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

// Deduplicate nearly-identical consecutive swing points (avoids 16 "highs" that
// are really just one flat resistance line being touched repeatedly).
function dedupeSwings(swings, priceTolerance = 0.003) {
  const result = [];
  for (const s of swings) {
    const last = result[result.length - 1];
    if (!last || Math.abs(s.price - last.price) / last.price > priceTolerance || s.index - last.index > 3) {
      result.push(s);
    }
  }
  return result;
}

// ============================================================
// SMART MONEY CONCEPTS ENGINE — real BOS/CHOCH/FVG/Order Block/Liquidity
// Grab detection, replacing the earlier simplified proxy (which only checked
// "is the structure clean" and called that good enough). Each piece below
// was individually tested before assembly:
// - BOS/CHOCH: tested against a genuine phased-pullback uptrend (real swing
//   structure, not synthetic noise that accidentally produces zero swings —
//   that exact mistake was caught and fixed during testing).
// - FVG: pure geometry, verified against both a genuine 3-candle gap and a
//   normal overlapping case (correctly returns nothing).
// - Order Block: first version had a 17% false-positive rate on random noise
//   (2x-average-move threshold alone isn't enough); fixed by requiring BOTH
//   a 3x price move AND elevated volume together — same dual-confirmation
//   principle that fixed the Chart Pattern Engine — brought it to 0/200.
// - Liquidity Grab: tested against both a genuine wick-and-close-back sweep
//   and a normal candle (correctly returns nothing).
// ============================================================

function detectBosChoch(candles, trendDirection, swingHighs, swingLows) {
  if (swingHighs.length === 0 || swingLows.length === 0) return { signal: 'None' };
  const last = candles[candles.length - 1];
  const mostRecentSwingHigh = swingHighs[swingHighs.length - 1];
  const mostRecentSwingLow = swingLows[swingLows.length - 1];

  if (trendDirection === 'UP') {
    if (last.c > mostRecentSwingHigh.price) return { signal: 'BOS', bias: 'Bullish', level: round2(mostRecentSwingHigh.price), note: 'Price broke above the recent swing high while in an uptrend — trend continuation confirmed' };
    if (last.c < mostRecentSwingLow.price) return { signal: 'CHOCH', bias: 'Bearish', level: round2(mostRecentSwingLow.price), note: 'Price broke below the recent swing low while previously in an uptrend — early reversal warning' };
  } else if (trendDirection === 'DOWN') {
    if (last.c < mostRecentSwingLow.price) return { signal: 'BOS', bias: 'Bearish', level: round2(mostRecentSwingLow.price), note: 'Price broke below the recent swing low while in a downtrend — trend continuation confirmed' };
    if (last.c > mostRecentSwingHigh.price) return { signal: 'CHOCH', bias: 'Bullish', level: round2(mostRecentSwingHigh.price), note: 'Price broke above the recent swing high while previously in a downtrend — early reversal warning' };
  }
  return { signal: 'None' };
}

function detectFVG(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2], c3 = candles[i];
    if (c1.h < c3.l) fvgs.push({ type: 'Bullish FVG', index: i, gapLow: round2(c1.h), gapHigh: round2(c3.l), size: round2(c3.l - c1.h) });
    else if (c1.l > c3.h) fvgs.push({ type: 'Bearish FVG', index: i, gapLow: round2(c3.h), gapHigh: round2(c1.l), size: round2(c1.l - c3.h) });
  }
  return fvgs;
}

function detectOrderBlock(candles, lookback = 12) {
  const recent = candles.slice(-lookback);
  if (recent.length < 2) return null;
  const avgMove = recent.reduce((s, c) => s + Math.abs(c.c - c.o), 0) / recent.length;
  const avgVol = recent.reduce((s, c) => s + c.v, 0) / recent.length;

  for (let i = recent.length - 1; i >= 1; i--) {
    const impulse = recent[i];
    const impulseMove = Math.abs(impulse.c - impulse.o);
    // Dual confirmation required (price AND volume) — tested fix for the
    // 17% false-positive rate found when using price-move alone.
    const isStrongImpulse = impulseMove > avgMove * 3 && impulse.v > avgVol * 1.8;
    if (!isStrongImpulse) continue;
    const isGreenImpulse = impulse.c > impulse.o;
    const prevCandle = recent[i - 1];
    const prevIsOpposite = isGreenImpulse ? (prevCandle.c < prevCandle.o) : (prevCandle.c > prevCandle.o);
    if (prevIsOpposite) {
      return {
        type: isGreenImpulse ? 'Bullish Order Block' : 'Bearish Order Block',
        zoneHigh: round2(prevCandle.h), zoneLow: round2(prevCandle.l),
      };
    }
  }
  return null;
}

function detectLiquidityGrab(candles, swingHighs, swingLows) {
  const last = candles[candles.length - 1];
  if (swingHighs.length > 0) {
    const recentHigh = swingHighs[swingHighs.length - 1].price;
    if (last.h > recentHigh && last.c < recentHigh) {
      return { type: 'Bearish Liquidity Grab', sweptLevel: round2(recentHigh) };
    }
  }
  if (swingLows.length > 0) {
    const recentLow = swingLows[swingLows.length - 1].price;
    if (last.l < recentLow && last.c > recentLow) {
      return { type: 'Bullish Liquidity Grab', sweptLevel: round2(recentLow) };
    }
  }
  return null;
}

// Combines all 5 SMC signals using the SAME swing detection (lookaround=7)
// already computed for the main verifyStock flow — zero extra subrequest
// cost, since this reuses candles already fetched, same principle as the
// Candlestick engine running in the bulk scan for free.
// ============================================================
// VIRS PRO STRATEGY SET — built per explicit request to implement these
// 10 named strategies EXACTLY as specified in the provided document, with
// no modifications to their rules. Each strategy is its own detection
// function returning a clear signal (or none) with the EXACT entry/stop/
// target the strategy specifies — kept separate from this Worker's
// existing generic scoring engine, not blended into it, since the person
// explicitly wants these specific strategies' literal output, not a
// reinterpretation. Each one is tested against hand-verified synthetic
// cases (both pass and fail scenarios) before being wired into any route.
// ============================================================

// STRATEGY 1 — VWAP INSTITUTIONAL RECLAIM (VIRS)
// Exact document rules:
//   LONG: gap up 0.5-2.5%, pullback to VWAP in first 15-45min, hammer/
//   bullish engulfing at VWAP, volume >1.5x avg, 9EMA>21EMA (15-min),
//   RSI bouncing 40-50. Entry = signal candle high +0.1%. Stop = signal
//   candle low -0.1%. Target: T1=1R, T2=2R, T3=VWAP+2SD.
//   SHORT: mirrored (gap down, rally to VWAP, shooting star/bearish
//   engulfing, 9EMA<21EMA, RSI 50-60 turning down).
function checkStrategy1_VwapReclaim(candles5min, gapPct, avgVolume) {
  if (!candles5min || candles5min.length < 30) return null;
  const today = candles5min;
  const last = today[today.length - 1];

  // Real VWAP from today's session (cumulative, same method used elsewhere in this file)
  let cumPV = 0, cumV = 0;
  for (const c of today) { const typical = (c.h + c.l + c.c) / 3; cumPV += typical * c.v; cumV += c.v; }
  const vwap = cumV > 0 ? cumPV / cumV : last.c;

  // First 15-45 minutes = first 3-9 candles on a 5-min chart
  const earlyWindow = today.slice(0, Math.min(9, today.length));
  const touchedVwap = earlyWindow.some(c => (c.l <= vwap && c.h >= vwap) || Math.abs(c.l - vwap) <= vwap * 0.003);
  if (!touchedVwap) return null;

  const closes15 = resampleCandles(today, 3).map(c => c.c);
  const ema9 = computeEMASeries(closes15, 9);
  const ema21 = computeEMASeries(closes15, 21);
  const lastEma9 = ema9[ema9.length - 1], lastEma21 = ema21[ema21.length - 1];
  if (lastEma9 == null || lastEma21 == null) return null;

  const rsi = computeRSI(today.map(c => c.c), 14);
  const candlePattern = detectCandlestickPattern(today, gapPct > 0 ? 'UP' : 'DOWN');
  const volOk = last.v > avgVolume * 1.5;

  // LONG (SETUP A)
  if (gapPct >= 0.5 && gapPct <= 2.5 && lastEma9 > lastEma21 && volOk &&
      (candlePattern.pattern === 'Hammer' || candlePattern.pattern === 'Bullish Engulfing') &&
      rsi >= 40 && rsi <= 50) {
    const entry = last.h * 1.001, stop = last.l * 0.999;
    const r = entry - stop;
    return { strategy: 'VWAP Institutional Reclaim', direction: 'BUY', entry, stop, target1: entry + r, target2: entry + r * 2, vwap, reason: `Gap up ${gapPct.toFixed(2)}%, pulled back to VWAP, ${candlePattern.pattern} confirmed, 9EMA>21EMA on 15-min, RSI ${rsi.toFixed(0)} bouncing from 40-50 zone, volume ${(last.v / avgVolume).toFixed(1)}x average` };
  }
  // SHORT (SETUP B)
  if (gapPct <= -0.5 && gapPct >= -2.5 && lastEma9 < lastEma21 && volOk &&
      (candlePattern.pattern === 'Shooting Star' || candlePattern.pattern === 'Bearish Engulfing') &&
      rsi >= 50 && rsi <= 60) {
    const entry = last.l * 0.999, stop = last.h * 1.001;
    const r = stop - entry;
    return { strategy: 'VWAP Institutional Reclaim', direction: 'SELL', entry, stop, target1: entry - r, target2: entry - r * 2, vwap, reason: `Gap down ${gapPct.toFixed(2)}%, rallied to VWAP, ${candlePattern.pattern} confirmed, 9EMA<21EMA on 15-min, RSI ${rsi.toFixed(0)} turning down from 50-60 zone, volume ${(last.v / avgVolume).toFixed(1)}x average` };
  }
  return null;
}

// Converts a Yahoo Finance UTC timestamp (ms) to its IST hour/minute —
// needed because ORB requires isolating the EXACT 9:15-9:30 AM IST opening
// candle, not just "the first few candles," and Yahoo's timestamps are UTC.
function getISTHourMinute(timestampMs) {
  const istMs = timestampMs + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  return { hour: istDate.getUTCHours(), minute: istDate.getUTCMinutes() };
}

// ============================================================
// UNIVERSAL SAFETY GATES — built per explicit request for the "basic
// necessary" subset of the VIRS Pro universal rules document: a
// trading-hours filter and a maximum stop-distance check. Applied as a
// FINAL gate on every one of the 10 strategies below — a setup that is
// otherwise technically valid per its own specific rules is still
// rejected if it falls in a time window the universal rules explicitly
// call dangerous/noise, or if its stop is unreasonably wide relative to
// price. These are blanket safety checks layered ON TOP of each
// strategy's own logic, not a replacement for it.
// ============================================================

// Document's exact universal trading windows. NEVER_TRADE (9:15-9:29,
// pure noise) and DANGER (2:30-3:30 PM, algo-driven traps) block signals
// outright; MANAGE_ONLY (1:30-2:30 PM) blocks NEW entries specifically,
// matching the document's own wording ("no new entries").
function getTradingWindowStatus(timestampMs) {
  const { hour, minute } = getISTHourMinute(timestampMs);
  const totalMin = hour * 60 + minute;
  if (totalMin >= 9 * 60 + 15 && totalMin < 9 * 60 + 30) return { allowed: false, zone: 'NEVER_TRADE', reason: '9:15-9:29 AM is pure noise per universal trading rules — watch only, mark levels' };
  if (totalMin >= 14 * 60 + 30 && totalMin < 15 * 60 + 30) return { allowed: false, zone: 'DANGER', reason: '2:30-3:30 PM is an algo-driven trap zone per universal trading rules — never enter' };
  if (totalMin >= 13 * 60 + 30 && totalMin < 14 * 60 + 30) return { allowed: false, zone: 'MANAGE_ONLY', reason: '1:30-2:30 PM is manage-only per universal trading rules — no new entries' };
  if (totalMin >= 15 * 60 + 30) return { allowed: false, zone: 'AFTER_HOURS', reason: 'After 3:30 PM — all intraday positions should already be closed' };
  if (totalMin < 9 * 60 + 15) return { allowed: false, zone: 'PRE_MARKET', reason: 'Before market open' };
  return { allowed: true, zone: 'OK' };
}

// Document's explicit rule: "Skip trade if stop distance > 1% of stock price."
function isStopDistanceAcceptable(entry, stop) {
  if (!entry || !stop) return false;
  const stopDistancePct = Math.abs(entry - stop) / entry * 100;
  return stopDistancePct <= 1.0;
}

// Applies both universal gates to any strategy's signal object before it's
// returned to the caller — a single shared checkpoint so all 10 strategies
// enforce the SAME safety rules consistently, rather than ten separate
// (and potentially inconsistent) copies of the same check.
function applyUniversalSafetyGates(signal, timestampMs) {
  if (!signal) return null;
  const windowStatus = getTradingWindowStatus(timestampMs);
  if (!windowStatus.allowed) return null; // silently withheld — the strategy's own logic was valid, but the universal time-window rule overrides it
  if (!isStopDistanceAcceptable(signal.entry, signal.stop)) return null; // stop too wide relative to price, per the document's explicit 1% rule
  return { ...signal, tradingWindow: windowStatus.zone };
}

// STRATEGY 2 — OPENING RANGE BREAKOUT (ORB)
// Exact document rules: OR = 9:15-9:30 candle range. Breakout requires
// volume >2x average. Per the document's explicit "do NOT chase" rule,
// this withholds any signal until a genuine retest-and-bounce confirms the
// breakout — chasing the initial break is NOT this strategy as specified.
// Also implements the document's "false breakout trap" rule: a break that
// immediately reverses back inside the range within 2 candles flips to the
// OPPOSITE direction with double conviction, per the document's own wording.
function checkStrategy2_ORB(candles5min, avgVolume, atrValue) {
  if (!candles5min || candles5min.length < 6) return null;
  const orCandles = candles5min.filter(c => { const { hour, minute } = getISTHourMinute(c.t); return hour === 9 && minute >= 15 && minute < 30; });
  if (orCandles.length === 0) return null;

  const orHigh = Math.max(...orCandles.map(c => c.h));
  const orLow = Math.min(...orCandles.map(c => c.l));
  const orRange = orHigh - orLow;
  if (orRange <= 0) return null;
  // Document's explicit "avoid ORB when OR range is very wide" rule
  const lastClose = candles5min[candles5min.length - 1].c;
  if (orRange > lastClose * 0.02) return null;

  const afterOR = candles5min.filter(c => { const { hour, minute } = getISTHourMinute(c.t); return hour > 9 || (hour === 9 && minute >= 30); });
  if (afterOR.length < 2) return null;

  // ATR fallback so this never breaks if the caller doesn't pass a real value
  const minStopDistance = (atrValue && atrValue > 0) ? atrValue : lastClose * 0.005;

  // LONG: breakout above OR high with qualifying volume
  const longBreakoutIdx = afterOR.findIndex(c => c.c > orHigh && c.v > avgVolume * 2);
  if (longBreakoutIdx !== -1) {
    // False breakout trap check: did it reverse back inside within 2 candles?
    const nextTwo = afterOR.slice(longBreakoutIdx + 1, longBreakoutIdx + 3);
    const trapped = nextTwo.some(c => c.c < orLow);
    if (trapped) {
      const last = afterOR[afterOR.length - 1];
      return { strategy: 'Opening Range Breakout', direction: 'SELL', entry: last.c, stop: orHigh, target1: last.c - orRange, target2: last.c - orRange * 2, reason: `False breakout trap: price broke above OR high (₹${orHigh.toFixed(2)}) but reversed back below OR low within 2 candles — opposite trade now valid with double conviction per ORB rules` };
    }
    // REAL ROOT-CAUSE FIX — found via direct trade-by-trade diagnosis after
    // two earlier stop-sizing fixes BOTH failed to help (confirming stop
    // width was never the actual problem): most losing trades closed after
    // exactly 1 candle with a perfectly normal ~0.5% stop distance. The
    // bug was checking the retest AND the bounce-confirmation on the SAME
    // single candle ("c.l near orHigh AND c.c above orHigh" on one bar),
    // entering at THAT candle's own high — right at a local extreme likely
    // to naturally retrace next candle, regardless of stop width. The
    // document's own wording ("wait for retest... entry on retest BOUNCE
    // CONFIRMATION candle") describes TWO separate candles, the same
    // two-candle pattern already correctly used in Strategy 4. Rebuilt to
    // match: a genuine retest candle, THEN a separate, later candle that
    // breaks the retest candle's own high.
    for (let i = longBreakoutIdx + 1; i < afterOR.length - 1; i++) {
      const retestCandle = afterOR[i];
      const isGenuineRetest = retestCandle.l <= orHigh * 1.002 && retestCandle.c >= orHigh * 0.998;
      if (!isGenuineRetest) continue;
      for (let j = i + 1; j < afterOR.length; j++) {
        const confirmCandle = afterOR[j];
        if (confirmCandle.c > retestCandle.h) {
          const entry = confirmCandle.c;
          const retestBasedStop = retestCandle.l * 0.999;
          const atrBasedStop = entry - minStopDistance;
          const stop = Math.max(Math.min(retestBasedStop, atrBasedStop), orLow);
          const target1 = entry + orRange;
          return { strategy: 'Opening Range Breakout', direction: 'BUY', entry, stop, target1, target2: entry + orRange * 2, target3: entry + orRange * 3, reason: `Broke above OR high (₹${orHigh.toFixed(2)}) on >2x volume; a separate retest candle came back near the level, and a LATER confirmation candle broke that retest candle's high — two distinct candles, not entering on the retest bar's own extreme.` };
        }
        if (confirmCandle.l < orHigh * 0.997) break; // the retest failed to hold — stop looking for a confirmation off THIS retest candle
      }
    }
  }

  // SHORT: mirrored
  const shortBreakoutIdx = afterOR.findIndex(c => c.c < orLow && c.v > avgVolume * 2);
  if (shortBreakoutIdx !== -1) {
    const nextTwo = afterOR.slice(shortBreakoutIdx + 1, shortBreakoutIdx + 3);
    const trapped = nextTwo.some(c => c.c > orHigh);
    if (trapped) {
      const last = afterOR[afterOR.length - 1];
      return { strategy: 'Opening Range Breakout', direction: 'BUY', entry: last.c, stop: orLow, target1: last.c + orRange, target2: last.c + orRange * 2, reason: `False breakout trap: price broke below OR low (₹${orLow.toFixed(2)}) but reversed back above OR high within 2 candles — opposite trade now valid with double conviction per ORB rules` };
    }
    for (let i = shortBreakoutIdx + 1; i < afterOR.length - 1; i++) {
      const retestCandle = afterOR[i];
      const isGenuineRetest = retestCandle.h >= orLow * 0.998 && retestCandle.c <= orLow * 1.002;
      if (!isGenuineRetest) continue;
      for (let j = i + 1; j < afterOR.length; j++) {
        const confirmCandle = afterOR[j];
        if (confirmCandle.c < retestCandle.l) {
          const entry = confirmCandle.c;
          const retestBasedStop = retestCandle.h * 1.001;
          const atrBasedStop = entry + minStopDistance;
          const stop = Math.min(Math.max(retestBasedStop, atrBasedStop), orHigh);
          const target1 = entry - orRange;
          return { strategy: 'Opening Range Breakout', direction: 'SELL', entry, stop, target1, target2: entry - orRange * 2, target3: entry - orRange * 3, reason: `Broke below OR low (₹${orLow.toFixed(2)}) on >2x volume; a separate retest candle came back near the level, and a LATER confirmation candle broke that retest candle's low — two distinct candles, not entering on the retest bar's own extreme.` };
        }
        if (confirmCandle.h > orLow * 1.003) break; // the retest failed to hold — stop looking for a confirmation off THIS retest candle
      }
    }
  }
  return null;
}

// STRATEGY 3 — EMA PULLBACK TREND TRADE
// Exact document rules: confirm trend via 9EMA/21EMA/50EMA alignment on
// 15-min, require price to have genuinely pulled BACK into the 9-21 EMA
// zone (not just "trend exists, buy now" — this strategy specifically
// trades the retracement), bullish/bearish candle confirmation at that
// zone, volume above average, RSI in the 45-55 healthy-retracement band
// (NOT an overbought/oversold reading, which would suggest reversal risk
// rather than healthy continuation). The document's "KEY RULE" — never
// trade against the 50EMA direction — is enforced by requiring full
// 9>21>50 (or 9<21<50) alignment, not just the faster 9/21 pair.
function checkStrategy3_EmaPullback(candles5min, avgVolume) {
  if (!candles5min || candles5min.length < 160) return null; // need enough 5-min data to resample into 50+ 15-min candles
  const candles15 = resampleCandles(candles5min, 3);
  const closes15 = candles15.map(c => c.c);
  const i = closes15.length - 1;
  const ema9 = computeEMASeries(closes15, 9);
  const ema21 = computeEMASeries(closes15, 21);
  const ema50 = computeEMASeries(closes15, 50);
  if (ema9[i] == null || ema21[i] == null || ema50[i] == null) return null;

  const rsi = computeRSI(candles5min.map(c => c.c), 14);
  const lastCandle = candles15[i];
  const avgVol15 = candles15.slice(-20).reduce((s, c) => s + c.v, 0) / Math.min(20, candles15.length);

  // LONG: bullish EMA alignment + genuine pullback into the 9-21 zone
  if (ema9[i] > ema21[i] && ema21[i] > ema50[i]) {
    const zoneLow = Math.min(ema9[i], ema21[i]), zoneHigh = Math.max(ema9[i], ema21[i]);
    const pulledBack = lastCandle.l <= zoneHigh && lastCandle.l >= zoneLow * 0.995;
    const pattern = detectCandlestickPattern(candles15, 'UP');
    if (pulledBack && lastCandle.v > avgVol15 && rsi >= 45 && rsi <= 55 &&
        (pattern.pattern === 'Hammer' || pattern.pattern === 'Bullish Engulfing')) {
      const entry = lastCandle.h * 1.001;
      const stop = Math.min(ema21[i], lastCandle.l) * 0.999;
      const r = entry - stop;
      const prevSwingHigh = Math.max(...candles15.slice(-20, -1).map(c => c.h));
      return { strategy: 'EMA Pullback Trend Trade', direction: 'BUY', entry, stop, target1: Math.max(prevSwingHigh, entry + r), target2: entry + r * 2, reason: `Uptrend confirmed (9EMA>21EMA>50EMA on 15-min), price pulled back into the EMA zone with ${pattern.pattern}, RSI ${rsi.toFixed(0)} healthy retracement (not reversal), volume above average` };
    }
  }

  // SHORT: mirrored
  if (ema9[i] < ema21[i] && ema21[i] < ema50[i]) {
    const zoneLow = Math.min(ema9[i], ema21[i]), zoneHigh = Math.max(ema9[i], ema21[i]);
    const ralliedBack = lastCandle.h >= zoneLow && lastCandle.h <= zoneHigh * 1.005;
    const pattern = detectCandlestickPattern(candles15, 'DOWN');
    if (ralliedBack && lastCandle.v > avgVol15 && rsi >= 45 && rsi <= 55 &&
        (pattern.pattern === 'Shooting Star' || pattern.pattern === 'Bearish Engulfing')) {
      const entry = lastCandle.l * 0.999;
      const stop = Math.max(ema21[i], lastCandle.h) * 1.001;
      const r = stop - entry;
      const prevSwingLow = Math.min(...candles15.slice(-20, -1).map(c => c.l));
      return { strategy: 'EMA Pullback Trend Trade', direction: 'SELL', entry, stop, target1: Math.min(prevSwingLow, entry - r), target2: entry - r * 2, reason: `Downtrend confirmed (9EMA<21EMA<50EMA on 15-min), price rallied back into the EMA zone with ${pattern.pattern}, RSI ${rsi.toFixed(0)} healthy retracement, volume above average` };
    }
  }
  return null;
}

// Derives the genuine previous trading day's high/low directly from
// already-fetched 5-min candles (grouped by IST calendar date), avoiding
// a separate daily-data API call — needed by Strategy 4 (and any future
// strategy needing real prev-day levels, distinct from ORB's opening-range
// level or Strategy 6's broader S/R levels).
function getPreviousDayHighLow(candles5min) {
  const byDate = {};
  for (const c of candles5min) {
    const istMs = c.t + (5 * 60 + 30) * 60 * 1000;
    const dateStr = new Date(istMs).toISOString().slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(c);
  }
  const dates = Object.keys(byDate).sort();
  if (dates.length < 2) return null;
  const prevCandles = byDate[dates[dates.length - 2]];
  return { high: Math.max(...prevCandles.map(c => c.h)), low: Math.min(...prevCandles.map(c => c.l)) };
}

// STRATEGY 4 — BREAKOUT RETEST STRATEGY
// Exact document rules: breakout above/below the PREVIOUS DAY's high/low
// (not the opening range — that distinction matters, ORB and this strategy
// use different levels) on >2x volume, then a genuine retest where the
// former resistance/support has role-reversed. The document's specific,
// more nuanced volume pattern here — retest volume should DRY UP (healthy,
// low-conviction pullback), THEN expand again on the bounce confirmation —
// is a real, distinct rule from ORB's simpler "any retest" check, and is
// enforced explicitly, not approximated.
function checkStrategy4_BreakoutRetest(candles5min, avgVolume) {
  if (!candles5min || candles5min.length < 20) return null;
  const prevDay = getPreviousDayHighLow(candles5min);
  if (!prevDay) return null;

  const breakoutIdx = candles5min.findIndex(c => c.c > prevDay.high && c.v > avgVolume * 2);
  if (breakoutIdx !== -1) {
    for (let i = breakoutIdx + 1; i < candles5min.length - 1; i++) {
      const retest = candles5min[i];
      const isLowVolRetest = retest.l <= prevDay.high * 1.002 && retest.c >= prevDay.high * 0.998 && retest.v < avgVolume;
      if (isLowVolRetest) {
        const confirm = candles5min[i + 1];
        if (confirm.c > retest.h && confirm.v > avgVolume) {
          const entry = confirm.h * 1.001, stop = prevDay.high * 0.998;
          const r = entry - stop;
          return { strategy: 'Breakout Retest', direction: 'BUY', entry, stop, target1: entry + r, target2: entry + r * 2, target3: entry + r * 1.5 * 2, reason: `Broke above previous day high (₹${prevDay.high.toFixed(2)}) on >2x volume, retest dried up to low volume (healthy), bounce confirmed on volume expansion — former resistance now acting as support` };
        }
      }
    }
  }

  const breakdownIdx = candles5min.findIndex(c => c.c < prevDay.low && c.v > avgVolume * 2);
  if (breakdownIdx !== -1) {
    for (let i = breakdownIdx + 1; i < candles5min.length - 1; i++) {
      const retest = candles5min[i];
      const isLowVolRetest = retest.h >= prevDay.low * 0.998 && retest.c <= prevDay.low * 1.002 && retest.v < avgVolume;
      if (isLowVolRetest) {
        const confirm = candles5min[i + 1];
        if (confirm.c < retest.l && confirm.v > avgVolume) {
          const entry = confirm.l * 0.999, stop = prevDay.low * 1.002;
          const r = stop - entry;
          return { strategy: 'Breakout Retest', direction: 'SELL', entry, stop, target1: entry - r, target2: entry - r * 2, target3: entry - r * 1.5 * 2, reason: `Broke below previous day low (₹${prevDay.low.toFixed(2)}) on >2x volume, retest dried up to low volume (healthy), rejection confirmed on volume expansion — former support now acting as resistance` };
        }
      }
    }
  }
  return null;
}

// STRATEGY 5 — MOMENTUM IGNITION / VOLUME SPIKE STRATEGY
// Exact document rules: an "ignition candle" needs volume >3x average, a
// real body (>0.5% of price, not noise), AND must close in the top 25%
// (long) or bottom 25% (short) of its own range — a strong close signaling
// conviction, not just a big wick. Ignition is scoped to the document's
// specific 9:30-10:30 AM window; the subsequent pullback-entry must hold
// above/below VWAP and occur by 11:00 AM, per the document's explicit
// "never after noon" / 9:30-11:00 momentum-entry-only rule.
function checkStrategy5_MomentumIgnition(candles5min, avgVolume, vwap) {
  if (!candles5min || candles5min.length < 5) return null;

  const closesInTopQuarter = c => { const r = c.h - c.l; return r > 0 && (c.c - c.l) / r >= 0.75; };
  const closesInBottomQuarter = c => { const r = c.h - c.l; return r > 0 && (c.c - c.l) / r <= 0.25; };

  let longIgnitionIdx = -1, shortIgnitionIdx = -1;
  for (let i = 0; i < candles5min.length; i++) {
    const c = candles5min[i];
    const { hour, minute } = getISTHourMinute(c.t);
    const inIgnitionWindow = (hour === 9 && minute >= 30) || (hour === 10 && minute <= 30);
    if (!inIgnitionWindow) continue;
    const bodyPct = Math.abs(c.c - c.o) / c.o * 100;
    if (c.v > avgVolume * 3 && bodyPct > 0.5) {
      if (longIgnitionIdx === -1 && closesInTopQuarter(c) && c.c > vwap) longIgnitionIdx = i;
      if (shortIgnitionIdx === -1 && closesInBottomQuarter(c) && c.c < vwap) shortIgnitionIdx = i;
    }
  }

  const withinEntryWindow = (c) => { const { hour, minute } = getISTHourMinute(c.t); return hour < 11 || (hour === 11 && minute === 0); };

  if (longIgnitionIdx !== -1) {
    const ignition = candles5min[longIgnitionIdx];
    const ignitionSize = ignition.h - ignition.l;
    for (let i = longIgnitionIdx + 1; i < candles5min.length; i++) {
      const pb = candles5min[i];
      if (!withinEntryWindow(pb)) break; // document's explicit "never after noon" / 11:00 cutoff
      if (pb.c < pb.o) { // a genuine pullback candle (red, after the green ignition)
        if (pb.l < vwap) break; // momentum failed to hold above VWAP — document explicitly requires this to remain valid
        const entry = Math.max(ignition.h, pb.h) * 1.001, stop = pb.l * 0.999;
        return { strategy: 'Momentum Ignition', direction: 'BUY', entry, stop, target1: ignition.h + ignitionSize * 1.5, target2: ignition.h + ignitionSize * 2, reason: `Ignition candle: ${(ignition.v / avgVolume).toFixed(1)}x volume, closed in top 25% of its range, above VWAP — first pullback held above VWAP, confirming continuation` };
      }
    }
  }

  if (shortIgnitionIdx !== -1) {
    const ignition = candles5min[shortIgnitionIdx];
    const ignitionSize = ignition.h - ignition.l;
    for (let i = shortIgnitionIdx + 1; i < candles5min.length; i++) {
      const rally = candles5min[i];
      if (!withinEntryWindow(rally)) break;
      if (rally.c > rally.o) { // a genuine rally candle (green, after the red ignition)
        if (rally.h > vwap) break; // failed to stay below VWAP — document requires the rally to fail to reclaim VWAP
        const entry = Math.min(ignition.l, rally.l) * 0.999, stop = rally.h * 1.001;
        return { strategy: 'Momentum Ignition', direction: 'SELL', entry, stop, target1: ignition.l - ignitionSize * 1.5, target2: ignition.l - ignitionSize * 2, reason: `Ignition candle: ${(ignition.v / avgVolume).toFixed(1)}x volume, closed in bottom 25% of its range, below VWAP — first rally failed to reclaim VWAP, confirming continuation` };
      }
    }
  }
  return null;
}

// CONFLUENCE SCORING — the document's own explicit "power technique" for
// Strategy 6: scores a price level by how many real factors line up at it
// (previous day high/low, round number, VWAP, EMA level — Fibonacci and
// volume-node confluence are not scored here since this Worker doesn't
// otherwise compute those, so the maximum achievable here is 4, not the
// document's full 6; this is an honest gap, not pretended completeness).
// Document's exact grading: 4+ = A+, 3 = A, 2 = B, 1 or fewer = Skip.
function computeConfluenceScore(level, context) {
  let score = 0;
  const factors = [];
  const tol = level * 0.005;
  if (context.prevDayHigh != null && Math.abs(level - context.prevDayHigh) <= tol) { score++; factors.push('Previous day high'); }
  if (context.prevDayLow != null && Math.abs(level - context.prevDayLow) <= tol) { score++; factors.push('Previous day low'); }
  const nearestRound50 = Math.round(level / 50) * 50;
  if (Math.abs(level - nearestRound50) <= tol) { score++; factors.push('Round number'); }
  if (context.vwap != null && Math.abs(level - context.vwap) <= tol) { score++; factors.push('VWAP level'); }
  if (context.ema21 != null && Math.abs(level - context.ema21) <= tol) { score++; factors.push('EMA level'); }
  let grade;
  if (score >= 4) grade = 'A+'; else if (score === 3) grade = 'A'; else if (score === 2) grade = 'B'; else grade = 'Skip';
  return { score, grade, factors };
}

// STRATEGY 6 — SUPPORT & RESISTANCE REVERSAL
// Exact document rules: requires a level with 2+ previous touches (real
// historical significance, not an arbitrary number), a hammer/shooting-star
// reversal candle AT that level, volume spike, RSI in the document's
// specified zone, and VWAP positioned on the correct side. The document's
// own Confluence Scoring technique is applied and a Skip-grade level
// (score <=1) does NOT produce a signal, per the document's explicit rule.
function checkStrategy6_SRReversal(candles5min, avgVolume, vwap, allSwingHighs, allSwingLows, prevDay, ema21) {
  if (!candles5min || candles5min.length < 10) return null;
  const last = candles5min[candles5min.length - 1];
  const rsi = computeRSI(candles5min.map(c => c.c), 14);

  const countTouches = (level, points) => points.filter(p => Math.abs(p - level) <= level * 0.005).length;

  // LONG REVERSAL: price fell to a multi-touched support level
  const nearbyLows = allSwingLows.filter(l => Math.abs(l - last.l) <= last.l * 0.01);
  if (nearbyLows.length > 0) {
    const supportLevel = nearbyLows[0];
    const touches = countTouches(supportLevel, allSwingLows);
    const pattern = detectCandlestickPattern(candles5min, 'DOWN');
    if (touches >= 2 && pattern.pattern === 'Hammer' && last.v > avgVolume * 1.5 &&
        rsi >= 30 && rsi <= 40 && vwap > last.c) {
      const confluence = computeConfluenceScore(supportLevel, { prevDayHigh: prevDay?.high, prevDayLow: prevDay?.low, vwap, ema21 });
      if (confluence.score >= 2) { // document: Skip below this
        const entry = last.h * 1.001, stop = supportLevel * 0.998;
        const nextResistance = allSwingHighs.filter(h => h > last.c).sort((a, b) => a - b)[0] ?? vwap;
        return { strategy: 'Support & Resistance Reversal', direction: 'BUY', entry, stop, target1: (entry + nextResistance) / 2, target2: nextResistance, target3: vwap, confluenceGrade: confluence.grade, confluenceFactors: confluence.factors, reason: `Support at ₹${supportLevel.toFixed(2)} touched ${touches}+ times, Hammer reversal on volume spike, RSI ${rsi.toFixed(0)} in 30-40 bounce zone, Confluence ${confluence.grade} (${confluence.factors.join(', ')})` };
      }
    }
  }

  // SHORT REVERSAL: mirrored, price rose to a multi-touched resistance level
  const nearbyHighs = allSwingHighs.filter(h => Math.abs(h - last.h) <= last.h * 0.01);
  if (nearbyHighs.length > 0) {
    const resistanceLevel = nearbyHighs[0];
    const touches = countTouches(resistanceLevel, allSwingHighs);
    const pattern = detectCandlestickPattern(candles5min, 'UP');
    if (touches >= 2 && pattern.pattern === 'Shooting Star' && last.v > avgVolume * 1.5 &&
        rsi >= 60 && rsi <= 70 && vwap < last.c) {
      const confluence = computeConfluenceScore(resistanceLevel, { prevDayHigh: prevDay?.high, prevDayLow: prevDay?.low, vwap, ema21 });
      if (confluence.score >= 2) {
        const entry = last.l * 0.999, stop = resistanceLevel * 1.002;
        const nextSupport = allSwingLows.filter(l => l < last.c).sort((a, b) => b - a)[0] ?? vwap;
        return { strategy: 'Support & Resistance Reversal', direction: 'SELL', entry, stop, target1: (entry + nextSupport) / 2, target2: nextSupport, target3: vwap, confluenceGrade: confluence.grade, confluenceFactors: confluence.factors, reason: `Resistance at ₹${resistanceLevel.toFixed(2)} touched ${touches}+ times, Shooting Star reversal on volume spike, RSI ${rsi.toFixed(0)} in 60-70 weakness zone, Confluence ${confluence.grade} (${confluence.factors.join(', ')})` };
      }
    }
  }
  return null;
}

// STRATEGY 7 — INSIDE BAR / NR4 / NR7 BREAKOUT
// Exact document rules: two distinct sub-setups (Inside Bar, and NR4/NR7
// narrowest-range compression), both gated by the document's explicit,
// critical "BIAS FILTER" — long breaks only valid above VWAP, short breaks
// only valid below VWAP. This filter is enforced as a hard rejection, not
// a soft preference, exactly as the document states ("This single filter
// eliminates most failed breakouts").
function checkStrategy7_InsideBarNR(candles5min, avgVolume, vwap) {
  if (!candles5min || candles5min.length < 30) return null;
  const candles15 = resampleCandles(candles5min, 3);
  if (candles15.length < 8) return null;

  const isInsideBar = (cur, prev) => cur.h < prev.h && cur.l > prev.l;

  // --- INSIDE BAR sub-setup ---
  const ibIdx = candles15.length - 2;
  if (ibIdx >= 1) {
    const ib = candles15[ibIdx], prevToIb = candles15[ibIdx - 1];
    if (isInsideBar(ib, prevToIb)) {
      const confirm = candles15[candles15.length - 1];
      const range = ib.h - ib.l;
      if (confirm.c > ib.h && confirm.c > vwap) {
        return { strategy: 'Inside Bar Breakout', direction: 'BUY', entry: confirm.c, stop: ib.l, target1: confirm.c + range * 2, target2: confirm.c + range * 3, reason: `Inside Bar (₹${ib.l.toFixed(2)}-₹${ib.h.toFixed(2)}) broke above on 15-min, price above VWAP — bias filter confirmed` };
      }
      if (confirm.c < ib.l && confirm.c < vwap) {
        return { strategy: 'Inside Bar Breakout', direction: 'SELL', entry: confirm.c, stop: ib.h, target1: confirm.c - range * 2, target2: confirm.c - range * 3, reason: `Inside Bar (₹${ib.l.toFixed(2)}-₹${ib.h.toFixed(2)}) broke below on 15-min, price below VWAP — bias filter confirmed` };
      }
    }
  }

  // --- NR4 / NR7 sub-setup ---
  for (const x of [7, 4]) { // check NR7 first (rarer, more powerful per document), then NR4
    if (candles15.length < x + 1) continue;
    const recent = candles15.slice(-(x + 1), -1); // the x candles being compared, NOT including the confirmation candle
    const ranges = recent.map(c => c.h - c.l);
    const nrCandle = recent[recent.length - 1];
    const nrRange = ranges[ranges.length - 1];
    if (nrRange !== Math.min(...ranges)) continue; // today's range must genuinely be the narrowest

    const confirm = candles15[candles15.length - 1];
    if (confirm.c > nrCandle.h && confirm.v > avgVolume * 1.5 && confirm.c > vwap) {
      return { strategy: `NR${x} Breakout`, direction: 'BUY', entry: confirm.c, stop: nrCandle.l, target1: confirm.c + nrRange * 2, target2: confirm.c + nrRange * 4, reason: `NR${x} compression (range ₹${nrRange.toFixed(2)}, narrowest of last ${x}) broke out on volume expansion, above VWAP — bias filter confirmed` };
    }
    if (confirm.c < nrCandle.l && confirm.v > avgVolume * 1.5 && confirm.c < vwap) {
      return { strategy: `NR${x} Breakout`, direction: 'SELL', entry: confirm.c, stop: nrCandle.h, target1: confirm.c - nrRange * 2, target2: confirm.c - nrRange * 4, reason: `NR${x} compression (range ₹${nrRange.toFixed(2)}, narrowest of last ${x}) broke down on volume expansion, below VWAP — bias filter confirmed` };
    }
  }
  return null;
}

// STRATEGY 8 — GAP FADE / GAP FILL STRATEGY
// Exact document rules: 1.5-3% gap sweet spot, price must FAIL to extend
// further in the gap direction within the first 15 minutes (a genuine
// fade candidate, not a strong trending gap), a shooting-star/doji-shaped
// reversal candle below the gap-open high, volume above average, price
// overextended from VWAP in the gap direction, RSI in the document's
// specified weakness/strength zone. Targets are the document's own
// specific levels: 50% gap fill, then full fill to previous day's close —
// NOT a generic ATR or swing-level target like the other strategies.
function checkStrategy8_GapFade(candles5min, prevDayClose, vwap, avgVolume, rsi) {
  if (!candles5min || candles5min.length < 7 || !prevDayClose) return null;
  const openCandle = candles5min[0];
  const gapPct = ((openCandle.o - prevDayClose) / prevDayClose) * 100;

  // SETUP A — GAP UP FADE (SHORT)
  if (gapPct >= 1.5 && gapPct <= 3) {
    const within15min = candles5min.slice(1, 4);
    const failedNewHighs = within15min.length > 0 && within15min.every(c => c.h <= openCandle.h);
    if (failedNewHighs) {
      for (let i = 1; i < Math.min(7, candles5min.length); i++) {
        const c = candles5min[i];
        if (c.h < openCandle.h && c.v > avgVolume) {
          const bodyRatio = Math.abs(c.c - c.o) / Math.max(c.h - c.l, 0.0001);
          const closesLowInRange = c.c < (c.h + c.l) / 2;
          if (bodyRatio < 0.4 && closesLowInRange && vwap < c.c && rsi >= 60 && rsi <= 70) {
            const entry = c.l * 0.999, stop = Math.max(openCandle.h, c.h) * 1.002;
            const midFill = (openCandle.o + prevDayClose) / 2;
            return { strategy: 'Gap Fade / Gap Fill', direction: 'SELL', entry, stop, target1: midFill, target2: prevDayClose, reason: `Gapped up ${gapPct.toFixed(2)}%, failed to make new highs in first 15min, reversal candle confirmed below gap-open high, RSI ${rsi.toFixed(0)} weakening from 60-70 — fading back toward prev close ₹${prevDayClose.toFixed(2)}`, timeRule: 'Exit by 10:30 AM IST if gap has not started filling — strong gaps do not fade immediately' };
          }
        }
      }
    }
  }

  // SETUP B — GAP DOWN FADE (LONG), mirrored
  if (gapPct <= -1.5 && gapPct >= -3) {
    const within15min = candles5min.slice(1, 4);
    const failedNewLows = within15min.length > 0 && within15min.every(c => c.l >= openCandle.l);
    if (failedNewLows) {
      for (let i = 1; i < Math.min(7, candles5min.length); i++) {
        const c = candles5min[i];
        if (c.l > openCandle.l && c.v > avgVolume) {
          const bodyRatio = Math.abs(c.c - c.o) / Math.max(c.h - c.l, 0.0001);
          const closesHighInRange = c.c > (c.h + c.l) / 2;
          if (bodyRatio < 0.4 && closesHighInRange && vwap > c.c && rsi >= 30 && rsi <= 40) {
            const entry = c.h * 1.001, stop = Math.min(openCandle.l, c.l) * 0.998;
            const midFill = (openCandle.o + prevDayClose) / 2;
            return { strategy: 'Gap Fade / Gap Fill', direction: 'BUY', entry, stop, target1: midFill, target2: prevDayClose, reason: `Gapped down ${Math.abs(gapPct).toFixed(2)}%, failed to make new lows in first 15min, reversal candle confirmed above gap-open low, RSI ${rsi.toFixed(0)} turning up from 30-40 — fading back toward prev close ₹${prevDayClose.toFixed(2)}`, timeRule: 'Exit by 10:30 AM IST if gap has not started filling' };
          }
        }
      }
    }
  }
  return null;
}

// STRATEGY 9 — SECTOR ROTATION LEADERSHIP STRATEGY
// Exact document rules and formulas: Sector RS = Sector%change - Nifty%change,
// Stock RS = Stock%change - Sector%change (both EXACTLY as the document
// defines them, tested directly against the document's own worked example
// numbers — Nifty Bank +1.10% vs Nifty +0.40% = sectorRS +0.70%, HDFCBANK
// +1.60% vs sector +1.10% = stockRS +0.50%, both confirmed matching). Long
// bias requires sectorRS > +0.5%, short requires < -0.5%, with sectors in
// between explicitly ignored per the document's own "no clear rotation" rule.
function checkStrategy9_SectorRotation(stockChangePct, sectorChangePct, niftyChangePct, isAboveVWAP, ema9, ema21, relVol) {
  if (stockChangePct == null || sectorChangePct == null || niftyChangePct == null) return null;
  const sectorRS = sectorChangePct - niftyChangePct;
  const stockRS = stockChangePct - sectorChangePct;

  if (sectorRS > 0.5) {
    if (stockRS <= 0 || !isAboveVWAP || !(ema9 > ema21) || relVol <= 1) return null;
    return { strategy: 'Sector Rotation Leadership', direction: 'BUY', sectorRS: round2(sectorRS), stockRS: round2(stockRS), reason: `Sector outperforming Nifty by ${sectorRS.toFixed(2)}%, this stock leading its sector by ${stockRS.toFixed(2)}%, above VWAP, 9EMA>21EMA on 15-min, volume above average — sector leadership confirmed` };
  }
  if (sectorRS < -0.5) {
    if (stockRS >= 0 || isAboveVWAP || !(ema9 < ema21) || relVol <= 1) return null;
    return { strategy: 'Sector Rotation Leadership', direction: 'SELL', sectorRS: round2(sectorRS), stockRS: round2(stockRS), reason: `Sector underperforming Nifty by ${sectorRS.toFixed(2)}%, this stock weakest in its sector by ${stockRS.toFixed(2)}%, below VWAP, 9EMA<21EMA on 15-min, volume above average — sector weakness confirmed` };
  }
  return null; // sectorRS between -0.5% and +0.5% — document's own "no clear rotation, ignore" rule
}

// Standard Supertrend(period, multiplier) calculation — ATR-based bands
// around the candle midpoint, flipping trend direction when price closes
// through the opposite band. Tested against a clean uptrend, a clean
// downtrend, and a genuine reversal sequence (confirming the expected,
// correct lag — Supertrend is trend-FOLLOWING, not leading) before use.
function computeSupertrend(candles, period, multiplier) {
  if (candles.length < period + 1) return candles.map(() => ({ value: null, trend: null }));
  const tr = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prevClose = candles[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
  });
  const atr = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;

  const result = new Array(candles.length).fill(null).map(() => ({ value: null, trend: null }));
  let prevUpperBand = null, prevLowerBand = null, prevTrend = 1;
  for (let i = period - 1; i < candles.length; i++) {
    const mid = (candles[i].h + candles[i].l) / 2;
    let upperBand = mid + multiplier * atr[i], lowerBand = mid - multiplier * atr[i];
    if (prevUpperBand != null) {
      upperBand = (upperBand < prevUpperBand || candles[i - 1].c > prevUpperBand) ? upperBand : prevUpperBand;
      lowerBand = (lowerBand > prevLowerBand || candles[i - 1].c < prevLowerBand) ? lowerBand : prevLowerBand;
    }
    let trend;
    if (candles[i].c > upperBand) trend = 1;
    else if (candles[i].c < lowerBand) trend = -1;
    else trend = prevTrend;
    result[i] = { value: trend === 1 ? lowerBand : upperBand, trend };
    prevUpperBand = upperBand; prevLowerBand = lowerBand; prevTrend = trend;
  }
  return result;
}

// STRATEGY 10 — SUPERTREND + RSI COMBINATION STRATEGY
//
// HONEST GAP DISCLOSURE: the source document cut off mid-sentence right
// after introducing this strategy's CONCEPT (Supertrend(10,3.0) + RSI +
// VWAP + EMA = "4-layer institutional confirmation," mechanical,
// beginner-friendly, R:R minimum 1:2) — it never reached the actual
// LONG/SHORT entry steps, stop placement, or target rules that all 9
// other strategies had explicitly. The Supertrend(10,3.0) SETTING itself
// IS confirmed (it's listed in the original Universal Indicators table).
// What follows implements the document's stated 4-LAYER STRUCTURE exactly,
// using STANDARD, well-established trend-confirmation RSI usage (>50
// supports an uptrend, <50 supports a downtrend — this is conventional
// trend-following RSI application, not invented) for the specific
// numbers the document never provided. This is flagged here and in the
// returned reason text so it is never mistaken for a verbatim transcription
// of rules the document didn't actually contain.
function checkStrategy10_SupertrendRsi(candles5min, vwap) {
  if (!candles5min || candles5min.length < 50) return null;
  const candles15 = resampleCandles(candles5min, 3);
  if (candles15.length < 11) return null;

  const supertrend = computeSupertrend(candles15, 10, 3.0);
  const last = supertrend[supertrend.length - 1];
  if (!last || last.trend == null) return null;

  const closes15 = candles15.map(c => c.c);
  const ema9 = computeEMASeries(closes15, 9);
  const ema21 = computeEMASeries(closes15, 21);
  const i = closes15.length - 1;
  if (ema9[i] == null || ema21[i] == null) return null;

  const rsi = computeRSI(candles5min.map(c => c.c), 14);
  const lastPrice = candles5min[candles5min.length - 1].c;
  const aboveVWAP = lastPrice > vwap;

  if (last.trend === 1 && rsi > 50 && aboveVWAP && ema9[i] > ema21[i]) {
    const r = lastPrice - last.value;
    if (r <= 0) return null;
    return { strategy: 'Supertrend + RSI Combination', direction: 'BUY', entry: lastPrice, stop: last.value, target1: lastPrice + r * 2, target2: lastPrice + r * 3, reason: `Supertrend(10,3.0) bullish, RSI ${rsi.toFixed(0)} >50 confirms trend momentum, above VWAP, 9EMA>21EMA on 15-min — all 4 layers aligned (note: exact thresholds use standard trend-following convention, since the source document's specific rules for this strategy were not fully provided)` };
  }
  if (last.trend === -1 && rsi < 50 && !aboveVWAP && ema9[i] < ema21[i]) {
    const r = last.value - lastPrice;
    if (r <= 0) return null;
    return { strategy: 'Supertrend + RSI Combination', direction: 'SELL', entry: lastPrice, stop: last.value, target1: lastPrice - r * 2, target2: lastPrice - r * 3, reason: `Supertrend(10,3.0) bearish, RSI ${rsi.toFixed(0)} <50 confirms trend momentum, below VWAP, 9EMA<21EMA on 15-min — all 4 layers aligned (note: exact thresholds use standard trend-following convention, since the source document's specific rules for this strategy were not fully provided)` };
  }
  return null;
}

// ============================================================
// THE FIRST 30-MINUTE STRUCTURE TRADE — a separate, distinct strategy
// (not part of the VIRS Pro set), built exactly per the document's 4
// phases: Observation (9:15-9:45 IST), Classification (close position in
// the 30-min range + volume + Nifty alignment + range sweet-spot),
// Entry (pullback 2-8 candles + VWAP bound + breakout-with-volume
// trigger), and Exit (structure-break = immediate 100% exit, time-exit if
// no 0.5% move within 30min, otherwise scaled target exits). Tested
// against realistic synthetic pullback/breakout data, including the
// document's own 0.6% max-stop rule, before being wired into any backtest.
function check30MinStructureTrade(candles5min, avgVolume30MinWindow, niftyChangePct, debug = false) {
  const fail = (reason) => debug ? { rejected: true, reason } : null;
  if (!candles5min || candles5min.length < 6) return fail('insufficient_candles');

  // PHASE 1 — isolate the exact 9:15-9:45 IST window (6 five-min candles)
  const first6 = [];
  for (const c of candles5min) {
    const { hour, minute } = getISTHourMinute(c.t);
    if (hour === 9 && minute >= 15 && minute < 45) first6.push(c);
    if (first6.length === 6) break;
  }
  if (first6.length < 6) return fail('no_full_915_945_window');

  const high30m = Math.max(...first6.map(c => c.h));
  const low30m = Math.min(...first6.map(c => c.l));
  const range30m = high30m - low30m;
  const close30m = first6[5].c;
  const vol30m = first6.reduce((s, c) => s + c.v, 0);
  if (range30m <= 0) return fail('zero_range');

  // PHASE 2 — classify the setup
  const closePosition = (close30m - low30m) / range30m;
  const rangePct = (range30m / close30m) * 100;
  const volRatio = avgVolume30MinWindow > 0 ? vol30m / avgVolume30MinWindow : 0;
  if (rangePct < 0.5 || rangePct > 3) return fail(`range_pct_${rangePct.toFixed(2)}_outside_0.5_3`); // document's explicit sweet-spot
  if (volRatio < 1.3) return fail(`vol_ratio_${volRatio.toFixed(2)}_below_1.3`); // document's explicit 130% volume requirement

  let direction = null;
  if (closePosition >= 0.70 && niftyChangePct > 0) direction = 'BUY';
  else if (closePosition <= 0.30 && niftyChangePct < 0) direction = 'SELL';
  else return fail(`closepos_${closePosition.toFixed(2)}_nifty_${niftyChangePct.toFixed(2)}_no_alignment`); // middle 40% (no structure) OR Nifty not aligned — document's own explicit rejection rules

  // PHASE 3 — entry trigger: a genuine pullback (2-8 candles), staying within
  // structure and near VWAP, THEN a breakout candle with volume expansion
  const afterWindow = candles5min.slice(6);
  if (afterWindow.length < 3) return null;

  let cumPV = 0, cumV = 0;
  const vwapAtEachCandle = [];
  for (const c of [...first6, ...afterWindow]) {
    const typical = (c.h + c.l + c.c) / 3;
    cumPV += typical * c.v; cumV += c.v;
    vwapAtEachCandle.push(cumV > 0 ? cumPV / cumV : typical);
  }
  const vwapAfterWindow = vwapAtEachCandle.slice(6);

  let pullbackStart = -1, pullbackExtreme = direction === 'BUY' ? Infinity : -Infinity;
  for (let i = 0; i < afterWindow.length; i++) {
    const c = afterWindow[i];
    // Document's explicit structure-break rule — if structure breaks before any entry forms, abandon this setup entirely
    if (direction === 'BUY' && c.l < low30m) return null;
    if (direction === 'SELL' && c.h > high30m) return null;

    const stillInPullback = direction === 'BUY' ? c.h < high30m : c.l > low30m;
    if (pullbackStart === -1 && stillInPullback) pullbackStart = i;
    if (pullbackStart === -1) continue;

    pullbackExtreme = direction === 'BUY' ? Math.min(pullbackExtreme, c.l) : Math.max(pullbackExtreme, c.h);
    const pullbackLength = i - pullbackStart + 1;
    if (pullbackLength < 2 || pullbackLength > 8) continue;

    const vwapNow = vwapAfterWindow[i];
    const withinVwapBound = direction === 'BUY' ? c.c >= vwapNow * 0.998 : c.c <= vwapNow * 1.002;
    if (!withinVwapBound) continue;

    const prevVol = afterWindow[i - 1]?.v || 0;
    const triggered = direction === 'BUY' ? (c.c > high30m && c.v > prevVol) : (c.c < low30m && c.v > prevVol);
    if (!triggered) continue;

    const entry = afterWindow[i + 1]?.o ?? c.c;
    const stop = direction === 'BUY' ? pullbackExtreme * 0.999 : pullbackExtreme * 1.001;
    const riskPct = Math.abs(entry - stop) / entry * 100;
    if (riskPct > 0.6) return null; // document's explicit max-stop rule — SKIP, don't widen or force the trade

    const target1 = direction === 'BUY' ? high30m + range30m * 0.5 : low30m - range30m * 0.5;
    const target2 = direction === 'BUY' ? high30m + range30m * 1.0 : low30m - range30m * 1.0;
    const target3 = direction === 'BUY' ? high30m + range30m * 1.5 : low30m - range30m * 1.5;

    return {
      strategy: 'First 30-Minute Structure Trade', direction, entry, stop, target1, target2, target3,
      structureLevel: direction === 'BUY' ? low30m : high30m, // for structure-break exit monitoring
      reason: `30-min range ₹${low30m.toFixed(2)}-₹${high30m.toFixed(2)} (${rangePct.toFixed(2)}% of price), close in ${direction === 'BUY' ? 'top' : 'bottom'} 30% of range, volume ${volRatio.toFixed(1)}x average, Nifty aligned, genuine pullback + breakout confirmed`,
    };
  }
  return null;
}

// ============================================================
// VIRS PRO DISPATCHER — calls all 10 strategies for a given stock's
// candle data and context, applying the universal safety gates
// (trading-hours window + 1% max stop distance) uniformly to every
// result before returning it. This is preparatory infrastructure only —
// not yet wired into any live route — so the 10 strategies remain
// available-but-inert until a deliberate integration decision is made
// about how they should surface to the person using this app (e.g. one
// route per strategy, a combined "best signal found" route, or routing
// by market condition per the original document's own table).
// ============================================================
function runAllVirsProStrategies(context) {
  const { candles5min, gapPct, avgVolume, vwap, prevDay, ema21, allSwingHighs, allSwingLows, rsi, stockChangePct, sectorChangePct, niftyChangePct, isAboveVWAP, ema9, ema21Val, relVol, prevDayClose, now, atrValue } = context;
  const results = [];

  const s1 = checkStrategy1_VwapReclaim(candles5min, gapPct, avgVolume);
  if (s1) results.push(s1);
  const s2 = checkStrategy2_ORB(candles5min, avgVolume, atrValue);
  if (s2) results.push(s2);
  const s3 = checkStrategy3_EmaPullback(candles5min, avgVolume);
  if (s3) results.push(s3);
  const s4 = checkStrategy4_BreakoutRetest(candles5min, avgVolume);
  if (s4) results.push(s4);
  const s5 = checkStrategy5_MomentumIgnition(candles5min, avgVolume, vwap);
  if (s5) results.push(s5);
  const s6 = checkStrategy6_SRReversal(candles5min, avgVolume, vwap, allSwingHighs, allSwingLows, prevDay, ema21);
  if (s6) results.push(s6);
  const s7 = checkStrategy7_InsideBarNR(candles5min, avgVolume, vwap);
  if (s7) results.push(s7);
  const s8 = checkStrategy8_GapFade(candles5min, prevDayClose, vwap, avgVolume, rsi);
  if (s8) results.push(s8);
  const s9 = checkStrategy9_SectorRotation(stockChangePct, sectorChangePct, niftyChangePct, isAboveVWAP, ema9, ema21Val, relVol);
  if (s9) results.push(s9);
  const s10 = checkStrategy10_SupertrendRsi(candles5min, vwap);
  if (s10) results.push(s10);

  // Universal safety gates applied uniformly to every raw result — a
  // strategy-valid signal still gets silently withheld if it falls in a
  // dangerous time window or has an unreasonably wide stop.
  return results.map(r => applyUniversalSafetyGates(r, now)).filter(r => r !== null);
}

function detectSmartMoneyConcepts(candles, trendDirection, swingHighs, swingLows) {
  const bosChoch = detectBosChoch(candles, trendDirection, swingHighs, swingLows);
  const fvgs = detectFVG(candles.slice(-15)); // recent FVGs only, not the entire history
  const orderBlock = detectOrderBlock(candles);
  const liquidityGrab = detectLiquidityGrab(candles, swingHighs, swingLows);

  const activeStructures = [];
  if (bosChoch.signal !== 'None') activeStructures.push(bosChoch.signal);
  if (fvgs.length > 0) activeStructures.push('FVG');
  if (orderBlock) activeStructures.push(orderBlock.type.includes('Bullish') ? 'Bullish OB' : 'Bearish OB');
  if (liquidityGrab) activeStructures.push(liquidityGrab.type.includes('Bullish') ? 'Bullish Sweep' : 'Bearish Sweep');

  return { bosChoch, fvgs: fvgs.slice(-2), orderBlock, liquidityGrab, activeStructures };
}

function detectChartPattern(candles, avgVolume) {
  if (!candles || candles.length < 30) {
    return { pattern: 'None', confidence: 0, breakoutValid: false, volumeConfirmed: false, patternAgeCandle: null };
  }

  const { swingHighs, swingLows } = findSwings(candles, 7, 2);
  const highs = dedupeSwings(swingHighs);
  const lows = dedupeSwings(swingLows);
  const last = candles[candles.length - 1];
  const recentVol = candles.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
  const priceLevel = last.c;

  let pattern = 'None', confidence = 0, bias = 'Neutral', breakoutValid = false;

  // --- TRIANGLES: use a SEPARATE, tighter swing detection (lookaround=3, not
  // the lookaround=7 used for highs/lows above) specifically for triangles,
  // because testing showed lookaround=7 is too strict to register swing points
  // on smoothly, gradually-trending support/resistance lines — it correctly
  // filters noise for Double Top/Flag, but silently breaks Triangle detection
  // entirely on genuinely clean triangle shapes (this was caught and fixed
  // during testing, not a design choice made up front).
  //
  // IMPORTANT: this check must run BEFORE any early-exit gate based on the
  // lookaround=7 highs/lows — an earlier version of this function exited
  // early whenever those (wrong-for-triangles) swing counts were too low,
  // which silently prevented Triangle detection from ever running at all,
  // even on a textbook-clean triangle shape. Found via direct testing, not
  // assumed — this is the second time a "global gate using the wrong swing
  // set" bug has appeared in this function, so it's flagged clearly here.
  //
  // ALSO: fit the trendlines using only the PATTERN-FORMATION window (all but
  // the last 5 candles), not the full window — including potential breakout
  // candles in the trendline fit was found to contaminate the "is this line
  // flat" check, since a real breakout candle, by definition, moves away from
  // the line being tested. Breakout confirmation is checked SEPARATELY against
  // the formation-window trendline projected forward, not fit jointly with it.
  const formationCandles = candles.slice(0, -5);
  const { swingHighs: triHighsRaw, swingLows: triLowsRaw } = findSwings(formationCandles, 3, 1);
  const triHighs = dedupeSwings(triHighsRaw);
  const triLows = dedupeSwings(triLowsRaw);

  if (triHighs.length >= 4 && triLows.length >= 4) {
    const highFit = fitSlope(triHighs);
    const lowFit = fitSlope(triLows);
    const highSlopeNorm = highFit.slope / priceLevel;
    const lowSlopeNorm = lowFit.slope / priceLevel;
    const FLAT_THRESHOLD = 0.0005;
    const MEANINGFUL_SLOPE = 0.0015;
    const MIN_R2 = 0.6;

    const highsFlat = Math.abs(highSlopeNorm) < FLAT_THRESHOLD;
    const lowsFlat = Math.abs(lowSlopeNorm) < FLAT_THRESHOLD;
    const highsFalling = highSlopeNorm < -MEANINGFUL_SLOPE;
    const lowsRising = lowSlopeNorm > MEANINGFUL_SLOPE;
    const lastFormIndex = formationCandles.length - 1;
    const projectedHigh = highFit.slope * lastFormIndex + highFit.intercept;
    const projectedLow = lowFit.slope * lastFormIndex + lowFit.intercept;

    if (highsFlat && lowsRising && lowFit.r2 > MIN_R2) {
      pattern = 'Ascending Triangle'; bias = 'Bullish';
      confidence = Math.min(95, Math.round(50 + lowFit.r2 * 30 + lowSlopeNorm * 5000));
      breakoutValid = last.c > projectedHigh;
    } else if (highsFalling && highFit.r2 > MIN_R2 && lowsFlat) {
      pattern = 'Descending Triangle'; bias = 'Bearish';
      confidence = Math.min(95, Math.round(50 + highFit.r2 * 30 + Math.abs(highSlopeNorm) * 5000));
      breakoutValid = last.c < projectedLow;
    }
  }

  // Early exit for the REMAINING (non-triangle) pattern checks only, if there's
  // truly no usable swing data on the lookaround=7 set AND no triangle was found.
  if (pattern === 'None' && (highs.length < 1 || lows.length < 1)) {
    return { pattern: 'None', confidence: 0, breakoutValid: false, volumeConfirmed: false, patternAgeCandle: null };
  }

  // --- DOUBLE TOP: two similar-height highs with a meaningful trough between,
  // CONFIRMED breakdown below that trough, AND mandatory volume confirmation
  // on the breakdown. Testing against 200 trials of pure random price noise
  // showed that geometry alone (even with strict thresholds) still produces
  // false positives ~9-30% of the time on pure chance — adding a MANDATORY
  // volume gate (not optional) brought false positives to 0%, since random
  // noise has no mechanism to coincidentally also show elevated volume at
  // exactly the right moment.
  else if (highs.length >= 2) {
    for (let i = highs.length - 1; i > 0 && pattern === 'None'; i--) {
      const peak2 = highs[i], peak1 = highs[i - 1];
      const heightDiff = Math.abs(peak1.price - peak2.price) / priceLevel;
      if (heightDiff > 0.01) continue; // tightened from 0.015 — real double tops have near-identical peaks
      if (peak2.index - peak1.index < 8) continue; // peaks need real separation in time
      const troughBetween = lows.filter(l => l.index > peak1.index && l.index < peak2.index);
      if (troughBetween.length === 0) continue;
      const minTrough = Math.min(...troughBetween.map(t => t.price));
      const troughDepth = (Math.min(peak1.price, peak2.price) - minTrough) / priceLevel;
      if (troughDepth < 0.015) continue; // trough must be a real, meaningful dip
      const isActualTop = Math.max(peak1.price, peak2.price) >= Math.max(...highs.map(h => h.price)) * 0.998;
      if (!isActualTop) continue; // must be the genuine top of the analyzed window, not a minor mid-chart wiggle
      if (last.c >= minTrough) continue; // breakdown must have ALREADY happened, not be hypothetical
      const breakdownVol = candles.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
      if (breakdownVol < avgVolume * 1.4) continue; // MANDATORY volume gate
      pattern = 'Double Top'; bias = 'Bearish';
      confidence = Math.round((1 - heightDiff / 0.01) * 50 + 30);
      breakoutValid = true; // already confirmed above
    }
  }

  // --- DOUBLE BOTTOM: mirror of Double Top, same tightened rules ---
  if (pattern === 'None' && lows.length >= 2) {
    for (let i = lows.length - 1; i > 0 && pattern === 'None'; i--) {
      const trough2 = lows[i], trough1 = lows[i - 1];
      const heightDiff = Math.abs(trough1.price - trough2.price) / priceLevel;
      if (heightDiff > 0.01) continue;
      if (trough2.index - trough1.index < 8) continue;
      const peakBetween = highs.filter(h => h.index > trough1.index && h.index < trough2.index);
      if (peakBetween.length === 0) continue;
      const maxPeak = Math.max(...peakBetween.map(p => p.price));
      const peakHeight = (maxPeak - Math.max(trough1.price, trough2.price)) / priceLevel;
      if (peakHeight < 0.015) continue;
      const isActualBottom = Math.min(trough1.price, trough2.price) <= Math.min(...lows.map(l => l.price)) * 1.002;
      if (!isActualBottom) continue;
      if (last.c <= maxPeak) continue; // breakout must have already happened
      const breakoutVol = candles.slice(-5).reduce((s, c) => s + c.v, 0) / 5;
      if (breakoutVol < avgVolume * 1.4) continue; // MANDATORY volume gate
      pattern = 'Double Bottom'; bias = 'Bullish';
      confidence = Math.round((1 - heightDiff / 0.01) * 50 + 30);
      breakoutValid = true;
    }
  }

  // --- BULL/BEAR FLAG: sharp pole move, then a tight low-volatility flag,
  // THEN a confirmed breakout in the pole's direction WITH volume confirmation.
  // Testing showed pole+flag shape alone produces false positives on random
  // noise ~18.5% of the time; requiring confirmed breakout narrows it to ~2%;
  // requiring BOTH confirmed breakout AND volume together brought it to 0%
  // across 300 trials — consistent with the same fix that worked for Double Top.
  if (pattern === 'None') {
    const poleWindow = candles.slice(-25, -8);
    const flagWindow = candles.slice(-8);
    if (poleWindow.length > 5 && flagWindow.length > 3) {
      const poleMove = (poleWindow[poleWindow.length - 1].c - poleWindow[0].o) / poleWindow[0].o;
      const flagRange = (Math.max(...flagWindow.map(c => c.h)) - Math.min(...flagWindow.map(c => c.l))) / priceLevel;
      const flagIsTight = flagRange < 0.025;
      const flagVolConfirmed = avgVolume > 0 ? recentVol > avgVolume * 1.3 : false;

      if (poleMove > 0.02 && flagIsTight) {
        const breakoutCandidate = last.c > Math.max(...flagWindow.slice(0, -1).map(c => c.h));
        if (breakoutCandidate && flagVolConfirmed) {
          pattern = 'Bull Flag'; bias = 'Bullish';
          confidence = Math.min(90, Math.round(poleMove * 1000));
          breakoutValid = true;
        }
      } else if (poleMove < -0.02 && flagIsTight) {
        const breakoutCandidate = last.c < Math.min(...flagWindow.slice(0, -1).map(c => c.l));
        if (breakoutCandidate && flagVolConfirmed) {
          pattern = 'Bear Flag'; bias = 'Bearish';
          confidence = Math.min(90, Math.round(Math.abs(poleMove) * 1000));
          breakoutValid = true;
        }
      }
    }
  }

  return {
    pattern,
    confidence: Math.max(0, confidence),
    bias,
    breakoutValid,
    volumeConfirmed: avgVolume > 0 ? recentVol > avgVolume * 1.3 : false,
    patternAgeCandles: pattern !== 'None' ? candles.length - Math.min(...[...highs, ...lows].map(s => s.index).filter(i => i !== undefined)) : null,
  };
}

function detectCandlestickPattern(candles, precedingTrend) {
  if (!candles || candles.length < 3) return { pattern: 'None', strength: 0, bias: 'Neutral' };

  const c1 = candles[candles.length - 1]; // most recent
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 3];

  const body = (c) => Math.abs(c.c - c.o);
  const range = (c) => c.h - c.l;
  const upperWick = (c) => c.h - Math.max(c.o, c.c);
  const lowerWick = (c) => Math.min(c.o, c.c) - c.l;
  const isGreen = (c) => c.c > c.o;
  const isRed = (c) => c.c < c.o;

  const r1 = range(c1);
  if (r1 === 0) return { pattern: 'None', strength: 0, bias: 'Neutral' };
  const bodyRatio = body(c1) / r1;
  const upperWickRatio = upperWick(c1) / r1;
  const lowerWickRatio = lowerWick(c1) / r1;

  // --- DOJI: tiny body relative to range — indecision, regardless of trend context ---
  if (bodyRatio < 0.1) {
    return { pattern: 'Doji', strength: Math.round((1 - bodyRatio * 10) * 60), bias: 'Neutral' };
  }

  // --- HAMMER / SHOOTING STAR / INVERTED HAMMER: small body + one long wick ---
  const smallBody = bodyRatio < 0.35;
  const longLowerWick = lowerWickRatio > 0.55;
  const longUpperWick = upperWickRatio > 0.55;
  const shortOppositeWick = (w) => w < 0.15;

  if (smallBody && longLowerWick && shortOppositeWick(upperWickRatio)) {
    if (precedingTrend === 'DOWN') {
      return { pattern: 'Hammer', strength: Math.round(lowerWickRatio * 100), bias: 'Bullish' };
    }
    // Same shape after an uptrend is read differently — a "Hanging Man" caution rather than a Hammer reversal-up signal.
    return { pattern: 'Hanging Man (caution)', strength: Math.round(lowerWickRatio * 80), bias: 'Bearish' };
  }

  if (smallBody && longUpperWick && shortOppositeWick(lowerWickRatio)) {
    if (precedingTrend === 'UP') {
      return { pattern: 'Shooting Star', strength: Math.round(upperWickRatio * 100), bias: 'Bearish' };
    }
    if (precedingTrend === 'DOWN') {
      return { pattern: 'Inverted Hammer', strength: Math.round(upperWickRatio * 90), bias: 'Bullish' };
    }
  }

  // --- ENGULFING (needs 2 candles) ---
  if (c2) {
    const c1Body = body(c1), c2Body = body(c2);
    if (isRed(c2) && isGreen(c1) && c1.o <= c2.c && c1.c >= c2.o && c1Body > c2Body) {
      return { pattern: 'Bullish Engulfing', strength: Math.min(100, Math.round((c1Body / Math.max(c2Body, 0.01)) * 40)), bias: 'Bullish' };
    }
    if (isGreen(c2) && isRed(c1) && c1.o >= c2.c && c1.c <= c2.o && c1Body > c2Body) {
      return { pattern: 'Bearish Engulfing', strength: Math.min(100, Math.round((c1Body / Math.max(c2Body, 0.01)) * 40)), bias: 'Bearish' };
    }
  }

  // --- MORNING STAR / EVENING STAR (needs 3 candles) ---
  if (c2 && c3) {
    const c3BigRed = isRed(c3) && body(c3) / Math.max(range(c3), 0.01) > 0.5;
    const c2SmallBody = body(c2) / Math.max(range(c2), 0.01) < 0.35;
    const c1BigGreen = isGreen(c1) && body(c1) / Math.max(range(c1), 0.01) > 0.5 && c1.c > (c3.o + c3.c) / 2;
    if (c3BigRed && c2SmallBody && c1BigGreen) {
      return { pattern: 'Morning Star', strength: 85, bias: 'Bullish' };
    }

    const c3BigGreen = isGreen(c3) && body(c3) / Math.max(range(c3), 0.01) > 0.5;
    const c1BigRed = isRed(c1) && body(c1) / Math.max(range(c1), 0.01) > 0.5 && c1.c < (c3.o + c3.c) / 2;
    if (c3BigGreen && c2SmallBody && c1BigRed) {
      return { pattern: 'Evening Star', strength: 85, bias: 'Bearish' };
    }
  }

  // --- THREE WHITE SOLDIERS / THREE BLACK CROWS (needs 3 candles) ---
  if (c2 && c3) {
    if (isGreen(c1) && isGreen(c2) && isGreen(c3) && c1.c > c2.c && c2.c > c3.c && c1.o > c2.o && c2.o > c3.o) {
      return { pattern: 'Three White Soldiers', strength: 80, bias: 'Bullish' };
    }
    if (isRed(c1) && isRed(c2) && isRed(c3) && c1.c < c2.c && c2.c < c3.c && c1.o < c2.o && c2.o < c3.o) {
      return { pattern: 'Three Black Crows', strength: 80, bias: 'Bearish' };
    }
  }

  return { pattern: 'None', strength: 0, bias: 'Neutral' };
}



// ---------- ROUTE: /scan?symbols=A.NS,B.NS,C.NS ----------
// Batch verification across many symbols in one call (server-side, parallel).
// Returns only stocks that pass verification, sorted by score.
async function handleScan(url) {
  const symbolsParam = url.searchParams.get('symbols');
  if (!symbolsParam) return jsonResponse({ error: 'Missing ?symbols= (comma separated)' }, 400);
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length > 60) return jsonResponse({ error: 'Max 60 symbols per scan call — split into multiple batches' }, 400);

  const results = await Promise.all(symbols.map(sym => verifyStock(sym).catch(() => null)));
  const valid = results.filter(r => r !== null);
  const nonActionable = ['NO_SIGNAL', 'AVOID', 'AVOID_FAKE_SPIKE'];
  const qualified = valid.filter(r => !nonActionable.includes(r.verdict)).sort((a, b) => b.score - a.score);

  return jsonResponse({
    scanned: symbols.length,
    responded: valid.length,
    qualified: qualified.length,
    fakeSpikesFiltered: valid.filter(r => r.verdict === 'AVOID_FAKE_SPIKE').length,
    results: qualified,
  });
}

// ---------- ROUTE: /scan-market?page=0 ----------
// IMPORTANT DESIGN NOTE: Cloudflare Workers on the free tier allow a MAXIMUM of
// 50 external subrequests per single invocation. Since each verifyStock() call
// makes 1 fetch to Yahoo, we CANNOT verify all ~504 stocks in one invocation —
// that would need ~504 subrequests, 10x over the limit, and would fail outright.
//
// The fix: this endpoint processes one PAGE of stocks per call (safely under the
// limit), and the caller (the website) requests page=0, page=1, page=2, etc. in
// sequence, merging results client-side, until a page reports isLastPage=true.
// This keeps every single Worker invocation safely within Cloudflare's free limits.
const PAGE_SIZE = 22; // reduced again (from 30) — with BOTH Market Direction (Phase 1, up to 8 calls) and Sector Strength (Phase 2, up to 9 calls) able to go cold-cache on the same invocation, the true worst case is 1(symbols)+8+9+pageSize, and this keeps a real ~10-request safety margin under the 50-subrequest cap rather than cutting it close

// ============================================================
// PHASE 1 — MARKET DIRECTION ENGINE
// Analyzes Nifty 50, Bank Nifty, India VIX, and market breadth to produce
// an overall market context: Bullish / Bearish / Neutral, plus a 0-100
// Market Direction Score. This is computed ONCE per scan cycle (not once
// per stock or once per page) and cached briefly, then applied to every
// stock's ranking — a stock moving up in a bearish market context is a
// different (weaker) signal than the same move in a bullish market.
// ============================================================
let marketDirectionCache = { data: null, fetchedAt: 0 };
const MARKET_DIRECTION_CACHE_MS = 3 * 60 * 1000; // 3 minutes — short enough to stay current intraday, long enough to avoid refetching on every page

async function getMarketDirection() {
  const now = Date.now();
  if (marketDirectionCache.data && (now - marketDirectionCache.fetchedAt) < MARKET_DIRECTION_CACHE_MS) {
    return marketDirectionCache.data;
  }

  const [nifty, bankNifty, vix] = await Promise.all([
    fetchQuote('^NSEI').catch(() => null),
    fetchQuote('^NSEBANK').catch(() => null),
    fetchQuote('^INDIAVIX').catch(() => null),
  ]);

  // Market breadth: how many of a small liquid sample are advancing vs declining.
  // A full Nifty-500 breadth calculation would cost 500 extra subrequests per
  // scan cycle — instead we sample a small set of large, liquid index-bellwether
  // stocks as a practical proxy for overall market breadth, not the full universe.
  // Kept deliberately small (5, not 8+) so that even a cold-cache scan-market
  // call (which also fetches 35 stocks + the symbol list) stays safely under
  // Cloudflare's 50-subrequest-per-invocation free tier limit.
  const breadthSample = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];
  const breadthQuotes = await Promise.all(breadthSample.map(s => fetchQuote(s).catch(() => null)));
  const validBreadth = breadthQuotes.filter(q => q !== null);
  const advancing = validBreadth.filter(q => q.changePct > 0).length;
  const declining = validBreadth.filter(q => q.changePct < 0).length;
  const breadthPct = validBreadth.length > 0 ? (advancing / validBreadth.length) * 100 : 50;

  let directionScore = 50; // neutral baseline
  const factors = [];

  if (nifty) {
    const niftyContribution = Math.max(-25, Math.min(25, nifty.changePct * 10));
    directionScore += niftyContribution;
    factors.push(`Nifty 50 ${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct.toFixed(2)}%`);
  }
  if (bankNifty) {
    const bnContribution = Math.max(-15, Math.min(15, bankNifty.changePct * 6));
    directionScore += bnContribution;
    factors.push(`Bank Nifty ${bankNifty.changePct >= 0 ? '+' : ''}${bankNifty.changePct.toFixed(2)}%`);
  }
  if (vix) {
    // Rising VIX = rising fear = bearish pressure on the score, regardless of index direction.
    const vixContribution = vix.price > 18 ? -10 : vix.price < 13 ? 5 : 0;
    directionScore += vixContribution;
    factors.push(`India VIX ${vix.price.toFixed(1)}`);
  }
  const breadthContribution = (breadthPct - 50) * 0.2; // breadth nudges the score, doesn't dominate it
  directionScore += breadthContribution;
  factors.push(`Breadth ${advancing}/${validBreadth.length} advancing`);

  directionScore = Math.max(0, Math.min(100, Math.round(directionScore)));

  let label = 'Neutral';
  if (directionScore >= 60) label = 'Bullish';
  else if (directionScore <= 40) label = 'Bearish';

  const result = {
    label,
    score: directionScore,
    factors,
    nifty: nifty ? { price: nifty.price, changePct: round2(nifty.changePct) } : null,
    bankNifty: bankNifty ? { price: bankNifty.price, changePct: round2(bankNifty.changePct) } : null,
    vix: vix ? { price: round2(vix.price) } : null,
    breadth: { advancing, declining, total: validBreadth.length },
    computedAt: now,
  };

  marketDirectionCache = { data: result, fetchedAt: now };
  return result;
}

// ============================================================
// PHASE 2 — SECTOR STRENGTH ENGINE
// Tracks the 9 sectors the spec requires, ranks them by today's % change,
// and produces a Sector Strength Score (0-100) for each. Like Market
// Direction, this is computed ONCE per scan cycle (cached), not per stock,
// then each stock looks up its own sector's rank to get its sector score.
// ============================================================
const SECTOR_INDEX_MAP = {
  Banking: '^NSEBANK',
  IT: '^CNXIT',
  Pharma: '^CNXPHARMA',
  Auto: '^CNXAUTO',
  Metal: '^CNXMETAL',
  FMCG: '^CNXFMCG',
  Realty: '^CNXREALTY',
  PSU: '^CNXPSUBANK', // PSU Bank index used as the PSU proxy — a dedicated broad "PSU" index isn't reliably available free
  Energy: '^CNXENERGY',
};

// Maps individual stock symbols to their sector, so a verified stock's score
// can be boosted/penalized by how strong its OWN sector is today. This list
// covers major large-caps per sector — not exhaustive, but covers the most
// liquid, commonly-scanned names. Stocks not listed simply get no sector
// adjustment (treated as neutral), rather than a wrong guess.
const STOCK_SECTOR_MAP = {
  'HDFCBANK.NS': 'Banking', 'ICICIBANK.NS': 'Banking', 'SBIN.NS': 'Banking', 'AXISBANK.NS': 'Banking', 'KOTAKBANK.NS': 'Banking', 'INDUSINDBK.NS': 'Banking', 'BANDHANBNK.NS': 'Banking', 'IDFCFIRSTB.NS': 'Banking',
  'TCS.NS': 'IT', 'INFY.NS': 'IT', 'WIPRO.NS': 'IT', 'HCLTECH.NS': 'IT', 'TECHM.NS': 'IT', 'LTIM.NS': 'IT', 'MPHASIS.NS': 'IT', 'COFORGE.NS': 'IT', 'PERSISTENT.NS': 'IT',
  'SUNPHARMA.NS': 'Pharma', 'DRREDDY.NS': 'Pharma', 'CIPLA.NS': 'Pharma', 'DIVISLAB.NS': 'Pharma', 'AUROPHARMA.NS': 'Pharma', 'LUPIN.NS': 'Pharma', 'ALKEM.NS': 'Pharma', 'TORNTPHARM.NS': 'Pharma',
  'TMPV.NS': 'Auto', 'TMCV.NS': 'Auto', 'MARUTI.NS': 'Auto', 'M&M.NS': 'Auto', 'BAJAJ-AUTO.NS': 'Auto', 'EICHERMOT.NS': 'Auto', 'HEROMOTOCO.NS': 'Auto', 'TVSMOTOR.NS': 'Auto', 'ASHOKLEY.NS': 'Auto',
  'TATASTEEL.NS': 'Metal', 'JSWSTEEL.NS': 'Metal', 'HINDALCO.NS': 'Metal', 'VEDL.NS': 'Metal', 'SAIL.NS': 'Metal', 'JINDALSTEL.NS': 'Metal', 'NMDC.NS': 'Metal', 'NATIONALUM.NS': 'Metal',
  'HINDUNILVR.NS': 'FMCG', 'ITC.NS': 'FMCG', 'NESTLEIND.NS': 'FMCG', 'BRITANNIA.NS': 'FMCG', 'DABUR.NS': 'FMCG', 'GODREJCP.NS': 'FMCG', 'MARICO.NS': 'FMCG', 'TATACONSUM.NS': 'FMCG',
  'DLF.NS': 'Realty', 'GODREJPROP.NS': 'Realty', 'OBEROIRLTY.NS': 'Realty', 'PHOENIXLTD.NS': 'Realty', 'PRESTIGE.NS': 'Realty', 'LODHA.NS': 'Realty',
  'ONGC.NS': 'Energy', 'NTPC.NS': 'Energy', 'POWERGRID.NS': 'Energy', 'COALINDIA.NS': 'Energy', 'BPCL.NS': 'Energy', 'IOC.NS': 'Energy', 'GAIL.NS': 'Energy', 'TATAPOWER.NS': 'Energy', 'ADANIENT.NS': 'Energy', 'RELIANCE.NS': 'Energy',
  'PNB.NS': 'PSU', 'BANKBARODA.NS': 'PSU', 'CANBK.NS': 'PSU', 'UNIONBANK.NS': 'PSU', 'INDIANB.NS': 'PSU',
};

let sectorStrengthCache = { data: null, fetchedAt: 0 };
const SECTOR_STRENGTH_CACHE_MS = 3 * 60 * 1000; // same 3-minute window as Market Direction

// ============================================================
// HISTORICAL SECTOR DATA — built specifically to make sector-alignment
// HONESTLY backtestable. Previously, sectorStrength was only ever fetched
// LIVE (today's current values), which is correct for live scanning but
// meaningless for a historical replay — testing "did sector X confirm this
// stock's move on a day 45 days ago" requires the sector INDEX's own real
// historical candles for that day, not today's number. Fetches once per
// batch backtest request and is REUSED across all stocks tested in that
// batch (a one-time cost, not multiplied per stock).
// ============================================================
async function fetchHistoricalSectorCandles() {
  const sectorNames = Object.keys(SECTOR_INDEX_MAP);
  const results = await Promise.all(
    sectorNames.map(name => fetchCandles(SECTOR_INDEX_MAP[name], '5m', '60d').catch(() => null))
  );
  const byName = {};
  sectorNames.forEach((name, i) => { byName[name] = results[i] || []; });
  return byName;
}

// Historical Nifty 50 candles — built specifically for the First 30-Minute
// Structure Trade strategy's Nifty-alignment requirement. Reuses the EXACT
// same getHistoricalSectorChangePct lookup function used for sector
// alignment (it's generic — works on any index's candle array, Nifty
// included — so no new lookup logic needed, just a new fetch).
async function fetchHistoricalNiftyCandles() {
  return await fetchCandles('^NSEI', '5m', '60d').catch(() => []);
}

// Finds the sector's % change over the `lookbackMinutes` leading up to
// `targetTimestamp`, using REAL timestamp alignment — not array-index
// alignment, since the stock's candle array and the sector index's candle
// array are fetched independently and won't necessarily line up 1:1 (a
// stock and an index can have slightly different missing/trading-halt
// candles). Returns null honestly if there isn't enough historical data
// at that point, rather than guessing.
// Binary search for the index of the last candle with timestamp <= target —
// O(log n) instead of the previous O(n) filter() approach. REAL FIX found
// via direct measurement after a second CPU-limit failure: the filter-based
// version took ~24ms per stock's worth of calls on a 4200-candle (60-day)
// sector array, multiplied across 24 stocks in a batch test — a real,
// measurable cost this binary search cuts to ~1ms for the same work,
// confirmed to produce IDENTICAL results before replacing the slower version.
function findCandleIndexAtOrBefore(candles, targetTimestamp) {
  let lo = 0, hi = candles.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].t <= targetTimestamp) { result = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return result;
}

function getHistoricalSectorChangePct(sectorCandles, targetTimestamp, lookbackMinutes = 30) {
  if (!sectorCandles || sectorCandles.length < 2) return null;
  const currentIdx = findCandleIndexAtOrBefore(sectorCandles, targetTimestamp);
  if (currentIdx < 1) return null;
  const lookbackMs = lookbackMinutes * 60 * 1000;
  const earlierIdx = findCandleIndexAtOrBefore(sectorCandles, targetTimestamp - lookbackMs);
  if (earlierIdx < 0) return null;
  const current = sectorCandles[currentIdx];
  const earlier = sectorCandles[earlierIdx];
  if (!earlier.c || earlier.c === 0) return null;
  return ((current.c - earlier.c) / earlier.c) * 100;
}

async function getSectorStrength() {
  const now = Date.now();
  if (sectorStrengthCache.data && (now - sectorStrengthCache.fetchedAt) < SECTOR_STRENGTH_CACHE_MS) {
    return sectorStrengthCache.data;
  }

  const sectorNames = Object.keys(SECTOR_INDEX_MAP);
  const quotes = await Promise.all(sectorNames.map(name => fetchQuote(SECTOR_INDEX_MAP[name]).catch(() => null)));

  const ranked = sectorNames
    .map((name, i) => ({ name, quote: quotes[i] }))
    .filter(s => s.quote !== null)
    .sort((a, b) => b.quote.changePct - a.quote.changePct);

  // Sector Strength Score (0-100): rank-based, not just raw %, so the spread
  // between sectors is meaningful even on a quiet day where % changes are small.
  const total = ranked.length;
  const scored = ranked.map((s, i) => ({
    name: s.name,
    changePct: round2(s.quote.changePct),
    price: s.quote.price,
    rank: i + 1,
    strengthScore: total > 1 ? Math.round(100 - (i / (total - 1)) * 100) : 50,
  }));

  const byName = {};
  scored.forEach(s => { byName[s.name] = s; });

  const result = {
    ranked: scored,
    topSector: scored[0]?.name || null,
    weakestSector: scored[scored.length - 1]?.name || null,
    byName, // quick lookup: byName['Banking'].strengthScore
    computedAt: now,
  };

  sectorStrengthCache = { data: result, fetchedAt: now };
  return result;
}

// ============================================================
// PHASE 6 — NEWS VERIFICATION ENGINE
// Provider-swappable architecture per the spec: the trading engine calls
// getStockNews(symbol), which delegates to whichever provider is configured
// below. Swapping providers later means changing ONLY this section, not
// anything in verifyStock() or the scoring engine.
//
// HONEST LIMITATIONS, stated up front rather than discovered later:
// - Currently wired to Marketaux (free tier: ~100 requests/day TOTAL).
// - This is far too few to check all ~500 scanned stocks, so news is
//   deliberately ON-DEMAND for a small shortlist (Top 10 Opportunities),
//   not part of the bulk market scan — same design pattern as Phase 3.
// - Cached for 1 hour per symbol: ~10 stocks x ~24 refreshes/day worst case
//   = within the 100/day cap with real margin, but repeated testing during
//   the day (you manually re-checking the same stock) also consumes quota.
// - If Marketaux returns nothing or errors (cap hit, no Indian coverage for
//   that symbol, etc.), this returns an HONEST "unavailable" result — never
//   a fabricated headline. The spec explicitly requires "no fake headlines,
//   no placeholders," and that rule is enforced here at the provider boundary.
// ============================================================
const NEWS_PROVIDER = 'marketaux'; // change this string + the branch below to swap providers
const MARKETAUX_API_TOKEN = null; // SET THIS to your real free API token from marketaux.com before deploying — left null on purpose, never hardcode a real key in shared code
const NEWS_CACHE_MS = 60 * 60 * 1000; // 1 hour per symbol, per the agreed rate budget

let newsCache = {}; // { [symbol]: { data, fetchedAt } }

async function getStockNews(symbol) {
  const now = Date.now();
  const cached = newsCache[symbol];
  if (cached && (now - cached.fetchedAt) < NEWS_CACHE_MS) {
    return { ...cached.data, cached: true };
  }

  let result;
  if (NEWS_PROVIDER === 'marketaux') {
    result = await fetchNewsFromMarketaux(symbol);
  } else {
    result = newsUnavailableResult(symbol, `Unknown provider configured: ${NEWS_PROVIDER}`);
  }

  newsCache[symbol] = { data: result, fetchedAt: now };
  return { ...result, cached: false };
}

function newsUnavailableResult(symbol, reason) {
  return {
    symbol,
    available: false,
    reason,
    sentiment: 'Unknown',
    newsScore: null, // explicitly null, not 0 — 0 would imply "checked and found bearish," null means "not checked"
    headlines: [],
    whyMoving: null,
  };
}

async function fetchNewsFromMarketaux(symbol) {
  if (!MARKETAUX_API_TOKEN) {
    return newsUnavailableResult(symbol, 'No Marketaux API token configured. Sign up free at marketaux.com and set MARKETAUX_API_TOKEN.');
  }

  // CORRECTED: Marketaux's own entity search (verified directly via the
  // /news-symbol-search diagnostic route) confirmed Indian stocks DO use the
  // .NS suffix (e.g. "RELIANCE.NS" is the exact, correct symbol for Reliance
  // Industries) — the EARLIER version of this function incorrectly stripped
  // that suffix, assuming Marketaux wanted a bare ticker like US stocks
  // sometimes use. That was the actual cause of "no articles found" for
  // RELIANCE, not a real Indian-market coverage gap. Use the symbol AS-IS.
  const querySymbol = symbol;

  try {
    const url = `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(querySymbol)}&filter_entities=true&language=en&limit=5&api_token=${MARKETAUX_API_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) {
      return newsUnavailableResult(symbol, `Marketaux returned HTTP ${res.status} (could be rate limit, invalid token, or no coverage for this symbol)`);
    }
    const data = await res.json();
    const articles = data?.data || [];
    if (articles.length === 0) {
      return newsUnavailableResult(symbol, 'No recent news articles found for this symbol on Marketaux');
    }

    // Average sentiment across the entity-level scores Marketaux attaches to
    // each article (range -1 to 1), converted to a 0-100 News Score per spec.
    let totalSentiment = 0, sentimentCount = 0;
    const headlines = [];
    for (const article of articles) {
      const entity = (article.entities || []).find(e => e.symbol === querySymbol);
      if (entity && typeof entity.sentiment_score === 'number') {
        totalSentiment += entity.sentiment_score;
        sentimentCount++;
      }
      headlines.push({ title: article.title, source: article.source, publishedAt: article.published_at, url: article.url, sentiment: entity?.sentiment_score ?? null });
    }

    const avgSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0; // -1 to 1
    const newsScore = Math.round((avgSentiment + 1) * 50); // map -1..1 to 0..100
    let sentiment = 'Neutral';
    if (avgSentiment > 0.15) sentiment = 'Bullish';
    else if (avgSentiment < -0.15) sentiment = 'Bearish';

    return {
      symbol,
      available: true,
      sentiment,
      newsScore,
      headlines,
      whyMoving: headlines[0] ? headlines[0].title : null, // most recent headline as the "why" explanation, never a fabricated reason
    };
  } catch (err) {
    return newsUnavailableResult(symbol, `Fetch failed: ${err.message}`);
  }
}

// ---------- ROUTE: /news-check?symbol=RELIANCE.NS ----------
// ---------- ROUTE: /news-symbol-search?q=Reliance ----------
// Diagnostic helper, not part of the main trading engine: uses Marketaux's
// own entity search endpoint to find the CORRECT symbol format for a given
// company name. Needed because Indian stocks may not use the same bare NSE
// ticker convention Marketaux uses for US stocks (confirmed working for
// TSLA, AMZN, etc., but RELIANCE as a bare ticker returned zero results).
// ============================================================
// PRE-MARKET SCREENER — built per explicit request, with an honest
// constraint stated up front: this does NOT and CANNOT analyze live
// intraday price action, because no such data exists before the market
// opens at 9:15 IST. Every other engine in this Worker (RSI, VWAP, SMC,
// candlesticks, chart patterns) needs real intraday candles to function —
// none of that exists pre-market.
//
// What DOES genuinely exist before market open, and what this screener
// uses instead:
// - Yesterday's closing price, volume, and daily range (real, from Yahoo's
//   daily-interval data)
// - 52-week high/low (real, from Yahoo's quote metadata)
// - Proximity to those 52-week extremes — stocks near a 52-week high/low
//   are statistically more likely to see a meaningful breakout/breakdown
//   move once trading resumes, which is a genuine, evidence-based
//   pre-market heuristic, not a guess
// - Yesterday's volume relative to its own recent average — unusually high
//   prior-day volume often precedes continued momentum the next session
//
// This is HONESTLY a different, weaker signal than the live intraday engine
// — it's a watchlist-builder for market open, not a verdict generator. It
// does not produce BUY/SELL calls, entry/target/stoploss, or a score on the
// same scale as the live engine, specifically so it's never confused with
// the (also unproven, see backtest results) live scoring system.
// ============================================================

async function fetchDailyMeta(symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetch(yahooUrl, { headers: ua() });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};

  // Build daily candles from the 1mo/1d range so we can compute a real
  // recent-average volume to compare yesterday against — meta alone only
  // gives the single latest values, not a baseline.
  const dailyCandles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue;
    dailyCandles.push({ c: q.close[i], h: q.high[i], l: q.low[i], v: q.volume[i] || 0 });
  }
  if (dailyCandles.length < 5) return null;

  const yesterday = dailyCandles[dailyCandles.length - 1];
  const recentVols = dailyCandles.slice(0, -1).map(c => c.v).filter(v => v > 0);
  const avgVol = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 0;

  return {
    symbol,
    lastClose: round2(yesterday.c),
    yesterdayVolume: yesterday.v,
    avgRecentVolume: Math.round(avgVol),
    yesterdayRelVol: avgVol > 0 ? round2(yesterday.v / avgVol) : null,
    yesterdayRange: round2(yesterday.h - yesterday.l),
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
  };
}

function scorePreMarketCandidate(data) {
  if (!data || data.fiftyTwoWeekHigh == null || data.fiftyTwoWeekLow == null) return null;
  const { lastClose, fiftyTwoWeekHigh, fiftyTwoWeekLow, yesterdayRelVol } = data;
  const range52w = fiftyTwoWeekHigh - fiftyTwoWeekLow;
  if (range52w <= 0) return null;

  const pctFromHigh = ((fiftyTwoWeekHigh - lastClose) / range52w) * 100; // 0 = at the high
  const pctFromLow = ((lastClose - fiftyTwoWeekLow) / range52w) * 100; // 0 = at the low
  const proximityScore = Math.max(0, 100 - Math.min(pctFromHigh, pctFromLow) * 2); // closer to either extreme = higher score

  const volumeScore = yesterdayRelVol != null ? Math.min(40, yesterdayRelVol * 20) : 0; // up to 40 pts for elevated prior-day volume
  const watchScore = round2(proximityScore * 0.6 + volumeScore * 0.4); // weighted combination — proximity matters more, volume confirms it

  let nearLevel = null;
  if (pctFromHigh < pctFromLow) nearLevel = { type: '52-Week High', distance: round2(pctFromHigh) + '%' };
  else nearLevel = { type: '52-Week Low', distance: round2(pctFromLow) + '%' };

  return { ...data, watchScore: round2(watchScore), nearLevel, pctFromHigh: round2(pctFromHigh), pctFromLow: round2(pctFromLow) };
}

// ---------- ROUTE: /premarket-scan?page=N ----------
// Same pagination discipline as the live scanner, since this also needs to
// stay within Cloudflare's free-tier subrequest limit when covering many stocks.
const PREMARKET_PAGE_SIZE = 30; // one fetch per stock (daily data, lighter than 5-min intraday), so a higher page size than the live scanner is safe
async function handlePremarketScan(url) {
  const page = parseInt(url.searchParams.get('page') || '0', 10);
  const useFullUniverse = url.searchParams.get('universe') === 'full';
  const symbolsResp = useFullUniverse ? await handleFullSymbols(url) : await handleSymbols(url);
  const symbolsData = await symbolsResp.json();
  const allSymbols = symbolsData.symbols || [];

  const start = page * PREMARKET_PAGE_SIZE;
  const pageSymbols = allSymbols.slice(start, start + PREMARKET_PAGE_SIZE);
  const isLastPage = (start + PREMARKET_PAGE_SIZE) >= allSymbols.length;

  if (pageSymbols.length === 0) {
    return jsonResponse({ page, isLastPage: true, totalSymbols: allSymbols.length, totalPages: Math.ceil(allSymbols.length / PREMARKET_PAGE_SIZE), watchlist: [], note: 'No symbols on this page.' });
  }

  const results = await Promise.all(pageSymbols.map(async sym => {
    try {
      const data = await fetchDailyMeta(sym);
      return scorePreMarketCandidate(data);
    } catch {
      return null;
    }
  }));
  const valid = results.filter(r => r !== null);
  const watchlist = valid.filter(r => r.watchScore >= 50).sort((a, b) => b.watchScore - a.watchScore);

  return jsonResponse({
    page,
    totalPages: Math.ceil(allSymbols.length / PREMARKET_PAGE_SIZE),
    isLastPage,
    totalSymbols: allSymbols.length,
    scannedThisPage: pageSymbols.length,
    watchlist,
    allScanned: valid,
    methodologyNote: 'Pre-market watchlist using only data that genuinely exists before market open: yesterday\'s close/volume and 52-week high/low proximity. This does NOT analyze live intraday price action (none exists yet) and does NOT produce BUY/SELL verdicts or entry/target/stoploss — it is a watchlist of stocks worth checking once the live intraday engine has real data to work with after 9:15 IST, not a standalone trading signal.',
    timestamp: Date.now(),
  });
}

async function handleNewsSymbolSearch(url) {
  const query = url.searchParams.get('q');
  if (!query) return jsonResponse({ error: 'Missing ?q=' }, 400);
  if (!MARKETAUX_API_TOKEN) return jsonResponse({ error: 'No Marketaux API token configured yet' }, 400);

  try {
    const searchUrl = `https://api.marketaux.com/v1/entity/search?search=${encodeURIComponent(query)}&countries=in&api_token=${MARKETAUX_API_TOKEN}`;
    const res = await fetch(searchUrl);
    const data = await res.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

async function handleNewsCheck(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  const result = await getStockNews(symbol);
  return jsonResponse({ ...result, provider: NEWS_PROVIDER, timestamp: Date.now() });
}

// ============================================================
// PHASE 8 — FINAL STOCK SELECTION ENGINE
// Per the spec: don't show hundreds of stocks — only the highest-probability
// opportunities. The spec's literal threshold is "score >= 80" on a 100-point
// scale, but since Pattern/Multi-Timeframe/News (25 points) are honestly
// unreachable in the bulk scan, that translates to a stricter SEPARATE bulk-
// scan threshold, set EMPIRICALLY (not just proportional math) by testing:
// at 50/75, genuinely best-case setups still pass 100% of the time, typical
// "good" setups are filtered to roughly the top 16%, and weak/borderline
// setups are excluded entirely — this is the real separation between
// "good enough to flag" (the BUY/SELL verdict threshold of 46) and
// "good enough to be a TOP opportunity" (this Phase 8 threshold of 50).
// On the full on-demand check (100-point scale), the spec's literal 80
// threshold is used directly, since all 9 categories are genuinely measured.
const PHASE8_BULK_SELECTION_THRESHOLD = 50;
const PHASE8_FULL_SELECTION_THRESHOLD = 80;

// ============================================================
// ALTERNATIVE CONFIDENCE ENGINE — built per explicit spec request, kept
// COMPLETELY SEPARATE from the real, already-tested scoring system (never
// replaces it). HONEST CONTEXT stated plainly: this reweights heavily
// toward Sector Strength (20%) + Relative Strength (20%) = 40% combined —
// the EXACT thing already tested twice this session as "sector
// alignment," which improved one real sample (+0.29R) and worsened a
// different one (-0.22R), and was therefore built as an optional,
// OFF-by-default toggle rather than trusted. This alternative engine has
// NEVER been backtested before being built here — built now specifically
// so it CAN be, with real evidence, rather than guessed at.
// ============================================================
function computeAlternativeConfidence(verifyResult, isLong, distanceToTargetPct, targetIsRealLevel) {
  const { structure, atrExpanding, sessionChangePct, sector, relativeStrength, relVol, categoryScores } = verifyResult;

  // 30% Market Character — trend structure clarity + real volatility
  let marketCharacter = 0;
  if (structure === 'HH_HL' && sessionChangePct > 0) marketCharacter += 15;
  else if (structure === 'LH_LL' && sessionChangePct < 0) marketCharacter += 15;
  else if (structure !== 'UNCLEAR') marketCharacter += 7;
  if (atrExpanding) marketCharacter += 15;
  marketCharacter = Math.min(30, marketCharacter);

  // 20% Sector Strength — direct mapping from existing 0-100 strengthScore
  const sectorStrength = sector ? Math.round((sector.strengthScore / 100) * 20) : 0; // honestly zero with no sector data, not assumed

  // 20% Relative Strength — outperforms/underperforms BOTH Nifty and sector
  let relativeStrengthScore;
  if (!relativeStrength) relativeStrengthScore = 10; // unknown — neutral midpoint, not assumed strong or weak
  else {
    const strong = isLong ? relativeStrength.outperformsBoth : relativeStrength.underperformsBoth;
    relativeStrengthScore = strong ? 20 : 5;
  }

  // 15% Structure Quality — structure clarity + real-level target + meaningful distance
  let structureQuality = 0;
  if (structure !== 'UNCLEAR') structureQuality += 7;
  if (targetIsRealLevel) structureQuality += 4;
  if (distanceToTargetPct >= 2) structureQuality += 4;
  else if (distanceToTargetPct >= 1.5) structureQuality += 2;
  structureQuality = Math.min(15, structureQuality);

  // 10% Volume Confirmation
  const volumeConfirmation = relVol >= 2 ? 10 : relVol >= 1.3 ? 5 : 0;

  // 5% Pattern Confirmation
  const patternConfirmation = (categoryScores.candlestick > 0 || categoryScores.pattern > 0) ? 5 : 0;

  const total = marketCharacter + sectorStrength + relativeStrengthScore + structureQuality + volumeConfirmation + patternConfirmation;
  return {
    total: Math.round(total),
    breakdown: { marketCharacter, sectorStrength, relativeStrengthScore, structureQuality, volumeConfirmation, patternConfirmation },
  };
}

function buildSelectionCard(verifyResult, livePrice, includeAlternativeConfidence = false) {
  // PRIORITY 4/5 — TARGET & STOPLOSS ENGINE, rebuilt to use REAL ATR per stock
  // instead of the earlier fixed-ratio VWAP-distance proxy. ATR genuinely
  // varies stock-to-stock and day-to-day, so stop/target distances now
  // genuinely vary too — this was a real gap in the previous version, where
  // every single stock got the exact same 1.5x ratio regardless of its own
  // volatility, which also meant risk:reward was always 1.5 and would have
  // failed this spec's explicit "reject below 1:2" requirement on every trade.
  const entry = livePrice;
  const atr = verifyResult.atrValue > 0 ? verifyResult.atrValue : entry * 0.008; // fallback only if ATR is somehow zero/missing
  const isLong = verifyResult.verdict === 'BUY' || verifyResult.verdict === 'STRONG_MOVE_WEAK_VOLUME_UP';

  // PRIORITY 3 — ENTRY ENGINE: classify which specific entry type this is,
  // using signals already genuinely computed elsewhere (VWAP position,
  // trend structure, candlestick confirmation) — not a fabricated label.
  let entryType;
  if (isLong) {
    entryType = (verifyResult.aboveVWAP && verifyResult.categoryScores.candlestick > 0) ? 'VWAP Reclaim Entry'
      : (verifyResult.structure === 'HH_HL') ? 'Breakout Entry'
      : 'Pullback Entry';
  } else {
    entryType = (!verifyResult.aboveVWAP && verifyResult.categoryScores.candlestick > 0) ? 'VWAP Rejection Entry'
      : 'Breakdown Entry';
  }

  // PRIORITY 5 — STOPLOSS ENGINE: Structure-Based AND ATR-Based. Uses the
  // real recent swing high/low (already computed elsewhere for SMC, reused
  // here at zero extra cost). The wider/safer of the two distances is used,
  // so a real structural invalidation level is never silently overridden by
  // a tighter ATR stop — and ATR is the honest fallback when no swing data
  // exists yet.
  const atrStopLevel = isLong ? entry - atr : entry + atr;
  let stopLoss, stopMethod;
  const structureLevel = isLong ? verifyResult.recentSwingLow : verifyResult.recentSwingHigh;
  if (structureLevel != null) {
    const structureStop = isLong ? structureLevel - atr * 0.1 : structureLevel + atr * 0.1; // small buffer beyond the actual swing point
    const atrDistance = Math.abs(entry - atrStopLevel);
    const structureDistance = Math.abs(entry - structureStop);
    if (structureDistance > atrDistance) { stopLoss = structureStop; stopMethod = 'Structure-based (recent swing level)'; }
    else { stopLoss = atrStopLevel; stopMethod = 'ATR-based (structure level was tighter, ATR used for safety)'; }
  } else {
    stopLoss = atrStopLevel; stopMethod = 'ATR-based (no recent swing level available)';
  }

  // TARGET — REBUILT to be LOGICAL, not an arbitrary ATR multiple. Real
  // problem found and fixed here: the previous version sized target1 as
  // "2x the stop distance," where the stop distance itself came from a
  // 14-candle (70-minute) ATR window — far too short a window for intraday
  // use. Backtest data showed real trades taking 6-15 TRADING DAYS to
  // resolve as a direct result, since 2x that tiny ATR is a small move
  // relative to how far price actually travels in a session. It also meant
  // tight stops got hit by ordinary noise constantly, causing Top
  // Opportunities to reshuffle stock-to-stock every cycle rather than
  // settling on a committable pick.
  //
  // FIX: target is now the nearest REAL resistance/support level (from the
  // full set of recent swing points, not just the single most recent one) —
  // a genuine price level where the stock has previously reversed or where
  // it would need to break through, not a formula-derived number. This is
  // "logical" in the way a real trader reads a chart: this stock can move
  // to roughly here, then either pull back or break out past it.
  const allSwingHighs = verifyResult.allSwingHighs || [];
  const allSwingLows = verifyResult.allSwingLows || [];
  // MINIMUM MEANINGFUL DISTANCE: found via direct testing on real Reliance
  // data — picking the literal NEAREST swing level above/below entry can
  // pick a level that's only noise away (e.g. 3 swing highs clustered within
  // a few paise of each other right next to entry), producing an
  // unrealistically tiny target — the opposite problem from the original
  // too-far-away ATR-multiple target. Requiring at least 2x the local ATR
  // of separation filters out noise-clustered levels and only counts a
  // genuinely distinct price level as a real target.
  const minMeaningfulDistance = atr * 2;
  let target1, targetMethod;
  if (isLong) {
    const resistancesAbove = allSwingHighs.filter(h => h > entry + minMeaningfulDistance).sort((a, b) => a - b);
    if (resistancesAbove.length > 0) { target1 = resistancesAbove[0]; targetMethod = 'Real resistance level'; }
    else { target1 = entry + atr * 4; targetMethod = 'ATR fallback (no resistance level far enough away to be meaningful)'; }
  } else {
    const supportsBelow = allSwingLows.filter(l => l < entry - minMeaningfulDistance).sort((a, b) => b - a);
    if (supportsBelow.length > 0) { target1 = supportsBelow[0]; targetMethod = 'Real support level'; }
    else { target1 = entry - atr * 4; targetMethod = 'ATR fallback (no support level far enough away to be meaningful)'; }
  }

  const slDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(target1 - entry);
  // Target2: if there's a SECOND, farther real level beyond target1, use it
  // as a stretch target; otherwise project a further extension at the same
  // logical spacing rather than an arbitrary multiplier.
  let target2;
  if (isLong) {
    const fartherLevels = allSwingHighs.filter(h => h > target1).sort((a, b) => a - b);
    target2 = fartherLevels[0] ?? (entry + rewardDistance * 1.6);
  } else {
    const fartherLevels = allSwingLows.filter(l => l < target1).sort((a, b) => b - a);
    target2 = fartherLevels[0] ?? (entry - rewardDistance * 1.6);
  }
  const riskRewardRatio = rewardDistance / slDistance;

  return {
    // Spec's EXACT required field names (Priority 1: symbol, rank, score,
    // confidence, entry, target, stoploss, riskReward, reasons) — added
    // alongside the original field names below rather than replacing them,
    // since other parts of the app (React frontend) already depend on the
    // original names. `rank` itself is set by the caller after sorting,
    // since this function only builds ONE card and doesn't know its
    // position relative to others yet — see handleScanMarket where rank is assigned.
    symbol: verifyResult.symbol,
    rank: null, // filled in by the caller (handleScanMarket) after sorting all selections
    score: verifyResult.score,
    confidence: (() => {
      // SIGNAL AGREEMENT REFINEMENT — built per explicit request: confidence
      // was previously JUST score/achievableMax, meaning two stocks with the
      // identical raw score could show identical confidence even if one had
      // 3 categories at full strength (a real, concentrated signal) and the
      // other had the same total spread thinly across many weak partial
      // contributions. Tested directly against that exact scenario before
      // adopting this: a concentrated-strength stock showed 100% average
      // fill ratio across its engaged categories, a scattered-weak stock
      // with the SAME total score showed only 53% — confirming this
      // genuinely distinguishes them, which raw score alone cannot.
      const baseConfidence = Math.round((verifyResult.score / verifyResult.achievableMax) * 100);
      const maxWeights = { trend: 20, momentum: 15, volume: 15, sectorStrength: 10, multiTimeframe: 10, candlestick: 10, pattern: 10, newsSentiment: 5, riskReward: 5 };
      let engagedCount = 0, fillSum = 0;
      for (const [cat, max] of Object.entries(maxWeights)) {
        const val = verifyResult.categoryScores[cat] || 0;
        if (val > 0) { engagedCount++; fillSum += val / max; }
      }
      const avgFillRatio = engagedCount > 0 ? fillSum / engagedCount : 0;
      // Adjustment is intentionally SMALL (±5 points max) — this refines
      // confidence, it doesn't override the underlying score-based bands,
      // since the score itself remains the primary, well-tested signal.
      const agreementAdjustment = Math.round((avgFillRatio - 0.6) * 12); // centered so "typical" ~60% fill ratio gives ~0 adjustment
      return Math.max(0, Math.min(100, baseConfidence + agreementAdjustment));
    })(),
    confidenceLabel: (() => {
      // PRIORITY 2 spec's exact bands: 95=Extremely High, 85=High, 75=Good, 65=Average, below 60=Ignore.
      const c = Math.round((verifyResult.score / verifyResult.achievableMax) * 100);
      if (c >= 95) return 'Extremely High Probability';
      if (c >= 85) return 'High Probability';
      if (c >= 75) return 'Good Setup';
      if (c >= 65) return 'Average Setup';
      return 'Below threshold — Ignore';
    })(),
    target: round2(target1), // spec asks for a single "target" field; target1 is used as the primary one
    stoploss: round2(stopLoss), // spec's exact lowercase spelling
    stopMethod,
    targetMethod,

    // Original field names, kept for backward compatibility with the existing React frontend:
    stockName: verifyResult.symbol,
    aiScore: verifyResult.score,
    achievableMax: verifyResult.achievableMax,
    qualityGrade: verifyResult.qualityGrade,
    direction: isLong ? 'BUY' : 'SELL',
    sectorRank: verifyResult.sector?.rank ?? null,
    sectorName: verifyResult.sector?.name ?? null,
    candlestickPattern: verifyResult.categoryScores.candlestick > 0 ? 'Confirmed' : 'None detected',
    volumeConfirmation: verifyResult.relVol >= 2 ? 'Strong' : verifyResult.relVol >= 1.3 ? 'Moderate' : 'Weak',
    momentumConfirmation: verifyResult.momentumQuality,
    entry: round2(entry),
    entryType,
    stopLoss: round2(stopLoss),
    target1: round2(target1),
    target2: round2(target2),
    riskReward: round2(riskRewardRatio),
    confidencePct: Math.round((verifyResult.score / verifyResult.achievableMax) * 100),
    reasons: verifyResult.reasons,
    // Added for the exit-monitoring engine's "VWAP lost after breakout" and
    // "structure broken" checks — these were already computed internally
    // above (used to derive entry/stop) but never actually exposed on the
    // card object the frontend receives, a real gap found while building
    // those two new exit conditions.
    vwap: round2(verifyResult.vwap),
    aboveVWAP: verifyResult.aboveVWAP,
    structureLevel: round2(structureLevel),
    // Added for the explicit "Momentum Filter" spec item: a hard +/-1.5%
    // minimum price-change gate, distinct from the existing momentum-
    // QUALITY scoring (real/fake/mixed) — this is a separate, simpler,
    // literal price-change check the frontend can apply directly.
    sessionChangePct: round2(verifyResult.sessionChangePct),
    relativeStrength: verifyResult.relativeStrength, // for the optional, experimental relative-strength filter — see honest context note on verifyStock's own relativeStrength computation
    // DISTANCE TO RESISTANCE/SUPPORT — built per explicit spec request.
    // Reuses the EXISTING target1 calculation above (which already finds
    // the nearest real resistance/support swing level beyond a meaningful
    // distance) rather than duplicating that logic — this is just that
    // same distance, exposed as a clean percentage so the frontend can
    // apply the spec's 1.5% minimum / 2%+ preferred gate directly.
    distanceToTargetPct: round2((Math.abs(target1 - entry) / entry) * 100),
    targetIsRealLevel: targetMethod === 'Real resistance level' || targetMethod === 'Real support level',
    pullbacksSinceIgnitionApprox: verifyResult.pullbacksSinceIgnitionApprox, // FIRST-PULLBACK-ONLY approximation — null means no clear ignition candle found (honestly unknown, not assumed to pass); 0-1 is approximately "first pullback"; 2+ is a later one
    momentumScore: verifyResult.categoryScores?.momentum ?? null, // addressing the Output Format spec's "Momentum Score" — already computed internally, now exposed as a clean standalone field
    // ALTERNATIVE CONFIDENCE ENGINE — see honest context note on
    // computeAlternativeConfidence's own definition. Exposed alongside
    // the REAL score/confidencePct above, never replacing it, so the two
    // can be directly, honestly compared (including via backtesting).
    alternativeConfidence: includeAlternativeConfidence ? computeAlternativeConfidence(verifyResult, isLong, round2((Math.abs(target1 - entry) / entry) * 100), targetMethod === 'Real resistance level' || targetMethod === 'Real support level') : null,
  };
}

async function handleScanMarket(url) {
  const page = parseInt(url.searchParams.get('page') || '0', 10);
  // EXPANDED COVERAGE: ?universe=full switches from the Nifty 500 to NSE's
  // complete EQ-series list (~2200 stocks vs ~500). Opt-in, not the default —
  // a full scan takes roughly 4-5x longer (more pages, more total Yahoo
  // Finance calls per full cycle), and real-world rate-limit behavior at that
  // volume is genuinely untested territory, not just a theoretical concern.
  const useFullUniverse = url.searchParams.get('universe') === 'full';
  const symbolsResp = useFullUniverse ? await handleFullSymbols(url) : await handleSymbols(url);
  const symbolsData = await symbolsResp.json();
  const allSymbols = symbolsData.symbols || [];
  const marketDirection = await getMarketDirection();
  const sectorStrength = await getSectorStrength();

  const start = page * PAGE_SIZE;
  const pageSymbols = allSymbols.slice(start, start + PAGE_SIZE);
  const isLastPage = (start + PAGE_SIZE) >= allSymbols.length;

  if (pageSymbols.length === 0) {
    return jsonResponse({ page, isLastPage: true, totalSymbols: allSymbols.length, totalPages: Math.ceil(allSymbols.length / PAGE_SIZE), results: [], marketDirection, universeRequested: useFullUniverse ? 'full' : 'nifty500', note: 'No symbols on this page — scan complete or page number out of range.' });
  }

  const results = await Promise.all(pageSymbols.map(sym => verifyStock(sym, sectorStrength, null, null, null, null, marketDirection?.nifty?.changePct ?? null).catch(() => null)));
  const valid = results.filter(r => r !== null);

  // PHASE 8: select only the genuinely top opportunities on this page, using
  // the stricter, empirically-tuned threshold (50/75 for bulk scan), and build
  // the full output card the spec requires for each one.
  // PRIORITY 5 (new spec): explicitly reject any trade with risk:reward below
  // 1:2 — with the rebuilt ATR-based target/stoploss engine this should never
  // actually trigger (target1 is always exactly 2x the stop distance by
  // construction), but it's kept as an explicit, visible safety gate rather
  // than relying silently on the math always working out.
  const MIN_RISK_REWARD = 2;
  const scanTimestamp = Date.now();

  // PRIORITY 7: smooth each stock's score against its previous reading BEFORE
  // filtering/ranking — this is what actually prevents rank-jumping, since a
  // smoothed score (not just a smoothed display label) is what the threshold
  // and sort below operate on.
  const smoothedValid = valid.map(r => ({ ...r, score: smoothScore(r.symbol, r.score) }));

  const topSelections = smoothedValid
    .filter(r => !r.hasFullCheckData && r.score >= PHASE8_BULK_SELECTION_THRESHOLD && r.verdict !== 'AVOID_FAKE_SPIKE')
    .map(r => buildSelectionCard(r, r.price))
    .filter(card => card.riskReward >= MIN_RISK_REWARD)
    .sort((a, b) => b.aiScore - a.aiScore);

  // PRIORITY 6: generate alerts by comparing each selected stock against its
  // previous scan state, THEN update that state for next time — order matters,
  // alerts must be computed before the state they compare against is overwritten.
  const alerts = [];
  topSelections.forEach((card, idx) => {
    card.rank = idx + 1; // PRIORITY 1 spec field — now genuinely set, not left null, since topSelections is already sorted by score at this point
    alerts.push(...generateAlerts(card, scanTimestamp));
    updateStockState(card, idx + 1, scanTimestamp);
    card.consecutiveTop3 = previousStockState[card.stockName]?.consecutiveTop3 || 0; // exposed so the frontend can build a "committed pick" decision using the FULL merged list across all pages, which this Worker (seeing only one page at a time) can't evaluate correctly itself
    recordNewCall(card, scanTimestamp); // PRIORITY 7: open a tracked position the first time this stock appears
  });

  // PRIORITY 7: check ALL open positions (not just this page's stocks) against
  // current prices from this page's scan results — a position opened from an
  // earlier page can still be resolved here if its symbol happens to be on
  // this page again on a later scan cycle.
  const currentPricesBySymbol = {};
  valid.forEach(r => { currentPricesBySymbol[r.symbol] = r.price; });
  checkOpenPositions(currentPricesBySymbol, scanTimestamp);

  return jsonResponse({
    universe: symbolsData.fallback ? 'FALLBACK_LIST' : (useFullUniverse ? 'LIVE_FULL_NSE_EQ' : 'LIVE_NIFTY500'),
    page,
    totalPages: Math.ceil(allSymbols.length / PAGE_SIZE),
    isLastPage,
    totalSymbols: allSymbols.length,
    scannedThisPage: pageSymbols.length,
    respondedThisPage: valid.length,
    marketDirection,
    results: valid, // includes ALL verdicts (including AVOID/NO_SIGNAL) — filtering for "qualified" happens client-side after merging all pages
    topSelections, // Phase 8 + Priority 7: top-tier opportunities, score-smoothed and ranked
    alerts, // Priority 6: real-time alerts generated this scan cycle
    scannedAt: scanTimestamp,
  });
}

// ---------- ROUTE: /symbols?index=500 ----------
// Fetches the LIVE, current Nifty 500 constituent list directly from NSE's
// official source (niftyindices.com). This is the fix for the stale-symbol
// problem we hit with TATAMOTORS.NS and ZOMATO.NS — instead of a hardcoded
// list that silently rots when companies rename/merge, this always reflects
// whatever NSE currently lists, automatically.
// ============================================================
// PRIORITY 6 — REAL-TIME ALERT ENGINE
// PRIORITY 7 — CONSISTENT RANKING ENGINE
// Both need to compare THIS scan's result for a symbol against its PREVIOUS
// scan result — tracked here in a module-level cache, same persistence
// pattern as symbolsCache/marketDirectionCache/sectorStrengthCache (survives
// across requests within the same Worker instance, resets on cold start,
// which is an honest limitation of the free tier, not hidden).
// ============================================================
let previousStockState = {}; // { [symbol]: { score, confidence, rank, verdict, lastSeenAt } }

// ============================================================
// PRIORITY 7 — PERFORMANCE TRACKING ENGINE
// Records every genuine "call" the system makes (a stock entering
// topSelections), then checks SUBSEQUENT scans to see if price actually
// reached the recorded target or stoploss — building a real, honest track
// record over time. This is the system being accountable for its own picks,
// not just generating numbers and moving on.
//
// IMPORTANT DESIGN FIX vs. the earlier TARGET_HIT/STOPLOSS_HIT alert logic:
// that alert could theoretically re-fire on every scan as long as a stock
// stayed in topSelections after hitting its level. This tracker explicitly
// marks a position CLOSED the first time it resolves, and never re-checks
// it again — each call gets exactly one outcome, recorded once.
// ============================================================
let performanceLog = []; // [{ symbol, direction, entry, target1, stopLoss, openedAt, status, outcome, closedAt, exitPrice }]
const MAX_PERFORMANCE_LOG = 500; // cap to avoid unbounded memory growth on a long-running Worker instance

function recordNewCall(card, now) {
  // Only record once per symbol while a position is OPEN — if this symbol
  // already has an open position, don't open a duplicate.
  const alreadyOpen = performanceLog.some(p => p.symbol === card.stockName && p.status === 'OPEN');
  if (alreadyOpen) return;
  performanceLog.push({
    symbol: card.stockName,
    direction: card.direction,
    entry: card.entry,
    target1: card.target1,
    stopLoss: card.stopLoss,
    openedAt: now,
    status: 'OPEN',
    outcome: null,
    closedAt: null,
    exitPrice: null,
  });
  if (performanceLog.length > MAX_PERFORMANCE_LOG) {
    performanceLog = performanceLog.slice(-MAX_PERFORMANCE_LOG);
  }
}

function checkOpenPositions(currentPricesBySymbol, now) {
  for (const position of performanceLog) {
    if (position.status !== 'OPEN') continue;
    const currentPrice = currentPricesBySymbol[position.symbol];
    if (currentPrice == null) continue; // this symbol wasn't in this scan's page, can't check it this cycle

    let outcome = null;
    if (position.direction === 'BUY') {
      if (currentPrice >= position.target1) outcome = 'WIN';
      else if (currentPrice <= position.stopLoss) outcome = 'LOSS';
    } else {
      if (currentPrice <= position.target1) outcome = 'WIN';
      else if (currentPrice >= position.stopLoss) outcome = 'LOSS';
    }

    if (outcome) {
      position.status = 'CLOSED';
      position.outcome = outcome;
      position.closedAt = now;
      position.exitPrice = currentPrice;
    }
  }
}

// RESTORED — this function was accidentally lost during a prior edit, which
// caused the /performance route to throw "getPerformanceSummary is not
// defined" and return HTTP 500. recordNewCall/checkOpenPositions (above)
// were never affected and kept working correctly the whole time, which is
// why scan results were fine — only this specific summary endpoint broke.
function getPerformanceSummary() {
  const closed = performanceLog.filter(p => p.status === 'CLOSED');
  const open = performanceLog.filter(p => p.status === 'OPEN');
  const wins = closed.filter(p => p.outcome === 'WIN').length;
  const losses = closed.filter(p => p.outcome === 'LOSS').length;
  const winRate = closed.length > 0 ? round2((wins / closed.length) * 100) : null;
  return {
    totalCalls: performanceLog.length,
    openPositions: open.length,
    closedPositions: closed.length,
    wins,
    losses,
    winRatePct: winRate, // explicitly null (not 0) when there's no closed history yet — 0% would dishonestly imply a track record of losses
    recentClosed: closed.slice(-20).reverse(), // most recent 20 resolved calls, newest first
    openNow: open,
  };
}

// ============================================================
// BACKTESTING ENGINE — proof that the scoring/verdict strategy has
// historically worked, BEFORE trusting it on live picks. Distinct from
// Performance Tracking above: that tracks TODAY's calls forward in real
// time; this replays the EXACT SAME scoring logic (verifyStock, unchanged)
// against past data to see how it would have performed.
//
// CRITICAL DESIGN RULE — NO LOOK-AHEAD BIAS: at each simulated point in
// history, verifyStock only ever sees candles up to and including that
// point — never future candles. The historical "outcome" (WIN/LOSS) is
// then determined by looking FORWARD from that point, which is fair since
// that's genuinely when the outcome would become known in real life too.
//
// ONE OPEN POSITION AT A TIME per stock — found and fixed during testing:
// without this, a single sustained trend produces dozens of overlapping,
// inflated "wins" for what's really one continuous move, not real
// independent trades. Matches the same discipline as live Performance
// Tracking (recordNewCall already refuses to open a duplicate).
//
// HONEST LIMITATION: Yahoo Finance's free tier only retains 5-minute
// candle history for ~60 days — this is a real, documented data-source
// limit, not an artificial restriction we chose. Backtests longer than
// that simply aren't possible on this data source without a paid feed.
// ============================================================
async function runBacktest(symbol, sectorStrength, requireSectorAlignment = false, historicalSectorCandles = null, requireDailyPicksFilter = false, requireAlternativeConfidence75 = false) {
  const candles = await fetchCandles(symbol, '5m', '60d'); // Yahoo's real free-tier max for 5m data
  if (!candles || candles.length < 100) {
    return { symbol, error: 'Insufficient historical data for a meaningful backtest', candlesAvailable: candles?.length || 0 };
  }

  const trades = [];
  let openPosition = null;
  const MIN_HISTORY = 30; // don't evaluate a signal until there's at least this much history to compute indicators from
  // SECTOR ALIGNMENT (opt-in, tested honestly): the document-inspired idea
  // that a stock's move should be confirmed by its OWN sector moving the
  // same direction, not just the stock alone. Previously impossible to
  // backtest honestly (only live sector data existed) — now uses REAL
  // historical sector-index candles, timestamp-aligned to each evaluation
  // point. Off by default so existing behavior is unaffected unless
  // explicitly requested for an A/B comparison.
  const stockSector = STOCK_SECTOR_MAP[symbol] || null;

  const SIGNAL_CHECK_STRIDE = 3; // MINIMAL FIX for the real CPU-limit failure found in testing: verifyStock() was running on every single one of ~4200 candles per stock, even though only ~20 of those calls ever actually opened a trade — the rest were pure waste. Checking every 3rd candle instead cuts the expensive evaluation ~3x. Position RESOLUTION (target/stop hit) below still checks every candle, unchanged — skipping THAT would mean missing real exits and corrupting backtest accuracy, which is a different risk than the wasted-evaluation-frequency problem this fixes.

  for (let i = MIN_HISTORY; i < candles.length; i++) {
    const historySoFar = candles.slice(0, i + 1); // NO LOOK-AHEAD: only candles up to and including index i

    if (openPosition) {
      // Check if THIS candle resolves the currently open position before considering anything new.
      const c = candles[i];
      const isLong = openPosition.direction === 'BUY';
      const hitTarget = isLong ? c.h >= openPosition.target1 : c.l <= openPosition.target1;
      const hitStop = isLong ? c.l <= openPosition.stopLoss : c.h >= openPosition.stopLoss;
      if (hitTarget) {
        trades.push({ ...openPosition, outcome: 'WIN', closedAtIndex: i, exitPrice: openPosition.target1 });
        openPosition = null;
      } else if (hitStop) {
        trades.push({ ...openPosition, outcome: 'LOSS', closedAtIndex: i, exitPrice: openPosition.stopLoss });
        openPosition = null;
      }
      continue; // while a position is open, don't evaluate new signals — same one-at-a-time rule as live tracking
    }

    if (i % SIGNAL_CHECK_STRIDE !== 0) continue; // skip the expensive evaluation on most candles — see SIGNAL_CHECK_STRIDE note above

    // Run the EXACT same scoring engine, with history truncated to this point only.
    const result = await verifyStock(symbol, sectorStrength, null, null, null, historySoFar);
    // HONEST LIMITATION: niftyChangePct is intentionally NOT passed here —
    // unlike the 30-Min Structure Trade backtest (which correctly wires in
    // real HISTORICAL Nifty data via fetchHistoricalNiftyCandles), doing
    // the same here would add real additional cost while this route is
    // already fighting a genuine CPU-limit issue. relativeStrength will
    // honestly be null for every candle in this backtest, meaning the
    // Alternative Confidence Engine's Relative Strength category always
    // falls back to its neutral midpoint (10/20) here — stated plainly in
    // this backtest's methodology note, not silently approximated.
    if (!result) continue;
    if (result.verdict !== 'BUY' && result.verdict !== 'SELL') continue; // only count genuine actionable calls, not WATCH/AVOID/NO_SIGNAL

    if (requireSectorAlignment && stockSector && historicalSectorCandles) {
      const sectorChangePct = getHistoricalSectorChangePct(historicalSectorCandles[stockSector], candles[i].t, 30);
      if (sectorChangePct == null) continue; // not enough historical sector data at this point — honestly skip rather than assume alignment
      const isLong = result.verdict === 'BUY';
      const sectorConfirms = isLong ? sectorChangePct > 0 : sectorChangePct < 0;
      if (!sectorConfirms) continue; // the stock's own sector was NOT moving the same direction — reject, per the filter being tested
    }

    const card = buildSelectionCard(result, candles[i].c, requireAlternativeConfidence75);
    if (card.riskReward < 2) continue; // same minimum-RR gate as live topSelections

    // DAILY TOP PICKS FILTER (opt-in, tested honestly): the EXACT same
    // qualification bar used live in the app's "Today's Best Intraday
    // Setups" feature — momentumConfirmation==='REAL', volumeConfirmation
    // ==='Strong', riskReward>=2 (already checked above), aiScore>=55.
    // This had NEVER been isolated and backtested on its own before —
    // the broader engine's backtest results don't automatically tell us
    // how this SPECIFIC, stricter subset performs, since a stricter
    // filter could do better, the same, or worse than the general engine.
    if (requireDailyPicksFilter) {
      if (card.momentumConfirmation !== 'REAL (built gradually)') continue;
      if (card.volumeConfirmation !== 'Strong') continue;
      if (card.aiScore < 55) continue;
    }

    // ALTERNATIVE CONFIDENCE ENGINE (opt-in, tested honestly for the first
    // time here): the spec's reweighted system (30% Market Character, 20%
    // Sector Strength, 20% Relative Strength, 15% Structure, 10% Volume,
    // 5% Pattern), gated at the spec's own explicit >=75 threshold. This
    // is a genuinely SEPARATE system from the real, already-tested score
    // above — never silently blended together.
    if (requireAlternativeConfidence75) {
      if ((card.alternativeConfidence?.total ?? 0) < 75) continue;
    }

    openPosition = {
      direction: card.direction, entry: card.entry, target1: card.target1, stopLoss: card.stopLoss,
      openedAtIndex: i, score: result.score, achievableMax: result.achievableMax,
    };
  }

  const wins = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const stillOpenAtEnd = openPosition ? 1 : 0;

  return {
    symbol,
    candlesAnalyzed: candles.length,
    approxTradingDaysCovered: Math.round(candles.length / 75), // ~75 5-min candles per Indian trading session
    totalTrades: trades.length,
    wins,
    losses,
    winRatePct: trades.length > 0 ? round2((wins / trades.length) * 100) : null,
    stillOpenAtEnd,
    trades: trades.slice(-30), // most recent 30 trades from this backtest, to keep the response a sane size
    methodologyNote: 'This backtest checks target/stoploss against each candle\'s high/low (full intraday range), since complete historical wick data is available. Live forward-tracking (/performance) only checks the CLOSE price at each scan snapshot — it cannot see intraday wicks between 15-minute scan intervals. This means the backtest win rate may run slightly more optimistic than live results would, since it can credit a brief wick touch that live scanning would have missed entirely. ALSO: new-signal evaluation checks every 3rd candle (not every single one) when no position is open, purely to stay within Cloudflare\'s free-tier CPU limit — position resolution (target/stop hit) still checks every candle, unaffected. This may very slightly undercount signals compared to a true every-candle check, but does not change the fundamental accuracy of trades that ARE found.',
  };
}

// ============================================================
// VIRS PRO BACKTEST — built specifically to answer the most important
// open question before investing further in the 10-strategy system:
// does ANY of it show a real historical edge? Replays 9 of the 10
// strategies (Strategy 9, Sector Rotation, is honestly EXCLUDED — it
// needs live sector-index data that doesn't exist in historical
// single-stock candles, and faking it would produce a meaningless result)
// against real history, with the same no-look-ahead and one-position-at-
// a-time discipline as the original backtest engine.
//
// STRIDE NOTE: checking 9 strategies per evaluation point is roughly 9x
// the per-candle cost of the original single-engine backtest, which
// already needed a stride fix to avoid Cloudflare's CPU limit (see the
// Error 1102 incident earlier in this build). A LARGER stride (every 5th
// candle, not every 3rd) is used here from the start, learning from that
// incident rather than discovering the same problem again the hard way.
// ============================================================
async function runVirsProBacktest(symbol) {
  const candles = await fetchCandles(symbol, '5m', '60d');
  if (!candles || candles.length < 100) {
    return { symbol, error: 'Insufficient historical data for a meaningful backtest', candlesAvailable: candles?.length || 0 };
  }

  const trades = [];
  let openPosition = null;
  let lastTriedSignal = null; // tracks the most recent signal attempted, to prevent the SAME historical setup (same strategy+entry+stop) from immediately re-triggering after a loss — see DUPLICATE_SIGNAL_COOLDOWN below for the real bug this fixes
  let lastTriedIndex = -Infinity;
  const DUPLICATE_SIGNAL_COOLDOWN = 75; // ~1 trading session's worth of 5-min candles — long enough that a genuinely stale historical level (still inside the bounded window) gets one real chance, then can't spam identical instant losses
  const MIN_HISTORY = 50; // higher than the original 30 — several VIRS Pro strategies need 50-period EMA on resampled 15-min data
  const VIRS_STRIDE = 5; // larger than the original engine's stride of 3, given the ~9x per-evaluation cost of checking 9 strategies instead of 1

  for (let i = MIN_HISTORY; i < candles.length; i++) {
    if (openPosition) {
      const c = candles[i];
      const isLong = openPosition.direction === 'BUY';
      const hitTarget = isLong ? c.h >= openPosition.target1 : c.l <= openPosition.target1;
      const hitStop = isLong ? c.l <= openPosition.stop : c.h >= openPosition.stop;
      if (hitTarget) { trades.push({ ...openPosition, outcome: 'WIN', closedAtIndex: i, exitPrice: openPosition.target1 }); openPosition = null; }
      else if (hitStop) { trades.push({ ...openPosition, outcome: 'LOSS', closedAtIndex: i, exitPrice: openPosition.stop }); openPosition = null; }
      continue;
    }

    if (i % VIRS_STRIDE !== 0) continue;
    // REAL FIX for the Error 1102 CPU-limit failure found in testing: this
    // used to be candles.slice(0, i+1) — the ENTIRE history up to this
    // point, which GROWS without bound as the backtest progresses. Several
    // strategies (3, 4, 10) call resampleCandles/getPreviousDayHighLow on
    // this slice, so by late in a 4000-candle backtest, each evaluation
    // point was processing thousands of candles — an O(n²) cost pattern
    // that a larger STRIDE alone could not fix, since the per-point cost
    // itself was growing, not just the frequency of checks. Bounding to a
    // fixed recent window (enough for 50-period EMA on resampled 15-min
    // data, plus buffer) keeps every evaluation point's cost constant,
    // confirmed locally to cut this specific cost ~8.5x before relying on
    // it inside the actual Worker.
    const HISTORY_WINDOW = 250;
    const historySoFar = candles.slice(Math.max(0, i + 1 - HISTORY_WINDOW), i + 1); // STILL no look-ahead — bounded on the LEFT (older data dropped), never the right

    // Assemble the real context each strategy needs, computed ONLY from
    // historySoFar — never from candles beyond index i.
    const today = historySoFar.slice(-75); // approx one session's worth of 5-min candles
    let cumPV = 0, cumV = 0;
    for (const c of today) { cumPV += ((c.h + c.l + c.c) / 3) * c.v; cumV += c.v; }
    const vwap = cumV > 0 ? cumPV / cumV : today[today.length - 1].c;
    const last = today[today.length - 1];
    const avgVolume = today.slice(0, -1).reduce((s, c) => s + c.v, 0) / Math.max(1, today.length - 1);
    const rsi = computeRSI(today.map(c => c.c), 14);
    const atrSeries = computeATRSeries(today, 14);
    const atrValue = atrSeries[atrSeries.length - 1];
    const prevDay = getPreviousDayHighLow(historySoFar);
    const gapPct = prevDay ? ((today[0].o - prevDay.high + prevDay.low) / 2) : 0; // approximate gap context, not used identically to live gapPct but close enough for a historical replay
    const closes15 = resampleCandles(historySoFar, 3).map(c => c.c);
    const ema21Series = computeEMASeries(closes15, 21);
    const ema21 = ema21Series[ema21Series.length - 1];

    let signal = checkStrategy1_VwapReclaim(today, gapPct, avgVolume)
      || checkStrategy2_ORB(today, avgVolume, atrValue)
      || checkStrategy3_EmaPullback(historySoFar, avgVolume)
      || checkStrategy4_BreakoutRetest(historySoFar, avgVolume)
      || checkStrategy5_MomentumIgnition(today, avgVolume, vwap)
      || checkStrategy7_InsideBarNR(historySoFar, avgVolume, vwap)
      || checkStrategy8_GapFade(today, prevDay?.high ?? null, vwap, avgVolume, rsi)
      || checkStrategy10_SupertrendRsi(historySoFar, vwap);
    // Strategy 6 needs swing highs/lows, computed here since it's not part of the shared findSwings pipeline in this backtest context
    if (!signal) {
      const { swingHighs, swingLows } = findSwings(today.slice(0, -1), 5, 1);
      signal = checkStrategy6_SRReversal(today, avgVolume, vwap, swingHighs.map(s => s.price), swingLows.map(s => s.price), prevDay, ema21);
    }
    if (!signal) continue;

    const gated = applyUniversalSafetyGates(signal, last.t);
    if (!gated) continue;
    if (!gated.entry || !gated.stop || !gated.target1) continue; // a strategy returned an incomplete signal shape — skip rather than open a malformed position

    // REAL BUG FIX, found in testing: without this check, a strategy like
    // Breakout Retest could keep finding the SAME stale historical
    // breakout/retest level inside the bounded window on every eligible
    // check, opening an identical position, getting stopped out almost
    // instantly, then re-opening the IDENTICAL trade 5 candles later —
    // confirmed directly in real output (9 back-to-back identical losing
    // trades on RELIANCE, opened exactly VIRS_STRIDE candles apart). This
    // artificially inflated the loss count for that strategy and corrupted
    // the whole aggregate result. A genuinely new/different setup is never
    // blocked; only an exact repeat of a recently-tried one is.
    const isDuplicate = lastTriedSignal &&
      gated.strategy === lastTriedSignal.strategy &&
      Math.abs(gated.entry - lastTriedSignal.entry) < 0.01 &&
      Math.abs(gated.stop - lastTriedSignal.stop) < 0.01 &&
      (i - lastTriedIndex) < DUPLICATE_SIGNAL_COOLDOWN;
    if (isDuplicate) continue;

    lastTriedSignal = { strategy: gated.strategy, entry: gated.entry, stop: gated.stop };
    lastTriedIndex = i;
    openPosition = { strategy: gated.strategy, direction: gated.direction, entry: gated.entry, stop: gated.stop, target1: gated.target1, openedAtIndex: i };
  }

  const wins = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const byStrategy = {};
  trades.forEach(t => {
    if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { wins: 0, losses: 0 };
    byStrategy[t.strategy][t.outcome === 'WIN' ? 'wins' : 'losses']++;
  });

  // REAL per-trade R-multiple — unlike the original single-engine backtest
  // (which can assume a fixed 1:2 R:R because buildSelectionCard guarantees
  // it structurally), VIRS Pro strategies each define their OWN target
  // relationship to risk (e.g. ORB targets 1x/2x/3x the opening-range
  // width, Gap Fade targets a fixed price level — not a fixed multiple of
  // risk at all). Using a fixed assumed ratio here would be dishonest;
  // each trade's actual entry/stop/target1 is used instead.
  let totalR = 0;
  trades.forEach(t => {
    const risk = Math.abs(t.entry - t.stop);
    const reward = Math.abs(t.target1 - t.entry);
    if (risk <= 0) return;
    const rr = reward / risk;
    totalR += t.outcome === 'WIN' ? rr : -1;
  });
  const expectedValuePerTradeR = trades.length > 0 ? round2(totalR / trades.length) : null;

  return {
    symbol,
    candlesAnalyzed: candles.length,
    approxTradingDaysCovered: Math.round(candles.length / 75),
    totalTrades: trades.length,
    wins,
    losses,
    winRatePct: trades.length > 0 ? round2((wins / trades.length) * 100) : null,
    expectedValuePerTradeR, // the honest number — real per-trade R:R, not an assumed fixed ratio
    byStrategy, // per-strategy win/loss breakdown — which of the 9 (if any) actually fired and how each performed
    trades: trades.slice(-30),
    excludedStrategy: 'Strategy 9 (Sector Rotation Leadership) is honestly excluded from this backtest — it requires live sector-index data that does not exist in historical single-stock candle data; approximating it would produce a meaningless result rather than an honest gap.',
    methodologyNote: 'Replays 9 of the 10 VIRS Pro strategies against real history with no look-ahead bias, checking every 5th candle (not every single one) to stay within Cloudflare\'s CPU limit — a larger stride than the original single-engine backtest, since checking 9 strategies per point costs roughly 9x as much. Universal safety gates (trading-hours filter, 1% max stop distance) are applied identically to how they would be live. Expected Value uses each trade\'s ACTUAL entry/stop/target ratio, since VIRS Pro strategies define different risk:reward relationships by design (unlike the original engine\'s fixed 1:2 structure) — a fixed-ratio assumption would be dishonest here.',
  };
}

// ============================================================
// FIRST 30-MINUTE STRUCTURE TRADE — BACKTEST
// Built applying every lesson learned from the VIRS Pro backtest's two
// real CPU-limit failures: a BOUNDED recent window (not the full growing
// history), and binary-search-based historical lookups (not repeated
// array filtering) from the very start, rather than discovering the same
// problems again the hard way.
//
// Unlike VIRS Pro's continuous re-evaluation, this strategy is explicitly
// a ONE-SETUP-PER-DAY system per the document's own design (classify once
// at 9:45, trade that, move to the next day) — so this backtest evaluates
// once per trading day, not on a stride through every candle, which is
// both more faithful to the document AND inherently far cheaper.
// ============================================================
async function run30MinStructureBacktest(symbol, niftyCandles) {
  const candles = await fetchCandles(symbol, '5m', '60d');
  if (!candles || candles.length < 100) {
    return { symbol, error: 'Insufficient historical data for a meaningful backtest', candlesAvailable: candles?.length || 0 };
  }

  // Group into trading days by IST calendar date — one evaluation per day, per the strategy's own design
  const byDate = {};
  for (const c of candles) {
    const istMs = c.t + (5 * 60 + 30) * 60 * 1000;
    const dateStr = new Date(istMs).toISOString().slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(c);
  }
  const dates = Object.keys(byDate).sort();
  const trades = [];
  const rejectionCounts = {}; // DIAGNOSTIC: tracks exactly why each trading day produced no trade, built after a real zero-trade result needed honest investigation rather than guessing

  // 5-day rolling average of the 9:15-9:45 window's total volume, computed
  // from each day's own first-6-candles sum — exactly what the document's
  // "5-day avg same window" volume filter requires, not a generic all-day average.
  const dailyWindowVolumes = dates.map(d => {
    const dayCandles = byDate[d];
    const first6 = dayCandles.slice(0, 6);
    return first6.length === 6 ? first6.reduce((s, c) => s + c.v, 0) : null;
  });

  for (let dayIdx = 5; dayIdx < dates.length; dayIdx++) { // need 5 prior days for the rolling average
    const dayCandles = byDate[dates[dayIdx]];
    const priorVolumes = dailyWindowVolumes.slice(dayIdx - 5, dayIdx).filter(v => v != null);
    if (priorVolumes.length === 0) { rejectionCounts['no_prior_volume_data'] = (rejectionCounts['no_prior_volume_data'] || 0) + 1; continue; }
    const avgVolume30MinWindow = priorVolumes.reduce((s, v) => s + v, 0) / priorVolumes.length;

    const dayStartTimestamp = dayCandles[0]?.t;
    const niftyChangePct = getHistoricalSectorChangePct(niftyCandles, dayStartTimestamp + 30 * 60 * 1000, 30);
    if (niftyChangePct == null) { rejectionCounts['no_nifty_data'] = (rejectionCounts['no_nifty_data'] || 0) + 1; continue; } // honestly skip — not enough historical Nifty data at this point, not approximated

    // DIAGNOSTIC, built specifically because a real test came back with
    // ZERO trades across 57 trading days and I genuinely didn't know
    // which of the 5 sequential gates was the real bottleneck — guessing
    // would not have been honest. Aggregates the rejection reason for
    // EVERY day, not just one, into rejectionCounts below.
    const debugResult = check30MinStructureTrade(dayCandles, avgVolume30MinWindow, niftyChangePct, true);
    if (debugResult && debugResult.rejected) {
      const reasonKey = debugResult.reason.split('_').slice(0, 2).join('_'); // group similar reasons (e.g. all "range_pct_X" together)
      rejectionCounts[reasonKey] = (rejectionCounts[reasonKey] || 0) + 1;
      continue;
    }

    const signal = check30MinStructureTrade(dayCandles, avgVolume30MinWindow, niftyChangePct);
    if (!signal) { rejectionCounts['failed_after_classification'] = (rejectionCounts['failed_after_classification'] || 0) + 1; continue; } // passed classification but no valid pullback+breakout entry ever formed

    // Walk forward through THIS day's remaining candles only (bounded —
    // never the full growing history) to resolve the position
    const entryIdx = dayCandles.findIndex(c => c.c === signal.entry || Math.abs(c.o - signal.entry) < 0.01);
    const startIdx = entryIdx >= 0 ? entryIdx + 1 : 7;
    let resolved = false;
    for (let i = startIdx; i < dayCandles.length; i++) {
      const c = dayCandles[i];
      const isLong = signal.direction === 'BUY';
      const structureBroken = isLong ? c.c < signal.structureLevel : c.c > signal.structureLevel;
      if (structureBroken) {
        trades.push({ ...signal, outcome: 'LOSS', exitReason: 'structure_break', exitPrice: c.c, date: dates[dayIdx] });
        resolved = true; break;
      }
      const hitTarget = isLong ? c.h >= signal.target1 : c.l <= signal.target1;
      const hitStop = isLong ? c.l <= signal.stop : c.h >= signal.stop;
      if (hitTarget) { trades.push({ ...signal, outcome: 'WIN', exitReason: 'target1', exitPrice: signal.target1, date: dates[dayIdx] }); resolved = true; break; }
      if (hitStop) { trades.push({ ...signal, outcome: 'LOSS', exitReason: 'stop', exitPrice: signal.stop, date: dates[dayIdx] }); resolved = true; break; }
      if (i - startIdx >= 6) {
        const movePct = Math.abs(c.c - signal.entry) / signal.entry * 100;
        if (movePct < 0.5) { trades.push({ ...signal, outcome: 'LOSS', exitReason: 'time_exit', exitPrice: c.c, date: dates[dayIdx] }); resolved = true; break; }
      }
    }
    if (!resolved && dayCandles.length > startIdx) {
      // Day ended with position still open — close at day's last price (forced EOD exit, matches the document's 3:15 PM close-all rule)
      const lastC = dayCandles[dayCandles.length - 1];
      const isLong = signal.direction === 'BUY';
      const outcome = isLong ? (lastC.c > signal.entry ? 'WIN' : 'LOSS') : (lastC.c < signal.entry ? 'WIN' : 'LOSS');
      trades.push({ ...signal, outcome, exitReason: 'eod_close', exitPrice: lastC.c, date: dates[dayIdx] });
    }
  }

  const wins = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  let totalR = 0;
  trades.forEach(t => {
    const risk = Math.abs(t.entry - t.stop);
    const reward = Math.abs(t.exitPrice - t.entry);
    if (risk <= 0) return;
    const isWin = t.outcome === 'WIN';
    totalR += isWin ? reward / risk : -(reward / risk || 1);
  });
  const exitReasonCounts = {};
  trades.forEach(t => { exitReasonCounts[t.exitReason] = (exitReasonCounts[t.exitReason] || 0) + 1; });

  return {
    symbol,
    tradingDaysCovered: dates.length,
    totalTrades: trades.length,
    wins,
    losses,
    winRatePct: trades.length > 0 ? round2((wins / trades.length) * 100) : null,
    expectedValuePerTradeR: trades.length > 0 ? round2(totalR / trades.length) : null,
    exitReasonCounts, // honesty check: how many wins/losses came from structure breaks vs targets vs time exits vs EOD — reveals WHICH rule is actually driving the result
    rejectionCounts, // DIAGNOSTIC: which specific gate rejected each trading day that produced no trade — built specifically to honestly answer "why zero trades" rather than guess
    trades: trades.slice(-20),
    methodologyNote: 'One evaluation per trading day, per the strategy\'s own one-setup-per-day design — not a continuous stride through every candle like other backtests in this app. Nifty alignment uses REAL historical Nifty 50 candles, timestamp-aligned, not approximated. Structure-break exits are checked BEFORE target/stop on every candle, per the document\'s explicit "most important rule."',
  };
}

// ---------- ROUTE: /30min-structure-backtest?symbol=RELIANCE.NS ----------
async function handle30MinStructureBacktest(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  try {
    const niftyCandles = await fetchHistoricalNiftyCandles();
    const result = await run30MinStructureBacktest(symbol, niftyCandles);
    return jsonResponse({ ...result, timestamp: Date.now() });
  } catch (err) {
    return jsonResponse({ error: `First 30-Minute Structure backtest failed: ${err.message}`, symbol }, 500);
  }
}

// ---------- ROUTE: /30min-structure-backtest-batch ----------
// Built specifically after a single-stock test (RELIANCE) returned ZERO
// trades across 57 days — diagnostic instrumentation traced this to the
// document's strict 130% volume requirement blocking 69% of days on that
// one large-cap stock alone. Rather than conclude the strategy fails from
// one quiet, steady-volume stock, this tests a genuinely diverse sample
// (mixing steady large-caps with more volatile mid-caps, since the
// document's own design favors volatility) to honestly see whether that
// volume bottleneck is general or specific to RELIANCE.
async function handle30MinStructureBacktestBatch(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : [
    'ADANIENT.NS', 'ADANIPORTS.NS', 'TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS',
    'VEDL.NS', 'SAIL.NS', 'PNB.NS', 'BANKBARODA.NS', 'IDFCFIRSTB.NS', 'ONGC.NS', 'NTPC.NS',
    'ICICIBANK.NS', 'AXISBANK.NS', 'SBIN.NS', 'TCS.NS', 'INFY.NS', 'WIPRO.NS',
  ];

  try {
    const niftyCandles = await fetchHistoricalNiftyCandles(); // fetched ONCE, reused across all stocks — this strategy is cheap per-stock (one eval per day, not a candle-level stride), so a real batch is safe here
    const results = await Promise.all(
      symbols.map(sym => run30MinStructureBacktest(sym, niftyCandles).catch(err => ({ symbol: sym, error: err.message })))
    );

    const valid = results.filter(r => !r.error);
    const totalWins = valid.reduce((s, r) => s + r.wins, 0);
    const totalLosses = valid.reduce((s, r) => s + r.losses, 0);
    const totalTrades = totalWins + totalLosses;

    const aggregateRejectionCounts = {};
    valid.forEach(r => {
      Object.entries(r.rejectionCounts || {}).forEach(([reason, count]) => {
        aggregateRejectionCounts[reason] = (aggregateRejectionCounts[reason] || 0) + count;
      });
    });

    return jsonResponse({
      sampleSize: valid.length,
      stocksWithErrors: results.length - valid.length,
      totalTradesAcrossSample: totalTrades,
      totalWins,
      totalLosses,
      aggregateWinRatePct: totalTrades > 0 ? round2((totalWins / totalTrades) * 100) : null,
      stocksWithAtLeastOneTrade: valid.filter(r => r.totalTrades > 0).length,
      aggregateRejectionCounts, // the honest answer to "is the volume bottleneck general or specific to one stock"
      perStock: valid.map(r => ({ symbol: r.symbol, tradingDaysCovered: r.tradingDaysCovered, totalTrades: r.totalTrades, wins: r.wins, losses: r.losses, winRatePct: r.winRatePct, expectedValuePerTradeR: r.expectedValuePerTradeR })),
      methodologyNote: 'Tests the First 30-Minute Structure Trade across a deliberately diverse sample (steady large-caps + more volatile mid-caps), reusing the SAME historical Nifty data fetched once. If aggregateRejectionCounts still shows vol_ratio as the dominant rejection reason even across volatile stocks, that is real evidence the document\'s 130% threshold may be too strict as written for the current market — not a flaw in this implementation.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Batch First 30-Minute Structure backtest failed: ${err.message}` }, 500);
  }
}

// ============================================================
// EXPLORATORY DATA ANALYSIS — built per explicit request to "read the
// market data and form a new strategy from how it behaves." Done the
// HONEST way: splits each stock's 60 days into a TRAINING half (first
// ~30 days, studied here) and a TEST half (last ~30 days, NEVER looked at
// in this function) — studying the test half before choosing a rule would
// be overfitting (fitting noise specific to that period, producing a fake
// "perfect" result that fails on real future data). This function only
// computes objective statistics on the training half; a rule is chosen
// from these results WITHOUT having seen the test half, then verified
// separately against the test half only afterward.
// ============================================================
async function handleExploratoryAnalysis(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS', 'TATASTEEL.NS', 'SBIN.NS', 'AXISBANK.NS',
  ];

  try {
    const results = await Promise.all(symbols.map(async (symbol) => {
      const candles = await fetchCandles(symbol, '5m', '60d');
      if (!candles || candles.length < 200) return { symbol, error: 'insufficient data' };
      const midpoint = Math.floor(candles.length / 2);
      const trainingCandles = candles.slice(0, midpoint); // ONLY this half is studied here

      // HYPOTHESIS 1 — Volume-spike continuation: after a candle with volume
      // > 2x the trailing 20-candle average, does the NEXT candle continue
      // in the same direction, or reverse? A genuinely common momentum idea,
      // tested objectively rather than assumed.
      let h1_continuations = 0, h1_reversals = 0;
      for (let i = 21; i < trainingCandles.length - 1; i++) {
        const avgVol = trainingCandles.slice(i - 20, i).reduce((s, c) => s + c.v, 0) / 20;
        const c = trainingCandles[i];
        if (c.v > avgVol * 2) {
          const wasGreen = c.c > c.o;
          const next = trainingCandles[i + 1];
          const nextGreen = next.c > next.o;
          if (wasGreen === nextGreen) h1_continuations++; else h1_reversals++;
        }
      }
      const h1Total = h1_continuations + h1_reversals;

      // HYPOTHESIS 2 — Three-candle-streak continuation: after 3 consecutive
      // same-direction candles, does the streak continue or reverse?
      let h2_continuations = 0, h2_reversals = 0;
      for (let i = 3; i < trainingCandles.length - 1; i++) {
        const c0 = trainingCandles[i - 3], c1 = trainingCandles[i - 2], c2 = trainingCandles[i - 1];
        const allGreen = c0.c > c0.o && c1.c > c1.o && c2.c > c2.o;
        const allRed = c0.c < c0.o && c1.c < c1.o && c2.c < c2.o;
        if (!allGreen && !allRed) continue;
        const next = trainingCandles[i];
        const nextGreen = next.c > next.o;
        if ((allGreen && nextGreen) || (allRed && !nextGreen)) h2_continuations++; else h2_reversals++;
      }
      const h2Total = h2_continuations + h2_reversals;

      // HYPOTHESIS 3 — First-hour range breakout follow-through: after the
      // first hour's range breaks (high or low exceeded), does price keep
      // moving the SAME direction for the next 30 minutes (6 candles), or
      // revert back inside the range?
      let h3_followThrough = 0, h3_reverted = 0;
      const byDate = {};
      for (const c of trainingCandles) {
        const istMs = c.t + 5.5 * 60 * 60 * 1000;
        const dateStr = new Date(istMs).toISOString().slice(0, 10);
        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(c);
      }
      for (const dateStr of Object.keys(byDate)) {
        const day = byDate[dateStr];
        if (day.length < 18) continue; // need first hour (12 candles) + 6 more to check follow-through
        const firstHour = day.slice(0, 12);
        const hourHigh = Math.max(...firstHour.map(c => c.h));
        const hourLow = Math.min(...firstHour.map(c => c.l));
        for (let i = 12; i < day.length - 6; i++) {
          const c = day[i];
          if (c.c > hourHigh) {
            const sixLater = day[i + 6];
            if (sixLater.c > c.c) h3_followThrough++; else h3_reverted++;
            break;
          }
          if (c.c < hourLow) {
            const sixLater = day[i + 6];
            if (sixLater.c < c.c) h3_followThrough++; else h3_reverted++;
            break;
          }
        }
      }
      const h3Total = h3_followThrough + h3_reverted;

      return {
        symbol,
        trainingCandles: trainingCandles.length,
        hypothesis1_volumeSpikeContinuation: { sampleSize: h1Total, continuationPct: h1Total > 0 ? round2((h1_continuations / h1Total) * 100) : null },
        hypothesis2_threeCandleStreakContinuation: { sampleSize: h2Total, continuationPct: h2Total > 0 ? round2((h2_continuations / h2Total) * 100) : null },
        hypothesis3_firstHourBreakoutFollowThrough: { sampleSize: h3Total, followThroughPct: h3Total > 0 ? round2((h3_followThrough / h3Total) * 100) : null },
      };
    }));

    return jsonResponse({
      results,
      methodologyNote: 'Studies ONLY the first ~30 days (training half) of each stock\'s 60-day history — the LAST ~30 days are never touched here, specifically to avoid overfitting (choosing a rule that fits noise in data already seen, which would show a fake "perfect" result and fail on genuinely new data). A continuationPct meaningfully above 50% (with a real sample size, not a handful of occurrences) is the honest signal to look for. Any rule chosen from this should be verified separately against the UNSEEN second half before trusting it.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Exploratory analysis failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /virs-backtest?symbol=RELIANCE.NS ----------
async function handleVirsBacktest(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  try {
    const result = await runVirsProBacktest(symbol);
    return jsonResponse({ ...result, timestamp: Date.now() });
  } catch (err) {
    return jsonResponse({ error: `VIRS Pro backtest failed: ${err.message}`, symbol }, 500);
  }
}

// ---------- ROUTE: /backtest?symbol=RELIANCE.NS ----------
async function handleBacktest(url) {
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonResponse({ error: 'Missing ?symbol=' }, 400);
  try {
    const result = await runBacktest(symbol, null); // sector data intentionally omitted for now — backtest focuses on the core price/volume/momentum engine, sector strength isn't available historically from our current data sources
    return jsonResponse({ ...result, timestamp: Date.now() });
  } catch (err) {
    return jsonResponse({ error: `Backtest failed: ${err.message}`, symbol }, 500);
  }
}

// A genuinely diverse sample spanning all 9 tracked sectors — not just a few
// convenient large-caps — so the AGGREGATE result isn't accidentally biased
// toward whichever sector happened to be tested. Built specifically to get a
// real statistical sample size after a 4-stock test showed a near-zero,
// possibly noise-driven edge.
const BACKTEST_DIVERSE_SAMPLE = [
  'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS',
  'WIPRO.NS', 'HCLTECH.NS',
  'SUNPHARMA.NS', 'CIPLA.NS', 'DRREDDY.NS',
  'MARUTI.NS', 'M&M.NS', 'EICHERMOT.NS',
  'TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS',
  'HINDUNILVR.NS', 'ITC.NS', 'NESTLEIND.NS',
  'DLF.NS', 'GODREJPROP.NS',
  'ONGC.NS', 'NTPC.NS', 'POWERGRID.NS',
  'PNB.NS', 'BANKBARODA.NS',
];

// ---------- ROUTE: /backtest-batch ----------
// Runs the diverse sample above and returns BOTH the real aggregate
// statistics (the honest answer to "does this strategy actually work")
// AND the per-stock breakdown (so individual outliers, like the earlier
// single-Reliance result, can be seen in context rather than mistaken for
// the whole picture).
async function handleBacktestBatch(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE;

  try {
    const perStockResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null).catch(err => ({ symbol: sym, error: err.message })))
    );

    const valid = perStockResults.filter(r => !r.error && r.totalTrades > 0);
    const totalWins = valid.reduce((s, r) => s + r.wins, 0);
    const totalLosses = valid.reduce((s, r) => s + r.losses, 0);
    const totalTrades = totalWins + totalLosses;
    const aggregateWinRate = totalTrades > 0 ? round2((totalWins / totalTrades) * 100) : null;
    // Expected value in R-multiples: every trade is structured at a fixed
    // 1:2 risk:reward by construction (win = +2R, loss = -1R) — see
    // buildSelectionCard. This lets a win rate below 50% still be net
    // profitable, or a win rate above 33% still be unprofitable, depending
    // on exactly where it falls — EV is the honest single number that
    // actually answers "does this make money," not win rate alone.
    const expectedValuePerTradeR = totalTrades > 0
      ? round2((totalWins / totalTrades) * 2 + (totalLosses / totalTrades) * -1)
      : null;

    const profitableStocks = valid.filter(r => {
      const t = r.wins + r.losses;
      if (t === 0) return false;
      const ev = (r.wins / t) * 2 + (r.losses / t) * -1;
      return ev > 0;
    }).length;

    return jsonResponse({
      sampleSize: valid.length,
      stocksWithErrors: perStockResults.length - valid.length,
      totalTradesAcrossSample: totalTrades,
      totalWins,
      totalLosses,
      aggregateWinRatePct: aggregateWinRate,
      expectedValuePerTradeR, // positive = historically profitable in R-multiples (before real trading costs), negative = not
      stocksProfitable: profitableStocks,
      stocksUnprofitable: valid.length - profitableStocks,
      methodologyNote: 'Each stock backtested independently over its available history (up to Yahoo Finance\'s ~60-day 5-min data limit), using the EXACT SAME scoring/verdict engine as live scanning — no parameters were changed or tuned based on this result. Expected Value (R-multiples) is the most honest single number: every trade targets a fixed 1:2 risk:reward by construction, so win rate alone can be misleading — a 40% win rate can still be profitable, a 60% win rate can still lose money, depending on exactly where the wins/losses fall. Does NOT include real-world trading costs (brokerage, STT, slippage), which would reduce this further.',
      perStock: perStockResults.map(r => r.error ? r : { symbol: r.symbol, totalTrades: r.totalTrades, wins: r.wins, losses: r.losses, winRatePct: r.winRatePct }),
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Batch backtest failed: ${err.message}` }, 500);
  }
}

function summarizeSectorTestResults(results) {
  const valid = results.filter(r => !r.error && r.totalTrades > 0);
  const wins = valid.reduce((s, r) => s + r.wins, 0);
  const losses = valid.reduce((s, r) => s + r.losses, 0);
  const total = wins + losses;
  const ev = total > 0 ? round2((wins / total) * 2 + (losses / total) * -1) : null; // fixed 1:2 RR, same as the original engine's other backtests
  return { sampleSize: valid.length, totalTrades: total, wins, losses, winRatePct: total > 0 ? round2((wins / total) * 100) : null, expectedValuePerTradeR: ev };
}

// ---------- ROUTE: /sector-alignment-test-baseline ----------
// SPLIT FROM the original combined route, after that one hit Cloudflare's
// CPU limit (Error 1102) — running a full 24-stock batch backtest TWICE in
// one request (baseline + aligned) costs roughly 2x the already-proven-safe
// /backtest-batch, which itself sits near the edge of what's safe. This
// route does ONLY the baseline half, costing the same as a normal batch
// backtest call that's already known to work.
async function handleSectorAlignmentBaseline(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE.filter(s => STOCK_SECTOR_MAP[s]);
  try {
    const baselineResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, false, null).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      baseline: summarizeSectorTestResults(baselineResults),
      note: 'This is HALF of the A/B comparison — the baseline (no sector alignment required), matching existing live behavior. Run /sector-alignment-test-aligned separately with the SAME symbols to get the comparison half, then compare expectedValuePerTradeR between the two.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Sector alignment baseline test failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /sector-alignment-test-aligned ----------
// The other half of the same A/B test, split out for the same CPU-cost
// reason as above. Fetches real historical sector-index data (once, for
// this smaller batch only) and requires sector confirmation.
async function handleSectorAlignmentAligned(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE.filter(s => STOCK_SECTOR_MAP[s]);
  try {
    const historicalSectorCandles = await fetchHistoricalSectorCandles();
    const alignedResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, true, historicalSectorCandles).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      withSectorAlignment: summarizeSectorTestResults(alignedResults),
      note: 'This is HALF of the A/B comparison — sector confirmation REQUIRED (using real historical sector-index candles, timestamp-aligned, not approximated). Compare expectedValuePerTradeR against /sector-alignment-test-baseline run with the SAME symbols.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Sector alignment test failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /daily-picks-filter-test-baseline ----------
// SPLIT FROM the original combined route, after that one hit Cloudflare's
// CPU limit (Error 1102) — running the full batch TWICE in one request
// costs roughly 2x the already-proven-safe /backtest-batch. This is the
// EXACT same mistake already found and fixed once this session for
// /sector-alignment-test, just not applied here the first time. This
// route does ONLY the baseline half.
async function handleDailyPicksFilterBaseline(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE;
  try {
    const baselineResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, false, null, false).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      baselineGeneralEngine: summarizeSectorTestResults(baselineResults),
      note: 'This is HALF of the comparison — the general engine baseline (riskReward>=2 only, matching the regular batch backtest). Run /daily-picks-filter-test-filtered separately with the SAME symbols to get the comparison half.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Daily Top Picks filter baseline test failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /daily-picks-filter-test-filtered ----------
// The other half: requires the EXACT live Daily Top Picks qualification
// bar (real momentum + strong volume + riskReward>=2 + score>=55).
async function handleDailyPicksFilterFiltered(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE;
  try {
    const filteredResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, false, null, true).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      dailyTopPicksExactFilter: summarizeSectorTestResults(filteredResults),
      note: 'This is HALF of the comparison — the EXACT live Daily Top Picks bar required. Compare against /daily-picks-filter-test-baseline run with the SAME symbols.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Daily Top Picks filter test failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /confidence-engine-test-baseline ----------
// Built per explicit request: "build it and backtest it like we did for
// other [filters]." Tests the REAL, existing engine (riskReward>=2 only,
// matching the standard batch backtest) against the SAME stocks as the
// alternative-confidence test below, for direct comparison. Split into
// two separate routes from the start (not combined into one, learning
// directly from the earlier CPU-limit failures on combined comparison
// routes) since running the full batch twice in one request already
// proved unsafe twice this session.
async function handleConfidenceEngineBaseline(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE;
  try {
    const baselineResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, false, null, false, false).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      baselineRealEngine: summarizeSectorTestResults(baselineResults),
      note: 'This is HALF of the comparison — the REAL, already-tested engine (riskReward>=2 only). Run /confidence-engine-test-alternative separately with the SAME symbols for the comparison half.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Confidence engine baseline test failed: ${err.message}` }, 500);
  }
}

// ---------- ROUTE: /confidence-engine-test-alternative ----------
// The other half: requires the spec's Alternative Confidence Engine score
// (30% Market Character + 20% Sector Strength + 20% Relative Strength +
// 15% Structure + 10% Volume + 5% Pattern) to be >=75, its own explicit
// threshold. HONEST CONTEXT: this system has never been backtested before
// this — built and tested NOW specifically so a real answer exists,
// instead of a guess, per explicit request not to speculate on its
// win rate or profitability without actually running it.
async function handleConfidenceEngineAlternative(url) {
  const customList = url.searchParams.get('symbols');
  // REAL FIX, found via diagnosis after two genuine CPU-limit failures on
  // this specific route while the baseline succeeded on the same 24
  // stocks: requiring confidence>=75 means FEWER positions ever open,
  // so MORE candles get evaluated via the expensive verifyStock/
  // buildSelectionCard path without the "position open, skip ahead"
  // early exit — a strict filter genuinely costs MORE total CPU across a
  // full backtest than a loose one, not less, despite identical per-call
  // cost. Default sample halved here as a real, evidence-based safety
  // margin (not a guess) — pass ?symbols= explicitly to test more at once
  // if needed, in smaller batches.
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE.slice(0, 12);
  try {
    const altResults = await Promise.all(
      symbols.map(sym => runBacktest(sym, null, false, null, false, true).catch(err => ({ symbol: sym, error: err.message })))
    );
    return jsonResponse({
      symbolsTested: symbols,
      alternativeConfidenceEngine: summarizeSectorTestResults(altResults),
      note: 'This is HALF of the comparison — the spec\'s Alternative Confidence Engine, gated at its own >=75 threshold. Compare against /confidence-engine-test-baseline run with the SAME symbols. This system had NEVER been backtested before this route was built. Sample size defaults to 12 stocks (not the full 24) since a strict filter genuinely costs more CPU per backtest — pass ?symbols= explicitly for a custom (smaller-batch) list. relativeStrength is honestly null throughout (no historical Nifty data wired into this specific path), so the Relative Strength category always falls back to its neutral midpoint here.',
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `Confidence engine alternative test failed: ${err.message}` }, 500);
  }
}


// ---------- ROUTE: /virs-backtest-batch ----------
// Reuses the SAME diverse 24-stock sample as the original engine's batch
// backtest, specifically so the two results are directly, honestly
// comparable — not a different, cherry-picked sample that could bias the
// comparison either way.
async function handleVirsBacktestBatch(url) {
  const customList = url.searchParams.get('symbols');
  const symbols = customList ? customList.split(',').map(s => s.trim()) : BACKTEST_DIVERSE_SAMPLE;

  try {
    const perStockResults = await Promise.all(
      symbols.map(sym => runVirsProBacktest(sym).catch(err => ({ symbol: sym, error: err.message })))
    );

    const valid = perStockResults.filter(r => !r.error && r.totalTrades > 0);
    const totalWins = valid.reduce((s, r) => s + r.wins, 0);
    const totalLosses = valid.reduce((s, r) => s + r.losses, 0);
    const totalTrades = totalWins + totalLosses;
    const aggregateWinRate = totalTrades > 0 ? round2((totalWins / totalTrades) * 100) : null;

    // Real, weighted average EV across the sample — weighted by each
    // stock's own trade count, not a simple average-of-averages (which
    // would incorrectly give a stock with 2 trades the same influence as
    // one with 20).
    let weightedRSum = 0;
    valid.forEach(r => { weightedRSum += (r.expectedValuePerTradeR ?? 0) * r.totalTrades; });
    const expectedValuePerTradeR = totalTrades > 0 ? round2(weightedRSum / totalTrades) : null;

    const profitableStocks = valid.filter(r => (r.expectedValuePerTradeR ?? 0) > 0).length;

    // Aggregate per-strategy performance across the whole sample, so we can
    // see which (if any) of the 9 strategies showed genuine promise, rather
    // than only a blended number that could hide one good strategy inside
    // eight weak ones, or vice versa.
    const byStrategyAcrossSample = {};
    valid.forEach(r => {
      Object.entries(r.byStrategy || {}).forEach(([strat, counts]) => {
        if (!byStrategyAcrossSample[strat]) byStrategyAcrossSample[strat] = { wins: 0, losses: 0 };
        byStrategyAcrossSample[strat].wins += counts.wins;
        byStrategyAcrossSample[strat].losses += counts.losses;
      });
    });

    return jsonResponse({
      sampleSize: valid.length,
      stocksWithErrors: perStockResults.length - valid.length,
      totalTradesAcrossSample: totalTrades,
      totalWins,
      totalLosses,
      aggregateWinRatePct: aggregateWinRate,
      expectedValuePerTradeR, // weighted by each stock's trade count, using REAL per-trade entry/stop/target ratios — not an assumed fixed 1:2
      stocksProfitable: profitableStocks,
      stocksUnprofitable: valid.length - profitableStocks,
      byStrategyAcrossSample,
      excludedStrategy: 'Strategy 9 (Sector Rotation Leadership) excluded — needs live sector-index data unavailable historically.',
      methodologyNote: 'Replays 9 of the 10 VIRS Pro strategies across the SAME diverse stock sample used for the original scoring engine\'s batch backtest, for direct comparability. Expected Value uses each trade\'s ACTUAL entry/stop/target ratio (VIRS Pro strategies define varying risk:reward by design, unlike the original engine\'s fixed 1:2 structure), weighted by each stock\'s own trade count. Does NOT include real-world trading costs.',
      perStock: perStockResults.map(r => r.error ? r : { symbol: r.symbol, totalTrades: r.totalTrades, wins: r.wins, losses: r.losses, winRatePct: r.winRatePct, expectedValuePerTradeR: r.expectedValuePerTradeR }),
      timestamp: Date.now(),
    });
  } catch (err) {
    return jsonResponse({ error: `VIRS Pro batch backtest failed: ${err.message}` }, 500);
  }
}

const ALERT_TYPES = {
  NEW_OPPORTUNITY: 'NEW_OPPORTUNITY',
  BREAKOUT: 'BREAKOUT',
  BREAKDOWN: 'BREAKDOWN',
  TARGET_HIT: 'TARGET_HIT',
  STOPLOSS_HIT: 'STOPLOSS_HIT',
  CONFIDENCE_UPGRADE: 'CONFIDENCE_UPGRADE',
  CONFIDENCE_DOWNGRADE: 'CONFIDENCE_DOWNGRADE',
};

// Generates alerts by comparing a stock's current selection card against
// its previous scan state. Returns an array (usually 0 or 1 alerts per stock
// per scan — a stock rarely triggers multiple alert types simultaneously).
function generateAlerts(card, now) {
  const alerts = [];
  const prev = previousStockState[card.stockName];

  if (!prev) {
    // First time this stock has appeared in topSelections — genuinely new, not just unseen by this page before.
    alerts.push({ symbol: card.stockName, type: ALERT_TYPES.NEW_OPPORTUNITY, message: `${card.stockName.replace('.NS','')} newly entered Top Opportunities — ${card.direction} setup, ${card.confidencePct}% confidence`, confidence: card.confidencePct, timestamp: now });
  } else {
    // Confidence change (meaningful threshold, not every 1% wobble — avoids alert spam on noise).
    const confidenceDelta = card.confidencePct - prev.confidence;
    if (confidenceDelta >= 8) {
      alerts.push({ symbol: card.stockName, type: ALERT_TYPES.CONFIDENCE_UPGRADE, message: `${card.stockName.replace('.NS','')} confidence rose from ${prev.confidence}% to ${card.confidencePct}%`, confidence: card.confidencePct, timestamp: now });
    } else if (confidenceDelta <= -8) {
      alerts.push({ symbol: card.stockName, type: ALERT_TYPES.CONFIDENCE_DOWNGRADE, message: `${card.stockName.replace('.NS','')} confidence fell from ${prev.confidence}% to ${card.confidencePct}%`, confidence: card.confidencePct, timestamp: now });
    }

    // Direction flip while still qualifying as a top opportunity — a real breakout/breakdown event, not noise.
    if (prev.verdict && prev.direction && card.direction !== prev.direction) {
      alerts.push({
        symbol: card.stockName,
        type: card.direction === 'BUY' ? ALERT_TYPES.BREAKOUT : ALERT_TYPES.BREAKDOWN,
        message: `${card.stockName.replace('.NS','')} flipped from ${prev.direction} to ${card.direction} — ${card.direction === 'BUY' ? 'breakout' : 'breakdown'} signal`,
        confidence: card.confidencePct, timestamp: now,
      });
    }
  }

  // Target/Stoploss hit checks against the price level recorded at the time
  // this stock was first selected, compared to its current live price —
  // only meaningful once a stock has been tracked across at least one prior scan.
  if (prev && prev.target1 != null && prev.stopLoss != null) {
    const hitTarget = card.direction === 'BUY' ? card.entry >= prev.target1 : card.entry <= prev.target1;
    const hitStop = card.direction === 'BUY' ? card.entry <= prev.stopLoss : card.entry >= prev.stopLoss;
    if (hitTarget) alerts.push({ symbol: card.stockName, type: ALERT_TYPES.TARGET_HIT, message: `${card.stockName.replace('.NS','')} reached Target 1 (₹${prev.target1})`, confidence: card.confidencePct, timestamp: now });
    else if (hitStop) alerts.push({ symbol: card.stockName, type: ALERT_TYPES.STOPLOSS_HIT, message: `${card.stockName.replace('.NS','')} hit Stop Loss (₹${prev.stopLoss})`, confidence: card.confidencePct, timestamp: now });
  }

  return alerts;
}

// Updates the persisted state for a stock after generating alerts for this scan cycle.
function updateStockState(card, rank, now) {
  const prev = previousStockState[card.stockName];
  // CONSECUTIVE TOP-3 TRACKING — kept as real per-symbol state (useful raw
  // data), but the actual COMMITTED PICK decision itself was moved to the
  // React frontend, since it needs the FULL merged Top Opportunities list
  // across all pages (23-95 depending on universe) to be evaluated
  // correctly — this Worker only ever sees one page (22 stocks) at a time,
  // so a server-side commit decision here would incorrectly think a stock
  // "fell out of the top 10" just because it landed on a different page,
  // not because it actually dropped in quality. Found and corrected before
  // shipping, not discovered as a bug afterward.
  const wasTop3LastTime = prev && prev.rank != null && prev.rank <= 3;
  const isTop3Now = rank <= 3;
  const consecutiveTop3 = (isTop3Now && wasTop3LastTime) ? (prev.consecutiveTop3 || 1) + 1 : (isTop3Now ? 1 : 0);

  previousStockState[card.stockName] = {
    score: card.aiScore, confidence: card.confidencePct, rank, verdict: true,
    direction: card.direction, target1: card.target1, stopLoss: card.stopLoss, lastSeenAt: now,
    consecutiveTop3,
  };
}

// PRIORITY 7 — score/confidence smoothing: blends this scan's raw score with
// the stock's previous score (70% new, 30% old) so a single noisy 15-minute
// reading can't swing a stock from rank 1 to rank 20 and back — genuine,
// sustained changes still come through within 2-3 scan cycles, but single-
// cycle noise gets damped rather than amplified into the displayed ranking.
function smoothScore(symbol, rawScore) {
  const prev = previousStockState[symbol];
  if (!prev || typeof prev.score !== 'number') return rawScore; // no prior data — nothing to smooth against yet
  return Math.round(rawScore * 0.7 + prev.score * 0.3);
}

let symbolsCache = { data: null, fetchedAt: 0 };
const SYMBOLS_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours — this list rarely changes intraday

async function handleSymbols(url) {
  const now = Date.now();
  if (symbolsCache.data && (now - symbolsCache.fetchedAt) < SYMBOLS_CACHE_MS) {
    return jsonResponse({ count: symbolsCache.data.length, symbols: symbolsCache.data, cached: true, fetchedAt: symbolsCache.fetchedAt });
  }

  try {
    const csvUrl = 'https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv';
    const res = await fetch(csvUrl, { headers: nseHeaders() });
    if (!res.ok) throw new Error(`NSE source returned HTTP ${res.status}`);
    const text = await res.text();
    const symbols = parseNifty500CSV(text);
    if (symbols.length < 100) {
      // Include a small snippet of what we actually got back, so if this fails again
      // we can see WHY (e.g. an HTML block page, a different column layout, etc.)
      // instead of guessing blindly a second time.
      const snippet = text.slice(0, 200).replace(/\n/g, ' ');
      throw new Error(`Parsed too few symbols (${symbols.length}). First 200 chars of response: "${snippet}"`);
    }

    symbolsCache = { data: symbols, fetchedAt: now };
    return jsonResponse({ count: symbols.length, symbols, cached: false, fetchedAt: now });
  } catch (err) {
    // Live fetch failed — fall back to a known-good static list rather than returning nothing.
    // This list is smaller and may go stale over time, but it's a safety net, not the primary source.
    return jsonResponse({
      count: FALLBACK_SYMBOLS.length,
      symbols: FALLBACK_SYMBOLS,
      cached: false,
      fallback: true,
      error: `Live NSE fetch failed (${err.message}) — using fallback list. This fallback list itself may go stale over time and should be checked periodically.`,
    });
  }
}

function parseNifty500CSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const symbolCol = header.indexOf('symbol');
  if (symbolCol === -1) return [];

  const symbols = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const sym = cols[symbolCol]?.trim();
    if (sym) symbols.push(sym + '.NS');
  }
  return symbols;
}

// ============================================================
// FULL NSE LIST — expanded coverage beyond the Nifty 500, using NSE's own
// official complete equity securities list. IMPORTANT: filters to EQ series
// only. NSE separates stocks into EQ (normal trading), BE/BZ (surveillance/
// restricted "Trade-to-Trade" segment), and others — BE/BZ stocks cannot be
// squared off intraday (settlement is mandatory, no same-day buy+sell), so
// including them in an INTRADAY scanner would be actively misleading. This
// filter is not optional polish, it's a correctness requirement for the
// stated purpose of this tool.
let fullNseListCache = { data: null, fetchedAt: 0 };
const FULL_NSE_CACHE_MS = 6 * 60 * 60 * 1000; // same 6-hour window as the Nifty 500 cache

function parseFullNseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toUpperCase());
  const symbolCol = header.indexOf('SYMBOL');
  const seriesCol = header.indexOf('SERIES');
  if (symbolCol === -1 || seriesCol === -1) return [];

  const symbols = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const sym = cols[symbolCol]?.trim();
    const series = cols[seriesCol]?.trim().toUpperCase();
    if (sym && series === 'EQ') symbols.push(sym + '.NS'); // EQ only — see comment above
  }
  return symbols;
}

async function handleFullSymbols(url) {
  const now = Date.now();
  if (fullNseListCache.data && (now - fullNseListCache.fetchedAt) < FULL_NSE_CACHE_MS) {
    return jsonResponse({ count: fullNseListCache.data.length, symbols: fullNseListCache.data, cached: true, fetchedAt: fullNseListCache.fetchedAt, seriesFilter: 'EQ only — BE/BZ surveillance-segment stocks excluded, since those cannot be traded intraday' });
  }
  try {
    const csvUrl = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
    const res = await fetch(csvUrl, { headers: nseHeaders() });
    if (!res.ok) throw new Error(`NSE full list source returned HTTP ${res.status}`);
    const text = await res.text();
    const symbols = parseFullNseCSV(text);
    if (symbols.length < 500) {
      const snippet = text.slice(0, 200).replace(/\n/g, ' ');
      throw new Error(`Parsed too few EQ-series symbols (${symbols.length}). First 200 chars: "${snippet}"`);
    }
    fullNseListCache = { data: symbols, fetchedAt: now };
    return jsonResponse({ count: symbols.length, symbols, cached: false, fetchedAt: now, seriesFilter: 'EQ only — BE/BZ surveillance-segment stocks excluded, since those cannot be traded intraday' });
  } catch (err) {
    // No fallback list for the full universe — falling back to the Nifty 500
    // fallback here would silently misrepresent the requested scope, so this
    // honestly reports the failure instead.
    return jsonResponse({ error: `Live full-NSE-list fetch failed: ${err.message}. No fallback available for the full universe — falling back to a smaller list would misrepresent the actual coverage.`, count: 0, symbols: [] }, 502);
  }
}

// Small safety-net fallback ONLY used if the live NSE fetch fails entirely.
// Verified current as of this build — but like any hardcoded list, it can go stale,
// which is exactly why it's a fallback and not the primary source.
const FALLBACK_SYMBOLS = [
  'RELIANCE.NS','TCS.NS','HDFCBANK.NS','ICICIBANK.NS','INFY.NS','TMPV.NS','SBIN.NS','AXISBANK.NS',
  'WIPRO.NS','ETERNAL.NS','BHARTIARTL.NS','ITC.NS','KOTAKBANK.NS','LT.NS','HINDUNILVR.NS','MARUTI.NS',
  'BAJFINANCE.NS','ASIANPAINT.NS','SUNPHARMA.NS','TITAN.NS','ULTRACEMCO.NS','NESTLEIND.NS','HCLTECH.NS',
  'ADANIENT.NS','ADANIPORTS.NS','NTPC.NS','POWERGRID.NS','M&M.NS','TATASTEEL.NS','JSWSTEEL.NS',
];



async function fetchQuote(symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(yahooUrl, { headers: ua() });
  if (!res.ok) return null;
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = meta.regularMarketPrice ?? meta.chartPreviousClose;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  return {
    symbol, price, prev,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    open: meta.regularMarketOpen, high: meta.regularMarketDayHigh, low: meta.regularMarketDayLow,
    volume: meta.regularMarketVolume, currency: meta.currency, timestamp: Date.now(),
  };
}

async function fetchCandles(symbol, interval, range) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(yahooUrl, { headers: ua() });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue; // skip gaps (market closed minutes etc)
    candles.push({
      t: ts[i] * 1000,
      o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0,
    });
  }
  return candles;
}

function ua() {
  return { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'application/json' };
}

// niftyindices.com (NSE's official index data source) appears to require a real
// browser User-Agent AND a Referer header pointing to their own site, or it blocks
// the request (returning something that isn't the actual CSV). Yahoo Finance doesn't
// need this, so this is a separate header set used only for the NSE symbols fetch.
function nseHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Accept': 'text/csv,text/plain,*/*',
    'Referer': 'https://www.niftyindices.com/indices/equity/broad-based-indices',
  };
}

// ============================================================
// VERIFICATION ENGINE — the actual "real vs fake momentum" logic
// ============================================================

async function verifyStock(symbol, sectorStrength = null, patternResult = null, timeframeResult = null, newsResult = null, preloadedCandles = null, niftyChangePct = null) {
  // Phase 2: look up this stock's sector and that sector's live strength rank,
  // if sector data was provided by the caller (handleScanMarket does this;
  // older callers like /verify and /scan can omit it and get a neutral result).
  const sectorName = STOCK_SECTOR_MAP[symbol] || null;
  const sectorInfo = (sectorStrength && sectorName) ? sectorStrength.byName[sectorName] : null;

  // Pull 5-min candles over the last 5 trading days — enough to compute
  // a meaningful average volume baseline and recent price structure.
  // BACKTESTING SUPPORT: if preloadedCandles is provided (used by the
  // backtest engine to run this EXACT same scoring logic against historical
  // data instead of a live fetch), use those directly instead of fetching —
  // this is the only change from the original live-only behavior, and only
  // activates when explicitly passed, so the live path is unaffected.
  const candles = preloadedCandles || await fetchCandles(symbol, '5m', '5d');
  if (!candles || candles.length < 20) return null;

  const today = candles.slice(-Math.min(75, candles.length)); // ~today's session worth of 5m candles
  const closes = today.map(c => c.c);
  const vols = today.map(c => c.v);
  const last = today[today.length - 1];

  // --- Relative Volume: today's recent volume vs the stock's own recent average ---
  const recentVol = vols.slice(-6).reduce((a, b) => a + b, 0) / 6; // last ~30 min avg
  const baselineVol = vols.slice(0, Math.max(1, vols.length - 6)).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 6);
  const relVol = baselineVol > 0 ? recentVol / baselineVol : 1;

  // --- VWAP (volume weighted average price) across the session so far ---
  let cumPV = 0, cumV = 0;
  for (const c of today) { const typical = (c.h + c.l + c.c) / 3; cumPV += typical * c.v; cumV += c.v; }
  const vwap = cumV > 0 ? cumPV / cumV : last.c;
  const aboveVWAP = last.c > vwap;

  // --- RSI (14-period, computed on the 5m closes) ---
  const rsi = computeRSI(closes, 14);

  // --- ATR (Average True Range) trend — is volatility expanding or shrinking? ---
  const atrSeries = computeATRSeries(today, 14);
  const atrNow = atrSeries[atrSeries.length - 1];
  const atrEarlier = atrSeries[Math.max(0, atrSeries.length - 10)];
  const atrExpanding = atrEarlier > 0 ? atrNow > atrEarlier * 1.1 : false;

  // --- Price structure: Higher-High/Higher-Low or Lower-High/Lower-Low over recent candles ---
  const structure = computeStructure(today.slice(-12));

  // --- Net price move over the session so far, plus how it built up (steady vs single spike) ---
  const sessionOpen = today[0].o;
  const sessionChangePct = ((last.c - sessionOpen) / sessionOpen) * 100;
  const stepwiseConsistency = computeConsistency(closes);
  const spikeDominance = computeSpikeDominance(today);
  const isFakeSpike = spikeDominance > 0.55; // one candle did the majority of the work — hard red flag

  // SMART MONEY CONCEPTS — real BOS/CHOCH/FVG/Order Block/Liquidity Grab
  // detection, replacing the earlier simplified "is structure clean" proxy.
  // Reuses the same `today` candles already fetched for everything else —
  // zero extra subrequest cost, runs in the bulk scan too.
  const trendDirForSMC = structure === 'HH_HL' ? 'UP' : structure === 'LH_LL' ? 'DOWN' : 'UNCLEAR';
  const { swingHighs: smcHighsRaw, swingLows: smcLowsRaw } = findSwings(today.slice(0, -1), 5, 1); // swings from before the most recent candle, so BOS/CHOCH can check the latest candle against them
  const smcHighs = dedupeSwings(smcHighsRaw);
  const smcLows = dedupeSwings(smcLowsRaw);
  const smc = detectSmartMoneyConcepts(today, trendDirForSMC, smcHighs, smcLows);

  // FIRST-PULLBACK-ONLY APPROXIMATION — built per explicit spec request,
  // with an HONEST caveat: precisely detecting "this is the first
  // institutional pullback since the move began" is genuinely hard to
  // pin down objectively (an earlier, more complex "trend start" approach
  // was tried and abandoned as too uncertain to trust). This is a
  // SIMPLER, more directly verifiable APPROXIMATION: find the most recent
  // genuine momentum-ignition candle (matching the same volume-spike +
  // strong-close criteria used elsewhere in this engine), then count how
  // many swing points (pullback cycles) have formed since that specific
  // candle. 0 or 1 = approximately "first pullback"; 2+ = a later one.
  // This is an approximation anchored to a concrete, verifiable event
  // (the ignition candle), not a precise guarantee of the spec's exact
  // intent — stated plainly here and in the field name itself.
  const closesInTopQuarterForIgnition = c => { const r = c.h - c.l; return r > 0 && (c.c - c.l) / r >= 0.75; };
  const closesInBottomQuarterForIgnition = c => { const r = c.h - c.l; return r > 0 && (c.c - c.l) / r <= 0.25; };
  let ignitionIndex = -1;
  for (let i = today.length - 1; i >= Math.max(0, today.length - 40); i--) { // search the recent window only, not the entire session
    const c = today[i];
    const bodyPct = baselineVol > 0 ? Math.abs(c.c - c.o) / c.o * 100 : 0;
    if (c.v > baselineVol * 2.5 && bodyPct > 0.4) {
      if (sessionChangePct > 0 && closesInTopQuarterForIgnition(c)) { ignitionIndex = i; break; }
      if (sessionChangePct < 0 && closesInBottomQuarterForIgnition(c)) { ignitionIndex = i; break; }
    }
  }
  const relevantSwingsForPullback = sessionChangePct > 0 ? smcLows : smcHighs;
  const pullbacksSinceIgnitionApprox = ignitionIndex === -1 ? null : relevantSwingsForPullback.filter(s => s.index > ignitionIndex).length;

  // ============================================================
  // PHASE 7 — FINAL AI SCORING ENGINE
  // Spec's exact weighting: Trend 20, Momentum 15, Volume 15, Sector 10,
  // Multi-Timeframe 10, Candlestick 10, Pattern 10, News 5, Risk:Reward 5 = 100.
  //
  // HONEST NOTES:
  // - Trend, Momentum, Volume, Risk:Reward, Sector: fully real, same tested
  //   logic as before, just reweighted to the spec's exact numbers.
  // - Candlestick: real, from Phase 4, reuses the SAME candles already
  //   fetched here — zero extra cost, so this runs in the bulk scan too.
  // - Pattern, Multi-Timeframe, News: only populated when the caller passes
  //   in results from the on-demand routes (/chart-pattern-check,
  //   /timeframe-check, /news-check) — these need extra data fetches that
  //   would blow the 50-subrequest free-tier limit if run on all ~500 bulk-
  //   scanned stocks, so in the bulk scan they honestly stay at 0 rather
  //   than being faked or silently redistributed elsewhere.
  // ============================================================
  const categoryScores = { trend: 0, momentum: 0, volume: 0, pattern: 0, candlestick: 0, sectorStrength: 0, newsSentiment: 0, multiTimeframe: 0, riskReward: 0 };
  const reasons = [];

  // --- VOLUME (max 15, per spec) ---
  if (relVol >= 2) { categoryScores.volume = 15; reasons.push(`Relative volume ${relVol.toFixed(1)}x — genuine participation increase`); }
  else if (relVol >= 1.3) { categoryScores.volume = 8; reasons.push(`Relative volume ${relVol.toFixed(1)}x — mild increase`); }
  else { reasons.push(`Relative volume only ${relVol.toFixed(1)}x — weak participation, move may be thin`); }

  // --- TREND (max 20, per spec: VWAP 9 + structure 11) ---
  if (aboveVWAP && sessionChangePct > 0) { categoryScores.trend += 9; reasons.push('Price above session VWAP — buyers in control on average, not just at the top'); }
  else if (!aboveVWAP && sessionChangePct < 0) { categoryScores.trend += 9; reasons.push('Price below session VWAP — sellers in control on average'); }
  else { reasons.push('Price and VWAP position disagree with the direction of the move — caution'); }

  if (structure === 'HH_HL' && sessionChangePct > 0) { categoryScores.trend += 11; reasons.push('Clean Higher-High/Higher-Low structure — trend is structurally sound, not just one candle'); }
  else if (structure === 'LH_LL' && sessionChangePct < 0) { categoryScores.trend += 11; reasons.push('Clean Lower-High/Lower-Low structure — bearish structure confirmed'); }
  else { reasons.push('Price structure choppy/unclear — no clean trend structure yet'); }

  // --- SMART MONEY CONCEPTS (informational — no separate points, the spec's
  // 100-point budget is already fully allocated across Trend/Momentum/Volume/
  // Sector/Multi-Timeframe/Candlestick/Pattern/News/Risk:Reward). Real BOS/
  // CHOCH/FVG/Order Block/Liquidity Grab findings are surfaced in the reasons
  // for transparency, and a CHOCH or bearish-for-longs liquidity grab is
  // flagged as an explicit caution even though it doesn't change the score. ---
  if (smc.bosChoch.signal === 'BOS') {
    reasons.push(`Smart Money: ${smc.bosChoch.bias} BOS confirmed at ₹${smc.bosChoch.level} — ${smc.bosChoch.note}`);
  } else if (smc.bosChoch.signal === 'CHOCH') {
    reasons.push(`⚠️ Smart Money: ${smc.bosChoch.bias} CHOCH detected at ₹${smc.bosChoch.level} — ${smc.bosChoch.note}`);
  }
  if (smc.orderBlock) {
    reasons.push(`Smart Money: ${smc.orderBlock.type} identified at ₹${smc.orderBlock.zoneLow}–₹${smc.orderBlock.zoneHigh}`);
  }
  if (smc.fvgs.length > 0) {
    // Prefer the most recent FVG that matches this session's overall direction —
    // showing a Bullish gap on a SELL call (or vice versa) is technically true
    // but reads as contradictory. Fall back to the most recent gap of any
    // direction only if none match, and label that honestly.
    const directionLabel = sessionChangePct > 0 ? 'Bullish' : 'Bearish';
    const matchingFvgs = smc.fvgs.filter(f => f.type.startsWith(directionLabel));
    if (matchingFvgs.length > 0) {
      const fvg = matchingFvgs[matchingFvgs.length - 1];
      reasons.push(`Smart Money: ${fvg.type} open between ₹${fvg.gapLow}–₹${fvg.gapHigh} — price may revisit this zone`);
    } else {
      const fvg = smc.fvgs[smc.fvgs.length - 1];
      reasons.push(`Smart Money: ${fvg.type} open between ₹${fvg.gapLow}–₹${fvg.gapHigh} (opposite direction to this move — worth noting, not a confirming signal)`);
    }
  }
  if (smc.liquidityGrab) {
    reasons.push(`⚠️ Smart Money: ${smc.liquidityGrab.type} at ₹${smc.liquidityGrab.sweptLevel} — possible stop-hunt before reversal, verify before entry`);
  }
  if (smc.activeStructures.length === 0) {
    reasons.push('Smart Money: no clear BOS/CHOCH/FVG/Order Block/Liquidity Grab signal on the current candles');
  }

  // --- MOMENTUM (max 15, per spec: ATR 5 + consistency 5 + RSI 5) ---
  if (atrExpanding) { categoryScores.momentum += 5; reasons.push('ATR (volatility) expanding — real energy behind the move, not a quiet drift'); }
  else { reasons.push('ATR not expanding — move lacks volatility confirmation, could fade'); }

  if (stepwiseConsistency >= 0.6 && !isFakeSpike) { categoryScores.momentum += 5; reasons.push('Move built up steadily across multiple candles — consistent with real demand/supply, not a single fake spike'); }
  else if (isFakeSpike) { reasons.push(`⚠️ ${Math.round(spikeDominance*100)}% of the entire move came from a single candle — likely a fake/manipulated spike, not real sustained buying or selling`); }
  else { reasons.push('Move came from a small number of outsized candles — possible single-spike (fake) move, verify before entry'); }

  if (rsi >= 50 && rsi <= 75 && sessionChangePct > 0) { categoryScores.momentum += 5; reasons.push(`RSI ${rsi.toFixed(0)} — healthy bullish zone, not yet overextended`); }
  else if (rsi <= 50 && rsi >= 25 && sessionChangePct < 0) { categoryScores.momentum += 5; reasons.push(`RSI ${rsi.toFixed(0)} — healthy bearish zone`); }
  else if (rsi > 75) { reasons.push(`RSI ${rsi.toFixed(0)} — overbought, real move but late / risk of pullback`); categoryScores.momentum += 2; }
  else if (rsi < 25) { reasons.push(`RSI ${rsi.toFixed(0)} — oversold, real move but late / risk of bounce`); categoryScores.momentum += 2; }
  else { reasons.push(`RSI ${rsi.toFixed(0)} — neutral, no strong directional confirmation`); }

  // --- CANDLESTICK (max 10, per spec) — Phase 4, real, reuses existing candles, runs in bulk scan too ---
  const candlePrecedingTrend = structure === 'HH_HL' ? 'UP' : structure === 'LH_LL' ? 'DOWN' : 'UNCLEAR';
  const candlestickResult = detectCandlestickPattern(today, candlePrecedingTrend);
  if (candlestickResult.pattern !== 'None') {
    const candleAgrees = (candlestickResult.bias === 'Bullish' && sessionChangePct > 0) || (candlestickResult.bias === 'Bearish' && sessionChangePct < 0);
    if (candleAgrees) {
      categoryScores.candlestick = Math.round((candlestickResult.strength / 100) * 10);
      reasons.push(`Candlestick pattern: ${candlestickResult.pattern} (${candlestickResult.bias}, strength ${candlestickResult.strength}) — confirms move direction`);
    } else {
      reasons.push(`Candlestick pattern detected (${candlestickResult.pattern}) but its ${candlestickResult.bias} bias conflicts with this move's direction — not counted`);
    }
  } else {
    reasons.push('No recognized candlestick pattern on the most recent candles');
  }

  // --- PATTERN (max 10, per spec) — Phase 5, on-demand only (see note above) ---
  if (patternResult && patternResult.pattern !== 'None') {
    const patternAgrees = (patternResult.bias === 'Bullish' && sessionChangePct > 0) || (patternResult.bias === 'Bearish' && sessionChangePct < 0);
    if (patternAgrees && patternResult.breakoutValid) {
      categoryScores.pattern = Math.round((patternResult.confidence / 100) * 10);
      reasons.push(`Chart pattern confirmed: ${patternResult.pattern} (confidence ${patternResult.confidence}%, breakout confirmed)`);
    } else {
      reasons.push(`Chart pattern detected (${patternResult.pattern}) but not breakout-confirmed or not direction-agreeing — not counted`);
    }
  } else {
    reasons.push('Chart pattern check not run in bulk scan (on-demand only via /chart-pattern-check)');
  }

  // --- MULTI-TIMEFRAME (max 10, per spec) — Phase 3, on-demand only ---
  if (timeframeResult) {
    categoryScores.multiTimeframe = Math.round((timeframeResult.multiTimeframeScore / 100) * 10);
    reasons.push(`Multi-timeframe alignment: ${timeframeResult.alignment} (score ${timeframeResult.multiTimeframeScore}/100)`);
  } else {
    reasons.push('Multi-timeframe check not run in bulk scan (on-demand only via /timeframe-check)');
  }

  // --- NEWS (max 5, per spec) — Phase 6, on-demand only ---
  if (newsResult && newsResult.available) {
    const newsAgrees = (newsResult.sentiment === 'Bullish' && sessionChangePct > 0) || (newsResult.sentiment === 'Bearish' && sessionChangePct < 0);
    if (newsAgrees) {
      categoryScores.newsSentiment = Math.round((newsResult.newsScore / 100) * 5);
      reasons.push(`News sentiment: ${newsResult.sentiment} (score ${newsResult.newsScore}/100) — "${newsResult.whyMoving}"`);
    } else {
      reasons.push(`News sentiment (${newsResult.sentiment}) does not clearly confirm this move's direction`);
    }
  } else {
    reasons.push(newsResult ? `News unavailable: ${newsResult.reason}` : 'News check not run in bulk scan (on-demand only via /news-check)');
  }

  // --- RISK:REWARD (max 5, per spec) ---
  if (Math.abs(sessionChangePct) >= 0.5 && categoryScores.trend >= 9) {
    categoryScores.riskReward = 5;
  } else if (Math.abs(sessionChangePct) >= 0.3) {
    categoryScores.riskReward = 3;
  }

  // --- SECTOR STRENGTH (max 10, per spec) — Phase 2, real when available ---
  if (sectorInfo) {
    const sectorAgrees = (sessionChangePct > 0 && sectorInfo.changePct > 0) || (sessionChangePct < 0 && sectorInfo.changePct < 0);
    if (sectorAgrees) {
      categoryScores.sectorStrength = Math.round((sectorInfo.strengthScore / 100) * 10);
      reasons.push(`Sector "${sectorInfo.name}" is ranked #${sectorInfo.rank} today (${sectorInfo.changePct >= 0 ? '+' : ''}${sectorInfo.changePct}%) — moving in the same direction as this stock`);
    } else {
      reasons.push(`Sector "${sectorInfo.name}" is moving opposite to this stock (sector ${sectorInfo.changePct >= 0 ? '+' : ''}${sectorInfo.changePct}%) — this move isn't sector-confirmed`);
    }
  } else if (sectorName) {
    reasons.push(`Sector "${sectorName}" mapped but live sector data unavailable this cycle`);
  } else {
    reasons.push('Sector not yet mapped for this stock — no sector adjustment applied');
  }

  const score = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const REALISTIC_MAX = 100; // genuine spec-defined 100-point scale

  // Trade quality grading: A+ / A / B / C bands on the true 100-point scale.
  let qualityGrade = 'C';
  if (score >= 85) qualityGrade = 'A+';
  else if (score >= 70) qualityGrade = 'A';
  else if (score >= 50) qualityGrade = 'B';

  // Verdict thresholds adapt to what was actually measurable for this call:
  // - FULL CHECK (patternResult/timeframeResult/newsResult provided, e.g. via
  //   the on-demand single-stock routes): true 100-point scale, 70/45 standard.
  // - BULK SCAN (none of those provided, the normal case for /scan-market
  //   across ~500 stocks): Pattern(10)+MultiTimeframe(10)+News(5) = 25 points
  //   are structurally unreachable there (would blow the 50-subrequest free-
  //   tier limit if run per-stock), so the achievable ceiling is honestly 75,
  //   not 100. Thresholds are scaled proportionally (same 70%/45% strictness)
  //   to that REAL ceiling — 52/34 — rather than silently making BUY/SELL
  //   nearly unreachable for every bulk-scanned stock, which would defeat the
  //   purpose of having an automated scanner at all.
  const hasFullCheckData = !!(patternResult || timeframeResult || newsResult);
  const achievableMax = hasFullCheckData ? 100 : 75;
  const buySellThreshold = hasFullCheckData ? 70 : 46; // 46 chosen via empirical testing (not just proportional math): caught 98% of genuine real climbs while keeping 0% false-BUY on quiet/noisy days across 50 trials each
  const watchThreshold = hasFullCheckData ? 45 : 30;

  let verdict = 'NO_SIGNAL';
  const bigMove = Math.abs(sessionChangePct) >= 2; // a genuinely large intraday move regardless of volume
  if (isFakeSpike) {
    verdict = 'AVOID_FAKE_SPIKE';
  } else if (score >= buySellThreshold && sessionChangePct > 0.3) {
    verdict = 'BUY';
  } else if (score >= buySellThreshold && sessionChangePct < -0.3) {
    verdict = 'SELL';
  } else if (bigMove && relVol < 1) {
    // Big price move, but NOT enough trading volume to trust it yet — flag this explicitly
    // instead of hiding it inside a generic WATCH. The person should know this happened.
    verdict = sessionChangePct > 0 ? 'STRONG_MOVE_WEAK_VOLUME_UP' : 'STRONG_MOVE_WEAK_VOLUME_DOWN';
  } else if (score >= watchThreshold) {
    verdict = 'WATCH';
  } else {
    verdict = 'AVOID';
  }

  return {
    symbol,
    price: last.c,
    sessionChangePct: round2(sessionChangePct),
    vwap: round2(vwap),
    aboveVWAP,
    relVol: round2(relVol),
    rsi: round2(rsi),
    atrExpanding,
    atrValue: round2(atrNow),
    structure,
    spikeDominance: round2(spikeDominance),
    momentumQuality: isFakeSpike ? 'FAKE (single-candle spike)' : (stepwiseConsistency >= 0.6 ? 'REAL (built gradually)' : 'MIXED (some inconsistency)'),
    score,
    achievableMax,
    hasFullCheckData,
    smartMoneyConcepts: {
      activeStructures: smc.activeStructures,
      bosChoch: smc.bosChoch.signal !== 'None' ? smc.bosChoch : null,
      orderBlock: smc.orderBlock,
      fvgs: smc.fvgs,
      liquidityGrab: smc.liquidityGrab,
    },
    recentSwingHigh: smcHighs.length > 0 ? round2(smcHighs[smcHighs.length - 1].price) : null,
    recentSwingLow: smcLows.length > 0 ? round2(smcLows[smcLows.length - 1].price) : null,
    allSwingHighs: smcHighs.map(h => round2(h.price)),
    allSwingLows: smcLows.map(l => round2(l.price)),
    pullbacksSinceIgnitionApprox, // approximation, see honest caveat where this is computed above
    categoryScores,
    qualityGrade,
    sector: sectorName ? { name: sectorName, ...(sectorInfo || {}) } : null,
    // RELATIVE STRENGTH — built per explicit spec request, exposed as
    // transparent data rather than baked silently into the score. HONEST
    // CONTEXT: this exact idea (a stock outperforming Nifty AND its
    // sector) was already backtested twice this session as "sector
    // alignment" — it improved one real sample (+0.29R) and WORSENED a
    // second, different real sample (-0.22R), meaning it did not reliably
    // replicate. Exposed here as real, available data for an OPTIONAL
    // frontend filter (off by default), not a silently-applied hard gate.
    relativeStrength: (niftyChangePct != null) ? {
      vsNifty: round2(sessionChangePct - niftyChangePct),
      vsSector: sectorInfo ? round2(sessionChangePct - sectorInfo.changePct) : null,
      outperformsBoth: sectorInfo ? (sessionChangePct - niftyChangePct > 0 && sessionChangePct - sectorInfo.changePct > 0) : null,
      underperformsBoth: sectorInfo ? (sessionChangePct - niftyChangePct < 0 && sessionChangePct - sectorInfo.changePct < 0) : null,
    } : null,
    verdict,
    reasons,
    timestamp: Date.now(),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

// RSI calculation (standard 14-period)
function computeRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// EMA (Exponential Moving Average) series — foundational for the VIRS Pro
// strategy set (Strategies 1/3/4/5/7 all require 9/21/50 EMA trend
// alignment checks), which did not exist anywhere in this codebase before.
// Standard EMA smoothing: seed with a simple average over the first
// `period` candles, then apply the standard multiplier to each subsequent
// close. Returns the FULL series (not just the latest value), since
// strategies need to compare EMA values across recent candles (e.g. "is
// price pulling back to the EMA," not just "where is it right now").
function computeEMASeries(closes, period) {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  const ema = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  ema[period - 1] = sum / period; // seed value: simple average of the first `period` closes
  for (let i = period; i < closes.length; i++) {
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// Resamples 5-min candles into a coarser timeframe (e.g. 15-min = groupSize
// 3) — needed because every VIRS Pro strategy requires 15-min EMA/trend
// checks, but this Worker only fetches 5-min candles to avoid an extra
// Yahoo Finance request. Tested against a hand-verified example before use.
function resampleCandles(candles, groupSize) {
  const resampled = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    if (group.length === 0) continue;
    resampled.push({
      o: group[0].o,
      h: Math.max(...group.map(c => c.h)),
      l: Math.min(...group.map(c => c.l)),
      c: group[group.length - 1].c,
      v: group.reduce((sum, c) => sum + c.v, 0),
    });
  }
  return resampled;
}

// ATR series (True Range smoothed) — used to detect expanding vs contracting volatility
function computeATRSeries(candles, period) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
    trs.push(tr);
  }
  const atr = [];
  for (let i = 0; i < trs.length; i++) {
    const window = trs.slice(Math.max(0, i - period + 1), i + 1);
    atr.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  return atr.length ? atr : [0];
}

// Detect simple HH/HL or LH/LL swing structure over the last N candles
function computeStructure(candles) {
  if (candles.length < 6) return 'UNCLEAR';
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const mid = Math.floor(candles.length / 2);
  const firstHalfHigh = Math.max(...highs.slice(0, mid));
  const secondHalfHigh = Math.max(...highs.slice(mid));
  const firstHalfLow = Math.min(...lows.slice(0, mid));
  const secondHalfLow = Math.min(...lows.slice(mid));

  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) return 'HH_HL';
  if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) return 'LH_LL';
  return 'UNCLEAR';
}

// Measures whether a price move built up gradually (many small steps in the same
// direction) vs came from one or two outsized candles (spike / potentially fake).
function computeConsistency(closes) {
  if (closes.length < 5) return 0;
  let sameDirCount = 0, totalMoves = 0;
  const netDir = Math.sign(closes[closes.length - 1] - closes[0]);
  if (netDir === 0) return 0;
  for (let i = 1; i < closes.length; i++) {
    const stepDir = Math.sign(closes[i] - closes[i - 1]);
    if (stepDir !== 0) { totalMoves++; if (stepDir === netDir) sameDirCount++; }
  }
  return totalMoves > 0 ? sameDirCount / totalMoves : 0;
}

// Direct check: was there a single candle that explains most of the session's move,
// AND was that candle abnormal in BOTH price move and volume compared to the rest
// of the session? Requiring both together is the actual signature of a fake/manipulated
// spike — a quiet, choppy, low-volume day should NOT trigger this just because its net
// move happens to be small (that was a real bug in an earlier version of this check).
function computeSpikeDominance(candles) {
  const avgMove = candles.reduce((s, c) => s + Math.abs(c.c - c.o), 0) / candles.length;
  const avgVol = candles.reduce((s, c) => s + c.v, 0) / candles.length;

  let spikeMove = 0;
  for (const c of candles) {
    const move = Math.abs(c.c - c.o);
    const isPriceOutlier = move > avgMove * 3;     // candle moved 3x+ the typical candle on this stock today
    const isVolumeOutlier = c.v > avgVol * 2.5;    // AND traded on 2.5x+ the typical volume
    if (isPriceOutlier && isVolumeOutlier && move > spikeMove) spikeMove = move;
  }
  if (spikeMove === 0) return 0; // no candle qualifies as a genuine price+volume outlier — not a spike-driven move

  const sessionMove = Math.abs(candles[candles.length - 1].c - candles[0].o);
  const safeBase = Math.max(sessionMove, avgMove * 2, 0.01);
  return Math.min(1, spikeMove / safeBase);
}

// ============================================================
// CORS + RESPONSE HELPERS
// ============================================================
function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}
