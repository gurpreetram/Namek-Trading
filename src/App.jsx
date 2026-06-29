import { useMemo, useState } from 'react';
import Topbar from './components/Topbar';
import NavTabs from './components/NavTabs';
import TopOpportunities from './components/TopOpportunities';
import AIScreener from './components/AIScreener';
import IndicesPanel from './components/IndicesPanel';
import SectorsPanel from './components/SectorsPanel';
import SignalsPanel from './components/SignalsPanel';
import NewsPanel from './components/NewsPanel';
import PerformancePanel from './components/PerformancePanel';
import PreMarketPanel from './components/PreMarketPanel';
import RiskManager from './components/RiskManager';
import StrategyGuide from './components/StrategyGuide';
import ToastContainer from './components/ToastContainer';
import { useLiveQuotes } from './hooks/useLiveQuotes';
import { useMarketScan } from './hooks/useMarketScan';
import { INDEX_SYMBOLS, FAST_REFRESH_MS } from './config/api';

const TABS = [
  { key: 'premarket', label: '🌅 Pre-Market' },
  { key: 'top', label: '🏆 Top Opportunities' },
  { key: 'screener', label: '🔍 Full Screener' },
  { key: 'indices', label: '📈 Indices' },
  { key: 'sectors', label: '🏢 Sectors' },
  { key: 'signals', label: '⚡ Signals' },
  { key: 'performance', label: '📊 Performance' },
  { key: 'news', label: '📰 News' },
  { key: 'risk', label: '🛡 Risk Manager' },
  { key: 'guide', label: '📚 Strategy Guide' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('top');

  const allIndexSymbols = useMemo(() => Object.keys(INDEX_SYMBOLS), []);
  const prioritySymbols = useMemo(
    () => allIndexSymbols.filter(s => INDEX_SYMBOLS[s].priority),
    [allIndexSymbols]
  );

  // Topbar only needs the 3 priority indices, refreshed fast.
  const { data: topbarQuotes } = useLiveQuotes(prioritySymbols, FAST_REFRESH_MS);

  // The Indices AND Sectors tabs both need the full index set — only actively
  // fetched while one of those tabs is open, so we're not pulling extra data
  // the person isn't even looking at.
  const needsAllIndices = activeTab === 'indices' || activeTab === 'sectors';
  const indicesSymbols = needsAllIndices ? allIndexSymbols : [];
  const { data: allIndexQuotes, loading: indicesLoading } = useLiveQuotes(indicesSymbols, FAST_REFRESH_MS * 2);

  const scan = useMarketScan();
  const mergedQuotes = { ...topbarQuotes, ...allIndexQuotes };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar quotes={topbarQuotes} />
      <NavTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
      <ToastContainer alerts={scan.alerts} dailyTopPicks={scan.dailyTopPicks} />

      <div style={{ padding: 18, maxWidth: 900, margin: '0 auto' }}>
        {activeTab === 'premarket' && (
          <>
            <h2 style={sectionHeadStyle}>Pre-Market Watchlist</h2>
            <PreMarketPanel />
          </>
        )}

        {activeTab === 'top' && (
          <>
            <h2 style={sectionHeadStyle}>Top Opportunities — Highest Probability Setups</h2>
            <TopOpportunities scan={scan} />
          </>
        )}

        {activeTab === 'screener' && (
          <>
            <h2 style={sectionHeadStyle}>Full Screener — All Verified Setups by Category</h2>
            <AIScreener scan={scan} />
          </>
        )}

        {activeTab === 'indices' && (
          <>
            <h2 style={sectionHeadStyle}>All Indian Indices — Live</h2>
            <IndicesPanel quotes={mergedQuotes} loading={indicesLoading} />
          </>
        )}

        {activeTab === 'sectors' && (
          <>
            <h2 style={sectionHeadStyle}>Sector Rotation — Live Ranking</h2>
            <SectorsPanel quotes={mergedQuotes} loading={indicesLoading} />
          </>
        )}

        {activeTab === 'signals' && (
          <>
            <h2 style={sectionHeadStyle}>Live Signals</h2>
            <SignalsPanel
              scan={scan}
              niftyQuote={topbarQuotes['^NSEI']}
              bankNiftyQuote={topbarQuotes['^NSEBANK']}
              vixQuote={topbarQuotes['^INDIAVIX']}
            />
          </>
        )}

        {activeTab === 'performance' && (
          <>
            <h2 style={sectionHeadStyle}>Performance & Backtesting</h2>
            <PerformancePanel />
          </>
        )}

        {activeTab === 'news' && (
          <>
            <h2 style={sectionHeadStyle}>Market News</h2>
            <NewsPanel topSymbols={scan.topSelections.map(s => s.stockName)} />
          </>
        )}

        {activeTab === 'risk' && (
          <>
            <h2 style={sectionHeadStyle}>Risk Manager</h2>
            <RiskManager scan={scan} />
          </>
        )}

        {activeTab === 'guide' && (
          <>
            <h2 style={sectionHeadStyle}>Strategy Guide</h2>
            <StrategyGuide />
          </>
        )}
      </div>
    </div>
  );
}

const sectionHeadStyle = {
  fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 14,
  textTransform: 'uppercase', letterSpacing: 0.6,
};
