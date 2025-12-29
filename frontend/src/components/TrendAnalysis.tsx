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

export const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ filters }) => {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTrends = async () => {
      try {
        setLoading(true);
        const response = await apiService.getTrendAnalysis(filters);
        if (response.trends) {
          setTrends(response.trends);
        } else {
          setError(response.error || 'Failed to load trend data');
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Error loading trend data. Please check your connection.';
        setError(errorMsg);
        console.error('Trend loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTrends();
  }, [filters]);

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
          const trendLine = trend.years.map(year => {
            const yearIndex = trend.years.indexOf(year);
            return trend.values[0] + trend.slope * (year - trend.years[0]);
          });

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
    </div>
  );
};

