import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface CorrelationAnalysisProps {
  filters: FilterRequest;
}

interface Correlation {
  pollutant1: string;
  pollutant2: string;
  correlation: number;
  strength: string;
}

export const CorrelationAnalysis: React.FC<CorrelationAnalysisProps> = ({ filters }) => {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [correlationMatrix, setCorrelationMatrix] = useState<any>(null);
  const [pollutants, setPollutants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCorrelations = async () => {
      try {
        setLoading(true);
        const response = await apiService.getCorrelationAnalysis(filters);
        if (response.correlations) {
          setCorrelations(response.correlations);
          setCorrelationMatrix(response.correlation_matrix);
          setPollutants(response.pollutants || []);
        } else {
          setError(response.error || 'Failed to load correlation data');
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Error loading correlation data. Please check your connection.';
        setError(errorMsg);
        console.error('Correlation loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCorrelations();
  }, [filters]);

  if (loading) return <div className="loading">Loading correlation analysis...</div>;
  if (error) return <div className="error-message-inline"><p>{error}</p></div>;
  if (correlations.length === 0) {
    return (
      <div className="no-data-message">
        <p>No correlation data available for selected filters.</p>
        <p>Need at least 2 pollutants with overlapping time periods.</p>
      </div>
    );
  }

  // Prepare matrix data for heatmap
  // Note: matrixData[i][j] represents correlation between pollutants[i] and pollutants[j]
  const matrixData = pollutants.map((p1, i) =>
    pollutants.map((p2, j) => {
      if (i === j) return 1.0; // Diagonal is always 1.0 (self-correlation)
      const corr = correlations.find(c => 
        (c.pollutant1 === p1 && c.pollutant2 === p2) ||
        (c.pollutant1 === p2 && c.pollutant2 === p1)
      );
      // Ensure we return the actual correlation value, clamped to [-1, 1] range
      if (corr) {
        const val = Number(corr.correlation);
        // Clamp to valid correlation range
        return Math.max(-1, Math.min(1, val));
      }
      return 0; // No correlation found = 0
    })
  );

  // Create truncated labels for display
  const truncateLabel = (label: string, maxLength: number) => {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
  };

  // X-axis labels (horizontal, can be longer)
  const xLabels = pollutants.map(p => truncateLabel(p, 25));
  
  // Y-axis labels (vertical, allow longer labels to fill space)
  const yLabels = pollutants.map(p => truncateLabel(p, 35));
  
  // Calculate dynamic left margin based on longest y-label
  // Use minimal margin, let labels fill the space
  const maxYLabelLength = Math.max(...yLabels.map(l => l.length));
  const leftMargin = Math.max(120, maxYLabelLength * 7 + 60);

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong': return '#ff6b6b';
      case 'moderate': return '#ffa94d';
      case 'weak': return '#74c0fc';
      default: return '#868e96';
    }
  };

  return (
    <div className="correlation-analysis">
      <h3>Correlation Analysis</h3>
      <p className="subtitle">Relationships between different pollutants</p>
      
      <div className="math-explanation">
        <details>
          <summary><strong>How Correlation Works</strong></summary>
          <div className="explanation-content">
            <p><strong>Pearson Correlation Coefficient (r):</strong></p>
            <ul>
              <li><strong>Range:</strong> -1.0 to +1.0</li>
              <li><strong>r = +1.0:</strong> Perfect positive correlation - when one pollutant increases, the other increases proportionally</li>
              <li><strong>r = -1.0:</strong> Perfect negative correlation - when one pollutant increases, the other decreases proportionally</li>
              <li><strong>r = 0:</strong> No linear relationship - pollutants vary independently</li>
              <li><strong>r &gt; 0.7:</strong> Strong positive correlation</li>
              <li><strong>0.4 &lt; r ≤ 0.7:</strong> Moderate correlation</li>
              <li><strong>r ≤ 0.4:</strong> Weak correlation</li>
            </ul>
            <p><strong>Formula:</strong> r = Σ[(xᵢ - x̄)(yᵢ - ȳ)] / √[Σ(xᵢ - x̄)² × Σ(yᵢ - ȳ)²]</p>
            <p><strong>Interpretation:</strong> Correlation measures how two pollutants move together over time. A high positive correlation suggests they may share common sources or be influenced by similar factors.</p>
            <p><em>Note: Correlation does not imply causation. Two pollutants may be correlated because they're both affected by the same underlying factor (e.g., traffic, weather).</em></p>
          </div>
        </details>
      </div>
      
      {correlationMatrix && pollutants.length > 0 && (
        <div className="correlation-heatmap">
          <h3>Correlation Matrix</h3>
          <p className="heatmap-note">
            <strong>Note:</strong> Labels on axes are truncated for display. Hover over any cell to see the full pollutant names and correlation value.
          </p>
          <div className="heatmap-container">
          <Plot
            data={[
              {
                z: matrixData,
                x: xLabels,
                y: yLabels,
                type: 'heatmap',
                // Custom colorscale with explicit mapping
                // Plotly linearly maps z values to colorscale positions:
                // position = (z - zmin) / (zmax - zmin)
                // For zmin=-1, zmax=1: -1→0, 0→0.5, 1→1.0
                // Add more stops to ensure smooth and correct mapping
                colorscale: [
                  [0, '#4dabf7'],      // Position 0.0 = Blue for value -1.0
                  [0.25, '#74c0fc'],   // Position 0.25 = Light blue for value -0.5
                  [0.5, '#ffffff'],    // Position 0.5 = White for value 0.0
                  [0.75, '#ffa94d'],   // Position 0.75 = Light red for value 0.5
                  [1, '#ff6b6b']       // Position 1.0 = Red for value 1.0
                ],
                zmin: -1,
                zmax: 1,
                zauto: false,  // Don't auto-scale, use explicit range
                text: matrixData.map((row, i) => 
                  row.map((val, j) => {
                    // Show value for debugging - can see actual numbers in cells
                    return val.toFixed(2);
                  })
                ),
                texttemplate: '%{text}',
                textfont: { size: 10 },
                // Create hover text with full names (no truncation)
                hovertext: pollutants.map((p1, i) => 
                  pollutants.map((p2, j) => 
                    `${pollutants[j]} vs ${pollutants[i]}<br>Correlation: ${matrixData[i][j].toFixed(3)}`
                  )
                ),
                hovertemplate: '%{hovertext}<extra></extra>',
                // Show full names in hover, truncated names on axes
              },
            ]}
            layout={{
              title: '',
              height: Math.max(500, pollutants.length * 50),
              margin: { 
                t: 30, 
                b: Math.max(150, pollutants.length * 8), 
                l: leftMargin,
                r: 30,
                pad: 5
              },
              xaxis: { 
                side: 'bottom', 
                tickangle: -45, 
                fixedrange: true,
                automargin: false,
                tickfont: { size: 9 },
                tickmode: 'array',
                tickvals: pollutants.map((_, i) => i),
                ticktext: xLabels
              },
              yaxis: { 
                autorange: 'reversed', 
                fixedrange: true,
                automargin: true,
                tickfont: { size: 10 },
                tickmode: 'array',
                tickvals: pollutants.map((_, i) => i),
                ticktext: yLabels,
                title: {
                  standoff: 10
                },
                side: 'left'
              },
              dragmode: false,
            }}
            config={{ 
              displayModeBar: true,
              doubleClick: false,
              scrollZoom: false,
            }}
            style={{ width: '100%', minHeight: '500px' }}
          />
          </div>
        </div>
      )}
      
      <div className="correlation-list">
        <h3>Top Correlations</h3>
        <div className="correlations-grid">
          {correlations.slice(0, 20).map((corr, idx) => (
            <div key={idx} className="correlation-card" style={{ borderLeft: `4px solid ${getStrengthColor(corr.strength)}` }}>
              <div className="correlation-pair">
                <span className="pollutant1">{corr.pollutant1.length > 30 ? corr.pollutant1.substring(0, 30) + '...' : corr.pollutant1}</span>
                <span className="vs">vs</span>
                <span className="pollutant2">{corr.pollutant2.length > 30 ? corr.pollutant2.substring(0, 30) + '...' : corr.pollutant2}</span>
              </div>
              <div className="correlation-value">
                <span className="value">{corr.correlation.toFixed(3)}</span>
                <span className={`strength ${corr.strength}`}>{corr.strength}</span>
              </div>
              <div className="correlation-bar">
                <div 
                  className="bar-fill" 
                  style={{ 
                    width: `${Math.abs(corr.correlation) * 100}%`,
                    backgroundColor: getStrengthColor(corr.strength)
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

