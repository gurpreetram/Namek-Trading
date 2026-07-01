import { useState, useEffect } from 'react';
import { WORKER_BASE } from '../config/api';

async function fetchNews(symbol) {
  const res = await fetch(`${WORKER_BASE}/news-check?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`News check failed: HTTP ${res.status}`);
  return res.json();
}

function SentimentBadge({ sentiment }) {
  const colors = {
    Bullish: { color: 'var(--green)', bg: 'var(--green-bg)' },
    Bearish: { color: 'var(--red)', bg: 'var(--red-bg)' },
    Neutral: { color: 'var(--amber)', bg: 'var(--amber-bg)' },
    Unknown: { color: 'var(--text3)', bg: 'rgba(255,255,255,0.03)' },
  };
  const c = colors[sentiment] || colors.Unknown;
  return <span style={{ ...styles.sentimentBadge, color: c.color, background: c.bg }}>{sentiment}</span>;
}

function NewsCard({ symbol }) {
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchNews(symbol)
      .then(data => { if (!cancelled) { setNews(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return <div style={styles.card}><div style={styles.loadingText}>Loading news for {symbol.replace('.NS', '')}...</div></div>;
  }
  if (error) {
    return <div style={styles.card}><div style={styles.errorText}>⚠️ {error}</div></div>;
  }
  if (!news.available) {
    return (
      <div style={styles.card}>
        <div style={styles.cardHead}>
          <span style={styles.symbol}>{symbol.replace('.NS', '')}</span>
          <SentimentBadge sentiment="Unknown" />
        </div>
        <div style={styles.unavailableText}>{news.reason}</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <span style={styles.symbol}>{symbol.replace('.NS', '')}</span>
        <SentimentBadge sentiment={news.sentiment} />
        <span style={styles.newsScore}>Score {news.newsScore}/100</span>
      </div>
      {news.headlines?.map((h, i) => (
        <a key={i} href={h.url} target="_blank" rel="noopener noreferrer" style={styles.headlineLink}>
          <div style={styles.headlineTitle}>{h.title}</div>
          <div style={styles.headlineMeta}>{h.source} · {new Date(h.publishedAt).toLocaleString('en-IN')}</div>
        </a>
      ))}
    </div>
  );
}

export default function NewsPanel({ topSymbols }) {
  const symbols = (topSymbols || []).slice(0, 5);

  return (
    <div>
      <div style={styles.note}>
        📰 Real news via Marketaux, fetched for your current Top Opportunities — refreshed hourly to stay within the free-tier rate limit. The trading engine's scoring and verdicts work independently of this, with or without news available.
      </div>

      {symbols.length === 0 ? (
        <div style={styles.emptyState}>
          No top opportunities yet to show news for — once the market scan finds some, their news will appear here automatically.
        </div>
      ) : (
        symbols.map(sym => <NewsCard key={sym} symbol={sym} />)
      )}
    </div>
  );
}

const styles = {
  note: { fontSize: 12, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 13px', marginBottom: 16 },
  emptyState: { fontSize: 13, color: 'var(--text3)', padding: '24px 16px', textAlign: 'center', background: 'var(--bg2)', borderRadius: 11, border: '1px solid var(--border)' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 11, padding: 15, marginBottom: 10 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  symbol: { fontSize: 14, fontWeight: 700 },
  sentimentBadge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 12 },
  newsScore: { fontSize: 11, color: 'var(--text3)' },
  loadingText: { fontSize: 12, color: 'var(--text3)' },
  errorText: { fontSize: 12, color: 'var(--red)' },
  unavailableText: { fontSize: 12, color: 'var(--text3)' },
  headlineLink: { display: 'block', textDecoration: 'none', padding: '8px 0', borderTop: '1px solid var(--border)' },
  headlineTitle: { fontSize: 13, color: 'var(--text)', lineHeight: 1.4, marginBottom: 3 },
  headlineMeta: { fontSize: 11, color: 'var(--text3)' },
};
