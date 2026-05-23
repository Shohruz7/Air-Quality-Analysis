import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Filters } from './components/Filters';
import { KPIs } from './components/KPIs';
import { MapTab } from './components/MapTab';
import { TimeSeriesHeatmapTab } from './components/TimeSeriesHeatmapTab';
import { ComparisonTab } from './components/ComparisonTab';
import { AQIComponent } from './components/AQIComponent';
import { TrendAnalysis } from './components/TrendAnalysis';
import { SeasonalPatterns } from './components/SeasonalPatterns';
import { CorrelationAnalysis } from './components/CorrelationAnalysis';
import { ExportComponent } from './components/ExportComponent';
import { Documentation } from './components/Documentation';
import type { FilterRequest, Metadata } from './services/api';
import { apiService } from './services/api';
import './App.css';

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [filters, setFilters] = useState<FilterRequest>({
    exclude_outliers: true,
    agg_level: 'Season',
  });
  const [kpis, setKPIs] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'timeseries' | 'comparison' | 'analysis' | 'documentation'>(
    () => (localStorage.getItem('activeTab') as any) || 'map'
  );
  const [analysisSubTab, setAnalysisSubTab] = useState<'aqi' | 'trends' | 'seasonal' | 'correlation' | 'export'>(
    () => (localStorage.getItem('analysisSubTab') as any) || 'aqi'
  );
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState<boolean>(
    () => localStorage.getItem('darkMode') === 'true'
  );

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await apiService.getMetadata();
        setMetadata(data);
        if (data.date_range.min && data.date_range.max) {
          setFilters((prev) => ({
            ...prev,
            date_range: [data.date_range.min!, data.date_range.max!],
          }));
        }
      } catch {
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    // Add timeout fallback
    const timeoutId = setTimeout(() => {
      if (loading) setLoading(false);
    }, 15000);

    loadMetadata();

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadKPIs = async () => {
      try {
        const data = await apiService.getKPIs(filters);
        if (mounted) setKPIs(data.error ? null : data);
      } catch { /* KPIs are non-critical; failures shown via null state */ }
    };
    if (metadata) loadKPIs();
    return () => { mounted = false; };
  }, [filters, metadata]);

  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => { localStorage.setItem('activeTab', activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem('analysisSubTab', analysisSubTab); }, [analysisSubTab]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div>Loading dashboard...</div>
          <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
            Connecting to backend API...
          </div>
        </div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="app">
        <div className="loading" style={{ color: '#d32f2f' }}>
          <div>Failed to load dashboard data</div>
          <div style={{ marginTop: '10px', fontSize: '14px' }}>
            Please check that the backend API is running and reachable.
          </div>
        </div>
      </div>
    );
  }

  const unit = kpis?.unit || (metadata?.pollutants.length ? '' : '');

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header className="app-header">
        <div className="header-top">
          <div>
            <h1>NYC Air Quality Dashboard</h1>
            <p>Explore air quality data from NYC monitoring stations</p>
          </div>
          <div className="dark-mode-toggle">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className="toggle-label">{darkMode ? 'Dark' : 'Light'}</span>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => setActiveTab('map')}
        >
          Map
        </button>
        <button
          className={activeTab === 'timeseries' ? 'active' : ''}
          onClick={() => setActiveTab('timeseries')}
        >
          Time Series & Heatmap
        </button>
        <button
          className={activeTab === 'comparison' ? 'active' : ''}
          onClick={() => setActiveTab('comparison')}
        >
          Comparison
        </button>
        <button
          className={activeTab === 'analysis' ? 'active' : ''}
          onClick={() => setActiveTab('analysis')}
        >
          Analysis
        </button>
        <button
          className={activeTab === 'documentation' ? 'active' : ''}
          onClick={() => setActiveTab('documentation')}
        >
          Documentation
        </button>
      </div>

      <div className="tab-content">
        <ErrorBoundary key={activeTab} label={activeTab}>
        {activeTab === 'map' && <MapTab filters={filters} />}
        {activeTab === 'timeseries' && <TimeSeriesHeatmapTab filters={filters} />}
        {activeTab === 'comparison' && <ComparisonTab filters={filters} metadata={metadata} />}
        {activeTab === 'documentation' && <Documentation />}
        {activeTab === 'analysis' && (
          <div className="analysis-tab">
            <div className="analysis-subtabs">
              <button
                className={analysisSubTab === 'aqi' ? 'active' : ''}
                onClick={() => setAnalysisSubTab('aqi')}
              >
                AQI & Health
              </button>
              <button
                className={analysisSubTab === 'trends' ? 'active' : ''}
                onClick={() => setAnalysisSubTab('trends')}
              >
                Trends
              </button>
              <button
                className={analysisSubTab === 'seasonal' ? 'active' : ''}
                onClick={() => setAnalysisSubTab('seasonal')}
              >
                Seasonal
              </button>
              <button
                className={analysisSubTab === 'correlation' ? 'active' : ''}
                onClick={() => setAnalysisSubTab('correlation')}
              >
                Correlation
              </button>
              <button
                className={analysisSubTab === 'export' ? 'active' : ''}
                onClick={() => setAnalysisSubTab('export')}
              >
                Export
              </button>
            </div>

            <div className="analysis-content">
              {analysisSubTab === 'aqi' && (
                <div className="analysis-card">
                  <AQIComponent filters={filters} />
                </div>
              )}
              {analysisSubTab === 'trends' && (
                <div className="analysis-card">
                  <TrendAnalysis filters={filters} />
                </div>
              )}
              {analysisSubTab === 'seasonal' && (
                <div className="analysis-card">
                  <SeasonalPatterns filters={filters} />
                </div>
              )}
              {analysisSubTab === 'correlation' && (
                <div className="analysis-card">
                  <CorrelationAnalysis filters={filters} />
                </div>
              )}
              {analysisSubTab === 'export' && (
                <div className="analysis-card">
                  <ExportComponent filters={filters} />
                </div>
              )}
            </div>
          </div>
        )}
        </ErrorBoundary>
      </div>

      <KPIs kpis={kpis} unit={unit} />

      <Filters
        metadata={metadata}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <footer className="app-footer">
        <p>
          <strong>Data source:</strong> NYC Open Data (Dataset: c3uy-2p5r) | Processed parquet: data/processed/measurements.parquet
        </p>
      </footer>
    </div>
  );
}

export default App;
