import React, { useEffect, useState } from 'react';
import { Filters } from './components/Filters';
import { KPIs } from './components/KPIs';
import { MapTab } from './components/MapTab';
import { TimeSeriesHeatmapTab } from './components/TimeSeriesHeatmapTab';
import { ComparisonTab } from './components/ComparisonTab';
import { FilterRequest, Metadata } from './services/api';
import { apiService } from './services/api';
import './App.css';

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [filters, setFilters] = useState<FilterRequest>({
    exclude_outliers: true,
    agg_level: 'Season',
  });
  const [kpis, setKPIs] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'timeseries' | 'comparison'>('map');
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const data = await apiService.getMetadata();
        setMetadata(data);
        // Set default date range
        if (data.date_range.min && data.date_range.max) {
          setFilters((prev) => ({
            ...prev,
            date_range: [data.date_range.min!, data.date_range.max!],
          }));
        }
      } catch (error) {
        console.error('Error loading metadata:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMetadata();
  }, []);

  useEffect(() => {
    const loadKPIs = async () => {
      try {
        const data = await apiService.getKPIs(filters);
        setKPIs(data);
      } catch (error) {
        console.error('Error loading KPIs:', error);
      }
    };

    if (metadata) {
      loadKPIs();
    }
  }, [filters, metadata]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading dashboard...</div>
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
            <span className="toggle-label">{darkMode ? '🌙 Dark' : '☀️ Light'}</span>
          </div>
        </div>
      </header>

      <Filters
        metadata={metadata}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <KPIs kpis={kpis} unit={unit} />

      <div className="tabs">
        <button
          className={activeTab === 'map' ? 'active' : ''}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Map
        </button>
        <button
          className={activeTab === 'timeseries' ? 'active' : ''}
          onClick={() => setActiveTab('timeseries')}
        >
          📈 Time Series & Heatmap
        </button>
        <button
          className={activeTab === 'comparison' ? 'active' : ''}
          onClick={() => setActiveTab('comparison')}
        >
          🔍 Comparison
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'map' && <MapTab filters={filters} />}
        {activeTab === 'timeseries' && <TimeSeriesHeatmapTab filters={filters} />}
        {activeTab === 'comparison' && <ComparisonTab filters={filters} metadata={metadata} />}
      </div>

      <footer className="app-footer">
        <p>
          <strong>Data source:</strong> NYC Open Data (Dataset: c3uy-2p5r) | Processed parquet: data/processed/measurements.parquet
        </p>
      </footer>
    </div>
  );
}

export default App;
