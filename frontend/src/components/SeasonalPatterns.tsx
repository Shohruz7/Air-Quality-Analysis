import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface SeasonalPatternsProps {
  filters: FilterRequest;
}

interface SeasonalData {
  pollutant: string;
  seasons: Array<{
    season: string;
    avg_value: number;
    std_value: number;
    count: number;
  }>;
  worst_season: string;
  best_season: string;
  unit: string;
}

export const SeasonalPatterns: React.FC<SeasonalPatternsProps> = ({ filters }) => {
  const [seasonalData, setSeasonalData] = useState<SeasonalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSeasonalData = async () => {
      try {
        setLoading(true);
        const response = await apiService.getSeasonalPatterns(filters);
        if (response.seasonal_patterns) {
          setSeasonalData(response.seasonal_patterns);
        } else {
          setError(response.error || 'Failed to load seasonal data');
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Error loading seasonal data. Please check your connection.';
        setError(errorMsg);
        console.error('Seasonal loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSeasonalData();
  }, [filters]);

  if (loading) return <div className="loading">Loading seasonal patterns...</div>;
  if (error) return <div className="error-message-inline"><p>{error}</p></div>;
  if (seasonalData.length === 0) {
    return (
      <div className="no-data-message">
        <p>No seasonal data available for selected filters.</p>
      </div>
    );
  }

  const seasonOrder = ['Winter', 'Spring', 'Summer', 'Fall', 'Annual'];

  return (
    <div className="seasonal-patterns">
      <h3>Seasonal Patterns</h3>
      <p className="subtitle">Air quality variations across seasons</p>
      
      <div className="seasonal-grid">
        {seasonalData.map((data, idx) => {
          const sortedSeasons = [...data.seasons].sort((a, b) => {
            return seasonOrder.indexOf(a.season) - seasonOrder.indexOf(b.season);
          });

          return (
            <div key={idx} className="seasonal-card">
              <div className="seasonal-header">
                <h3>{data.pollutant}</h3>
                <div className="seasonal-summary">
                  <div className="summary-item worst">
                    <span className="label">Worst:</span>
                    <span className="value">{data.worst_season}</span>
                  </div>
                  <div className="summary-item best">
                    <span className="label">Best:</span>
                    <span className="value">{data.best_season}</span>
                  </div>
                </div>
              </div>
              
              <div className="seasonal-chart">
                <Plot
                  data={[
                    {
                      x: sortedSeasons.map(s => s.season),
                      y: sortedSeasons.map(s => s.avg_value),
                      type: 'bar',
                      name: 'Average',
                      marker: {
                        color: sortedSeasons.map(s => 
                          s.season === data.worst_season ? '#ff6b6b' :
                          s.season === data.best_season ? '#51cf66' : '#667eea'
                        ),
                      },
                      error_y: {
                        type: 'data',
                        array: sortedSeasons.map(s => s.std_value || 0),
                        visible: true,
                      },
                    },
                  ]}
                  layout={{
                    title: '',
                    xaxis: { title: 'Season', fixedrange: true },
                    yaxis: { title: `Value (${data.unit})`, fixedrange: true },
                    height: 300,
                    margin: { t: 10, b: 50, l: 60, r: 20 },
                    showlegend: false,
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
              
              <div className="seasonal-table">
                <table>
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Average</th>
                      <th>Std Dev</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSeasons.map((season, sIdx) => (
                      <tr key={sIdx} className={season.season === data.worst_season ? 'worst-row' : season.season === data.best_season ? 'best-row' : ''}>
                        <td>{season.season}</td>
                        <td>{season.avg_value.toFixed(2)}</td>
                        <td>{season.std_value.toFixed(2)}</td>
                        <td>{season.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

