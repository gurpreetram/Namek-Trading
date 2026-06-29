import { useState, useCallback, useEffect, useRef } from 'react';
import { WORKER_BASE, SCAN_PAGE_DELAY_MS, MARKET_SCAN_INTERVAL_MS, ACTIONABLE_VERDICTS } from '../config/api';
import { saveScanState, loadScanState } from '../utils/persistence';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchScanPage(page, universe = 'full') {
  const universeParam = universe === 'full' ? '&universe=full' : '';
  const res = await fetch(`${WORKER_BASE}/scan-market?page=${page}${universeParam}`);
  if (!res.ok) throw new Error(`Scan page ${page} failed: HTTP ${res.status}`);
  return res.json();
}

// Hook: runs the full multi-page market scan (the website calling the Worker
// once per page, since the Worker itself can only handle ~35 stocks per
// invocation due to Cloudflare's free-tier subrequest limit). Merges all
// pages into one final result set once the scan completes.
export function useMarketScan() {
  // PERSISTENCE — restore from localStorage on initial mount if available
  // and from the SAME IST trading day, so a page refresh does not clear
  // Top Opportunities or Full Screener (both read from this shared state).
  // This only runs once, synchronously, at hook initialization.
  const restored = loadScanState();

  const [allResults, setAllResults] = useState(restored?.allResults || []);
  const [topSelections, setTopSelections] = useState(restored?.topSelections || []);
  // Refs that always track the latest value, used by runFullScan's seeding
  // logic below instead of a direct dependency on the state itself — this
  // avoids both a stale-closure bug (seeding with an outdated snapshot)
  // and the unwanted side effect of recreating runFullScan (and therefore
  // tearing down/recreating the scan-interval effect) on every single
  // setAllResults call during an in-progress scan.
  const allResultsRef = useRef(allResults);
  const topSelectionsRef = useRef(topSelections);
  useEffect(() => { allResultsRef.current = allResults; }, [allResults]);
  useEffect(() => { topSelectionsRef.current = topSelections; }, [topSelections]);
  const [committedPick, setCommittedPick] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [marketDirection, setMarketDirection] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ page: 0, totalPages: 0 });
  const [error, setError] = useState(null);
  const [lastScanCompletedAt, setLastScanCompletedAt] = useState(restored?.lastScanCompletedAt || null);
  const [universe, setUniverse] = useState(restored?.universe || null);
  const scanInProgressRef = useRef(false);
  // "TODAY'S COMMITTED PICK" — built per explicit request: Top Opportunities
  // legitimately reshuffles every scan cycle, which is fine for browsing but
  // unusable for "which ONE stock do I actually commit capital to." This
  // ref persists across scan cycles (a plain state variable would reset on
  // every render) to track which symbol is currently committed and prevent
  // every render) to track which symbol is currently committed and prevent
  // it from being dropped just because one cycle was noisy.
  const committedPickRef = useRef(null); // { symbol, sinceScanCount, droppedCycles }
  const scanCountRef = useRef(0);
  const [skippedPages, setSkippedPages] = useState([]);
  const [dailyTopPicks, setDailyTopPicks] = useState(restored?.dailyTopPicks || []);
  // RELATIVE STRENGTH FILTER — OFF by default. This exact idea was
  // backtested twice this session as "sector alignment": improved one
  // real sample (+0.29R), worsened a different real sample (-0.22R) —
  // it did not reliably replicate. Built as an opt-in toggle per
  // explicit request to keep the feature available, not a silent
  // hard requirement, given that honest evidence.
  const [relativeStrengthFilterEnabled, setRelativeStrengthFilterEnabled] = useState(false);
  const dailyPicksLockedRef = useRef(restored?.dailyTopPicks?.length > 0 ? restored.dailyTopPicks : null); // restore the LOCK state too, not just the display — otherwise a refresh would re-evaluate and potentially pick different stocks mid-day

  const resetDailyTopPicks = useCallback(() => {
    dailyPicksLockedRef.current = null;
    setDailyTopPicks([]);
  }, []);

  // RESILIENCE FIX: found that a single failed page (transient network blip,
  // Yahoo timeout, etc.) used to abort the ENTIRE scan, discarding all good
  // data already collected — a real problem made roughly 4x more likely once
  // full-NSE coverage meant ~95 pages instead of 23. Retries a failed page
  // twice with a short backoff before giving up and skipping it, so one bad
  // page costs a few stocks, not the whole scan.
  const fetchPageWithRetry = useCallback(async (page, universeMode) => {
    const MAX_ATTEMPTS = 3;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fetchScanPage(page, universeMode);
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt); // brief backoff before retrying
      }
    }
    throw lastErr;
  }, []);

  const runFullScan = useCallback(async (universeMode = 'full') => {
    // Guard against overlapping scans (e.g. manual refresh clicked while an
    // automatic scan is already running) — running two scans at once would
    // double up on Worker/Yahoo requests for no benefit.
    if (scanInProgressRef.current) return;
    scanInProgressRef.current = true;
    setScanning(true);
    setError(null);
    setSkippedPages([]);

    // SEED with currently-displayed (possibly restored-from-storage) data,
    // keyed by symbol — fixes a real UX regression found while building
    // persistence: starting these merge arrays empty meant a page refresh
    // would show the restored stock list for a split second, then SHRINK
    // dramatically as soon as the new scan's first page arrived (since the
    // merge started from zero and only had that one page's worth so far),
    // only refilling once the multi-minute full scan finished. Seeding
    // with prior data keyed by symbol means a stock not yet re-scanned
    // THIS cycle keeps showing its last-known data instead of vanishing.
    const resultsBySymbol = new Map(allResultsRef.current.map(r => [r.symbol, r]));
    const topBySymbol = new Map(topSelectionsRef.current.map(c => [c.stockName, c]));
    const mergedAlerts = [];
    const failedPages = [];
    let page = 0;
    let totalPages = 1;
    let universeLabel = null;
    let latestMarketDirection = null;

    try {
      while (page < totalPages) {
        let data;
        try {
          data = await fetchPageWithRetry(page, universeMode);
        } catch (err) {
          // This ONE page failed after retries — skip it and keep going,
          // rather than discarding everything collected from the other
          // 90+ pages. Recorded honestly, not hidden, so the person knows
          // coverage is slightly incomplete this cycle.
          failedPages.push(page);
          setSkippedPages([...failedPages]);
          if (totalPages > 1) { page += 1; continue; }
          else throw err; // if we don't even know totalPages yet (first page failed), there's nothing usable to fall back to
        }

        totalPages = data.totalPages || 1;
        universeLabel = data.universe || universeLabel;
        latestMarketDirection = data.marketDirection || latestMarketDirection;
        (data.results || []).forEach(r => resultsBySymbol.set(r.symbol, r)); // replaces the stale entry for this symbol with fresh data; symbols not in this page keep their existing entry
        (data.topSelections || []).forEach(c => topBySymbol.set(c.stockName, c));
        mergedAlerts.push(...(data.alerts || []));
        setProgress({ page: page + 1, totalPages });

        // Push partial results as we go, so the UI can show what's found so far
        // rather than appearing frozen until all pages finish.
        setAllResults([...resultsBySymbol.values()]);
        setTopSelections([...topBySymbol.values()].sort((a, b) => b.aiScore - a.aiScore));
        // Newest alerts first — a dashboard reads top-down as "what just happened."
        setAlerts([...mergedAlerts].sort((a, b) => b.timestamp - a.timestamp));
        if (latestMarketDirection) setMarketDirection(latestMarketDirection);

        if (data.isLastPage) break;
        page += 1;
        if (page < totalPages) await sleep(SCAN_PAGE_DELAY_MS);
      }

      setUniverse(universeLabel);
      setLastScanCompletedAt(Date.now());
      scanCountRef.current += 1;

      // COMMITTED PICK evaluation, using the FULL merged list now that this
      // scan cycle is complete — this only runs once per full scan, not
      // per-page, so it correctly sees the entire Top Opportunities picture.
      const fullSorted = [...topBySymbol.values()].sort((a, b) => b.aiScore - a.aiScore);
      const top3Now = fullSorted.slice(0, 3).map(c => c.stockName);
      const top10Symbols = new Set(fullSorted.slice(0, 10).map(c => c.stockName));

      const current = committedPickRef.current;
      if (current) {
        if (top10Symbols.has(current.symbol)) {
          committedPickRef.current = { ...current, droppedCycles: 0 };
        } else {
          const droppedCycles = (current.droppedCycles || 0) + 1;
          if (droppedCycles >= 2) {
            committedPickRef.current = null; // genuinely, sustainedly fell out of contention — released
          } else {
            committedPickRef.current = { ...current, droppedCycles }; // one bad cycle isn't enough to release yet
          }
        }
      }

      if (!committedPickRef.current) {
        // Check if any Top-3 stock has now appeared there for 2+ consecutive
        // scans (using the Worker's own consecutiveTop3 counter, which is
        // tracked server-side per symbol and already reflects this).
        const candidate = fullSorted.find(c => top3Now.includes(c.stockName) && (c.consecutiveTop3 || 0) >= 2);
        if (candidate) {
          committedPickRef.current = { symbol: candidate.stockName, sinceScanCount: scanCountRef.current, droppedCycles: 0 };
        }
      }

      if (committedPickRef.current) {
        const pickCard = fullSorted.find(c => c.stockName === committedPickRef.current.symbol);
        setCommittedPick(pickCard ? { ...pickCard, committedSinceScan: committedPickRef.current.sinceScanCount } : null);
      } else {
        setCommittedPick(null); // honestly null — nothing has proven itself across multiple cycles yet
      }

      // DAILY TOP PICKS — built per explicit request: "stocks which have
      // momentum, good profit-making setup" — held for the day, with a real,
      // evidence-based reason WHY each one qualified, and active EXIT
      // monitoring rather than silent holding until end of day.
      //
      // Gated on genuine momentum quality and strong volume specifically,
      // not just meeting the bare BUY/SELL score threshold. Capped at 2 SELL
      // + 2 BUY, ranked by score within each direction — fewer than 4 (even
      // zero) on a quiet day is the honest, correct outcome, not a bug to
      // "fix" by lowering the bar.
      const qualifies = c => {
        const baseQualifies =
          c.momentumConfirmation === 'REAL (built gradually)' &&
          c.volumeConfirmation === 'Strong' &&
          c.riskReward >= 2 &&
          c.aiScore >= 55 && // meaningfully above the bare 46 BUY/SELL threshold — this list is the cream of the crop, not merely "qualified"
          Math.abs(c.sessionChangePct ?? 0) >= 1.5 && // MOMENTUM FILTER, built per explicit spec: ignore weak movers — a real move needs at least 1.5% price change, distinct from the momentum-QUALITY check above (which judges HOW the move built, not how big it is)
          (c.distanceToTargetPct ?? 0) >= 1.5 && // DISTANCE TO RESISTANCE/SUPPORT, built per explicit spec: minimum 1.5% real room to move before resistance/support — rejects setups where the target is too close to be worth the trade
          (c.pullbacksSinceIgnitionApprox == null || c.pullbacksSinceIgnitionApprox <= 1); // FIRST-PULLBACK-ONLY (approximation, see honest caveat on the backend where this is computed) — null (no clear ignition found) is NOT treated as disqualifying, since rejecting everything we can't confidently classify would be more aggressive than the spec's actual intent of avoiding LATE (2nd/3rd) pullbacks specifically
        if (!baseQualifies) return false;
        if (!relativeStrengthFilterEnabled) return true; // OFF by default — see the honest evidence note where this toggle is declared
        const isLong = c.direction === 'BUY';
        const rs = c.relativeStrength;
        if (!rs) return false; // no relative-strength data available for this stock — honestly exclude rather than assume it passes
        return isLong ? rs.outperformsBoth === true : rs.underperformsBoth === true;
      };

      const buildQualificationReason = c => {
        const distanceTier = (c.distanceToTargetPct ?? 0) >= 2 ? `${c.distanceToTargetPct}% room to target (preferred 2%+ tier)` : `${c.distanceToTargetPct}% room to target (meets the 1.5% minimum)`;
        return `Real momentum confirmed (built gradually, not a single-candle spike) + Strong volume confirmation + Risk:Reward ${c.riskReward}:1 + Score ${c.aiScore}/${c.achievableMax} (above the 55-point quality bar for this list) + ${distanceTier}`;
      };

      if (!dailyPicksLockedRef.current) {
        const eligible = fullSorted.filter(qualifies);
        const topSells = eligible.filter(c => c.direction === 'SELL').sort((a, b) => b.aiScore - a.aiScore).slice(0, 2);
        const topBuys = eligible.filter(c => c.direction === 'BUY').sort((a, b) => b.aiScore - a.aiScore).slice(0, 2);
        // priceHistory starts tracking from the entry price itself — the
        // baseline to measure "is this moving with the trade or against it"
        // from this point forward.
        const picks = [...topBuys, ...topSells].map(c => ({ ...c, qualificationReason: buildQualificationReason(c), exitSignal: null, priceHistory: [c.entry], lifecycleStatus: 'NEW', lockedAt: Date.now() }));

        if (picks.length > 0) {
          dailyPicksLockedRef.current = picks;
          setDailyTopPicks(picks);
        }
        // If nothing qualifies yet, leave unlocked — keep checking on
        // future scans rather than locking in an empty/weak result.
      } else {
        // EXIT MONITORING — already locked for today. Re-check each held
        // stock's CURRENT state in THIS scan against the same criteria that
        // originally qualified it. A real, specific reason is required to
        // flag an exit — not just "it dropped in the rankings."
        const updated = dailyPicksLockedRef.current.map(held => {
          const current = fullSorted.find(c => c.stockName === held.stockName);
          if (!current) {
            // Stock didn't appear in this scan at all (e.g. resolved, or a
            // transient miss) — don't flag an exit on absence alone, only
            // on genuine evidence of deterioration found below.
            return held;
          }

          const reasons = [];
          // Update price history with this scan's price — builds the real,
          // ongoing record of how price has actually moved since entry.
          const priceHistory = [...(held.priceHistory || [held.entry]), current.lastPrice].slice(-12); // keep a bounded recent window, not unlimited growth

          // DIRECT PRICE CHECK — the most literal, important reason to exit:
          // has price actually reached the stop-loss or target level.
          const isLong = held.direction === 'BUY';
          if (current.lastPrice != null) {
            const hitStop = isLong ? current.lastPrice <= held.stopLoss : current.lastPrice >= held.stopLoss;
            const hitTarget = isLong ? current.lastPrice >= held.target1 : current.lastPrice <= held.target1;
            if (hitStop) reasons.push(`Price (₹${current.lastPrice}) has reached the stop-loss level (₹${held.stopLoss}) — exit now, don't wait for the score to catch up`);
            else if (hitTarget) reasons.push(`Price (₹${current.lastPrice}) has reached the target (₹${held.target1}) — take the profit`);
          }

          // VWAP LOST AFTER BREAKOUT — built per explicit request: only
          // applies when the original entry was itself characterized as a
          // VWAP-based setup (entryType containing "VWAP"); checking this
          // unconditionally on every trade would be meaningless for setups
          // that were never about VWAP in the first place.
          if (current.vwap != null && current.aboveVWAP != null && held.entryType?.includes('VWAP')) {
            if (isLong && !current.aboveVWAP) {
              reasons.push(`VWAP lost: price has fallen back below VWAP (₹${current.vwap}) after a VWAP-based entry — the structural reason for this trade no longer holds`);
            } else if (!isLong && current.aboveVWAP) {
              reasons.push(`VWAP reclaimed: price has risen back above VWAP (₹${current.vwap}) after a VWAP-based entry — the structural reason for this trade no longer holds`);
            }
          }

          // STRUCTURE BROKEN — built per explicit request: distinct from
          // the stop-loss itself, this checks whether the underlying swing
          // structure that justified the entry has been violated (a new,
          // more extreme swing point forming against the trade), which can
          // be real, useful information even before the stop price itself
          // is technically reached.
          if (current.structureLevel != null && current.lastPrice != null) {
            if (isLong && current.lastPrice < current.structureLevel) {
              reasons.push(`Structure broken: price (₹${current.lastPrice}) has closed below the swing-low level (₹${current.structureLevel}) that justified this trade`);
            } else if (!isLong && current.lastPrice > current.structureLevel) {
              reasons.push(`Structure broken: price (₹${current.lastPrice}) has closed above the swing-high level (₹${current.structureLevel}) that justified this trade`);
            }
          }

          // "GOING OPPOSITE" CHECK — built per explicit request: not just
          // "did price touch a number" (visible on any chart) but "is the
          // trade's actual price movement SINCE ENTRY consistently going
          // against the direction it was picked for." Requires a CLEAR
          // majority (65%+) of recent price moves to be against the trade,
          // not just a bare 50-55% which could be ordinary noise. Tested
          // directly against a genuine-reversal case and a normal-noise
          // case before building this in — the normal-noise case correctly
          // does NOT fire.
          if (priceHistory.length >= 4 && reasons.length === 0) { // only check this if nothing more direct (stop/target) already fired
            let against = 0, withTrade = 0;
            for (let i = 1; i < priceHistory.length; i++) {
              const change = priceHistory[i] - priceHistory[i - 1];
              if (change === 0) continue;
              const favorable = isLong ? change > 0 : change < 0;
              if (favorable) withTrade++; else against++;
            }
            const total = against + withTrade;
            if (total > 0 && against / total >= 0.65) {
              reasons.push(`Price has moved against this ${held.direction} trade in ${Math.round((against / total) * 100)}% of recent checks — the trade is genuinely going the opposite way, not just normal noise`);
            }
          }

          if (current.momentumConfirmation !== 'REAL (built gradually)') {
            reasons.push(`Momentum is no longer confirmed as real (now: ${current.momentumConfirmation})`);
          }
          if (current.volumeConfirmation !== 'Strong') {
            reasons.push(`Volume confirmation weakened (now: ${current.volumeConfirmation})`);
          }
          if (current.direction !== held.direction) {
            reasons.push(`Direction flipped from ${held.direction} to ${current.direction} — the original setup is no longer valid`);
          }
          if (current.riskReward < 2) {
            reasons.push(`Risk:Reward dropped below 2:1 (now ${current.riskReward}:1)`);
          }

          // LIFECYCLE STATUS — built per explicit request: every pick
          // should show NEW / ACTIVE / NEAR TARGET / TARGET HIT / EXIT,
          // not simply appear or disappear from the screen. Computed from
          // real data already tracked (priceHistory, target/entry
          // distance, exitSignal), not a separate guess.
          const computeLifecycleStatus = () => {
            if (reasons.length > 0 || held.exitSignal) return 'EXIT';
            const hitTarget = isLong ? current.lastPrice >= held.target1 : current.lastPrice <= held.target1;
            if (hitTarget) return 'TARGET_HIT';
            const totalDistance = Math.abs(held.target1 - held.entry);
            const coveredDistance = isLong ? current.lastPrice - held.entry : held.entry - current.lastPrice;
            const progressPct = totalDistance > 0 ? coveredDistance / totalDistance : 0;
            if (progressPct >= 0.70) return 'NEAR_TARGET';
            return 'ACTIVE'; // already past its first scan by the time this monitoring branch runs at all
          };

          if (reasons.length > 0 && !held.exitSignal) {
            // Genuinely new exit evidence found, and this stock wasn't
            // already flagged — surface it once, clearly, with the real
            // reason(s), not a vague "watch out."
            return { ...held, priceHistory, lifecycleStatus: 'EXIT', removedAt: Date.now(), exitSignal: { reasons, flaggedAt: Date.now(), atPrice: current.entry } };
          }
          const newStatus = computeLifecycleStatus();
          const isNewlyTerminal = (newStatus === 'TARGET_HIT' || newStatus === 'EXIT') && held.lifecycleStatus !== 'TARGET_HIT' && held.lifecycleStatus !== 'EXIT';
          return { ...held, priceHistory, lifecycleStatus: newStatus, removedAt: isNewlyTerminal ? Date.now() : held.removedAt }; // either no new evidence of breakdown, or already flagged previously — don't re-flag repeatedly, but ALWAYS carry the updated price history forward so the going-opposite check has real data on future scans
        });

        dailyPicksLockedRef.current = updated;
        setDailyTopPicks(updated);
      }
    } catch (err) {
      setError(err.message || 'Market scan failed');
    } finally {
      setScanning(false);
      scanInProgressRef.current = false;
    }
  }, [fetchPageWithRetry, relativeStrengthFilterEnabled]);

  useEffect(() => {
    queueMicrotask(() => runFullScan());
    const id = setInterval(runFullScan, MARKET_SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [runFullScan]);

  // PERSISTENCE — save whenever the key scan results change, so a page
  // refresh restores Top Opportunities (via topSelections/dailyTopPicks)
  // and Full Screener (via allResults), per explicit request that "page
  // refresh must not clear" either tab. Only saves once a scan has
  // genuinely produced results — an empty initial state isn't worth
  // persisting and would otherwise overwrite a good prior save during the
  // brief window before the first scan completes.
  useEffect(() => {
    if (allResults.length === 0 && topSelections.length === 0) return;
    saveScanState({ allResults, topSelections, dailyTopPicks, universe, lastScanCompletedAt });
  }, [allResults, topSelections, dailyTopPicks, universe, lastScanCompletedAt]);

  const actionable = allResults
    .filter(r => ACTIONABLE_VERDICTS.includes(r.verdict))
    .sort((a, b) => b.score - a.score);

  const buys = actionable.filter(r => r.verdict === 'BUY');
  const sells = actionable.filter(r => r.verdict === 'SELL');
  const strongMoves = actionable.filter(r => r.verdict.startsWith('STRONG_MOVE'));
  const watching = actionable.filter(r => r.verdict === 'WATCH');
  const fakeSpikesFiltered = allResults.filter(r => r.verdict === 'AVOID_FAKE_SPIKE').length;

  return {
    allResults,
    topSelections,
    committedPick,
    dailyTopPicks,
    resetDailyTopPicks,
    relativeStrengthFilterEnabled,
    setRelativeStrengthFilterEnabled,
    skippedPages,
    alerts,
    marketDirection,
    actionable,
    buys,
    sells,
    strongMoves,
    watching,
    fakeSpikesFiltered,
    scanning,
    progress,
    error,
    lastScanCompletedAt,
    universe,
    runFullScan,
  };
}
