import { useState, useEffect, useCallback, useRef } from 'react';
import { WORKER_BASE } from '../config/api';

// Fetches a single live quote from the Worker's /quote endpoint.
// Used for indices and individual stock tickers that just need current price.
async function fetchQuote(symbol) {
  const res = await fetch(`${WORKER_BASE}/quote?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`Quote fetch failed for ${symbol}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Hook: tracks live quotes for a set of symbols, refreshing on an interval.
// Returns { data, loading, error, lastUpdated } where data is keyed by symbol.
export function useLiveQuotes(symbols, intervalMs) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const symbolsRef = useRef(symbols);

  // Refs must be updated in an effect, not during render — mutating .current
  // directly in the render body is unsafe under React's concurrent rendering.
  useEffect(() => {
    symbolsRef.current = symbols;
  }, [symbols]);

  const refresh = useCallback(async () => {
    const currentSymbols = symbolsRef.current;
    if (!currentSymbols || currentSymbols.length === 0) return;

    const results = await Promise.allSettled(currentSymbols.map(fetchQuote));
    const next = {};
    let anySucceeded = false;
    let firstError = null;

    results.forEach((result, i) => {
      const symbol = currentSymbols[i];
      if (result.status === 'fulfilled') {
        next[symbol] = result.value;
        anySucceeded = true;
      } else if (!firstError) {
        firstError = result.reason?.message || 'Unknown error';
      }
    });

    setData(prev => ({ ...prev, ...next }));
    setLoading(false);
    if (anySucceeded) {
      setError(null);
      setLastUpdated(Date.now());
    } else if (firstError) {
      setError(firstError);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, loading, error, lastUpdated, refresh };
}
