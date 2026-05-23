import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface TrendAnalysisProps {
  filters: FilterRequest;
}

interface TrendData {
  pollutant: string;
  years: number[];
  values: number[];
  slope: number;
  r_squared: number;
  p_value: number;
  significant: boolean;
  direction: string;
  trend_icon: string;
  pct_change: number;
  first_year: number;
  last_year: number;
}

const YOY_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
const MAX_YOY_YEARS = 6;

function defaultYears(years: number[]): number[] {
  if (years.length <= MAX_YOY_YEARS) return [...years];
  const step = Math.floor(years.length / (MAX_YOY_YEARS - 1));
  const picks: number[] = [];
  for (let i = 0; i < years.length; i += step) picks.push(years[i]);
  if (picks[picks.length - 1] !== years[years.length - 1]) picks.push(years[years.length - 1]);
  return picks.slice(0, MAX_YOY_YEARS);
}

export const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ filters }) => {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yoyPollutant, setYoyPollutant] = useState<string>('');
  const [yoySelectedYears, setYoySelectedYears] = useState<number[]>([]);
  const [yoyData, setYoyData] = useState<any>(null);
  const [yoyLoading, setYoyLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadTrends = async () => {
      try {
        setLoading(true);
        const response = await apiService.getTrendAnalysis(filters);
        if (!mounted) return;
        if (response.trends) {
          setTrends(response.trends);
        } else {
          setError(response.error || 'Failed to load trend data');
        }
      } catch (err: any) {
        if (mounted) {
          const errorMsg = err.response?.data?.error || err.message || 'Error loading trend data. Please check your connection.';
          setError(errorMsg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadTrends();
    return () => { mounted = false; };
  }, [filters]);

  // Initialise YoY controls once trends load — prefer a pollutant with many years of data
  useEffect(() => {
    if (trends.length === 0) return;
    const best = trends.reduce((a, b) => b.years.length > a.years.length ? b : a, trends[0]);
    setYoyPollutant(best.pollutant);
    setYoySelectedYears(defaultYears(best.years));
  }, [trends]);

  // Fetch YoY data whenever pollutant or selected years change
  useEffect(() => {
    if (!yoyPollutant || yoySelectedYears.length === 0) return;
    let mounted = true;
    const fetchYoY = async () => {
      setYoyLoading(true);
      try {
        const result = await apiService.getYearlyComparison(yoyPollutant, yoySelectedYears, filters);
        if (mounted) setYoyData(result.error ? null : result);
      } catch {
        if (mounted) setYoyData(null);
      } finally {
        if (mounted) setYoyLoading(false);
      }
    };
    fetchYoY();
    return () => { mounted = false; };
  }, [yoyPollutant, yoySelectedYears, filters]);

  const handlePollutantChange = (pollutant: string) => {
    setYoyPollutant(pollutant);
    const trend = trends.find(t => t.pollutant === pollutant);
    if (trend) setYoySelectedYears(defaultYears(trend.years));
    setYoyData(null);
  };

  const toggleYear = (year: number) => {
    setYoySelectedYears(prev => {
      if (prev.includes(year)) return prev.length > 1 ? prev.filter(y => y !== year) : prev;
      if (prev.length >= MAX_YOY_YEARS) return prev;
      return [...prev].concat(year).sort((a, b) => a - b);
    });
  };

  if (loading) return <div className="loading">Loading trend analysis...</div>;
  if (error) return <div className="error-message-inline"><p>{error}</p></div>;
  if (trends.length === 0) {
    return (
      <div className="no-data-message">
        <p>No trend data available for selected filters.</p>
      </div>
    );
  }

  return (
    <div className="trend-analysis">
      <h3>Trend Analysis</h3>
      <p className="subtitle">Year-over-year trends and statistical significance</p>
      
      <div className="math-explanation">
        <details>
          <summary><strong>How Trend Analysis Works</strong></summary>
          <div className="explanation-content">
            <p><strong>Linear Regression:</strong> Fits a straight line through the data points to find the overall trend.</p>
            
            <p><strong>Key Metrics:</strong></p>
            <ul>
              <li><strong>Slope:</strong> The rate of change per year
                <ul>
                  <li>Positive slope (↑): Pollutant levels are increasing over time</li>
                  <li>Negative slope (↓): Pollutant levels are decreasing over time</li>
                  <li>Zero slope (→): No significant change</li>
                </ul>
              </li>
              <li><strong>R² (R-squared):</strong> Proportion of variance explained by the trend (0 to 1)
                <ul>
                  <li>R² = 1.0: Perfect fit - all variation explained by the trend</li>
                  <li>R² = 0.7: 70% of variation explained by the trend</li>
                  <li>R² &lt; 0.3: Weak trend - most variation is random</li>
                </ul>
              </li>
              <li><strong>P-value:</strong> Statistical significance of the trend
                <ul>
                  <li>p &lt; 0.05: Statistically significant trend (95% confidence)</li>
                  <li>p &ge; 0.05: Not statistically significant - trend could be due to chance</li>
                </ul>
              </li>
              <li><strong>Percentage Change:</strong> Total change from first to last year
                <ul>
                  <li>Formula: ((last_value - first_value) / first_value) × 100%</li>
                  <li>Shows overall improvement or deterioration</li>
                </ul>
              </li>
            </ul>
            
            <p><strong>Formula (Linear Regression):</strong> y = mx + b</p>
            <p>Where: y = pollutant value, x = year, m = slope, b = intercept</p>
            
            <p><strong>Interpretation:</strong> A significant decreasing trend (↓) with high R² suggests effective pollution control measures. An increasing trend (↑) may indicate worsening air quality or increased pollution sources.</p>
          </div>
        </details>
      </div>
      
      <div className="trends-grid">
        {trends.map((trend, idx) => {
          // Create trend line data
          const trendLine = trend.years.map(year =>
            trend.values[0] + trend.slope * (year - trend.years[0])
          );

          return (
            <div key={idx} className="trend-card">
              <div className="trend-header">
                <h3>{trend.pollutant}</h3>
                <div className={`trend-indicator ${trend.direction}`}>
                  <span className="trend-icon">{trend.trend_icon}</span>
                  <span className="trend-direction">{trend.direction}</span>
                  {trend.significant && <span className="significant-badge">Significant</span>}
                </div>
              </div>
              
              <div className="trend-stats">
                <div className="stat-item">
                  <span className="stat-label">Change ({trend.first_year}-{trend.last_year}):</span>
                  <span className={`stat-value ${trend.pct_change >= 0 ? 'increase' : 'decrease'}`}>
                    {trend.pct_change >= 0 ? '+' : ''}{trend.pct_change.toFixed(1)}%
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">R²:</span>
                  <span className="stat-value">{(trend.r_squared * 100).toFixed(1)}%</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">P-value:</span>
                  <span className="stat-value">{trend.p_value.toFixed(4)}</span>
                </div>
              </div>
              
              <div className="trend-chart">
                <Plot
                  data={[
                    {
                      x: trend.years,
                      y: trend.values,
                      type: 'scatter',
                      mode: 'lines+markers',
                      name: 'Actual',
                      line: { color: '#667eea', width: 2 },
                      marker: { size: 8 },
                    },
                    {
                      x: trend.years,
                      y: trendLine,
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Trend',
                      line: { color: '#ff6b6b', width: 2, dash: 'dash' },
                    },
                  ]}
                  layout={{
                    title: '',
                    xaxis: { title: 'Year', fixedrange: true },
                    yaxis: { title: 'Value', fixedrange: true },
                    height: 300,
                    margin: { t: 10, b: 50, l: 60, r: 20 },
                    showlegend: true,
                    legend: { x: 0, y: 1 },
                    dragmode: false,
                  }}
                  config={{ 
                    displayModeBar: false,
                    doubleClick: false,
                    scrollZoom: false,
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Year-over-Year Comparison */}
      <div className="yoy-comparison">
        <h3>Year-over-Year Comparison</h3>
        <p className="subtitle">Compare seasonal patterns across selected years for a single pollutant</p>

        <div className="yoy-controls">
          <div className="yoy-control-row">
            <label className="yoy-label">Pollutant</label>
            <select
              className="yoy-select"
              value={yoyPollutant}
              onChange={e => handlePollutantChange(e.target.value)}
            >
              {trends.map(t => (
                <option key={t.pollutant} value={t.pollutant}>{t.pollutant}</option>
              ))}
            </select>
          </div>

          <div className="yoy-control-row">
            <label className="yoy-label">Years (max {MAX_YOY_YEARS})</label>
            <div className="yoy-year-toggles">
              {(trends.find(t => t.pollutant === yoyPollutant)?.years ?? []).map(year => (
                <button
                  key={year}
                  className={`yoy-year-btn ${yoySelectedYears.includes(year) ? 'active' : ''}`}
                  style={yoySelectedYears.includes(year)
                    ? { backgroundColor: YOY_COLORS[yoySelectedYears.indexOf(year)], borderColor: YOY_COLORS[yoySelectedYears.indexOf(year)], color: '#fff' }
                    : {}}
                  onClick={() => toggleYear(year)}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>

        {yoyLoading && <div className="loading">Loading comparison...</div>}

        {!yoyLoading && yoyData && yoyData.seasons && (
          <Plot
            data={yoySelectedYears
              .filter(year => yoyData.data[String(year)])
              .map((year, idx) => ({
                x: yoyData.seasons,
                y: yoyData.seasons.map((s: string) => yoyData.data[String(year)]?.[s] ?? null),
                type: 'scatter' as const,
                mode: 'lines+markers' as const,
                name: String(year),
                line: { color: YOY_COLORS[idx % YOY_COLORS.length], width: 2 },
                marker: { size: 8, color: YOY_COLORS[idx % YOY_COLORS.length] },
                connectgaps: false,
              }))}
            layout={{
              height: 400,
              margin: { t: 20, b: 60, l: 70, r: 20 },
              xaxis: { title: 'Season', fixedrange: true },
              yaxis: {
                title: yoyPollutant.length > 30 ? yoyPollutant.substring(0, 30) + '…' : yoyPollutant,
                fixedrange: true,
              },
              legend: { orientation: 'h', y: -0.2 },
              dragmode: false,
            }}
            config={{ displayModeBar: false, doubleClick: false, scrollZoom: false }}
            style={{ width: '100%' }}
          />
        )}

        {!yoyLoading && !yoyData && yoySelectedYears.length > 0 && (
          <div className="no-data-message"><p>No data available for the selected combination.</p></div>
        )}
      </div>
    </div>
  );
};

