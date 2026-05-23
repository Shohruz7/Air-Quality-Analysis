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
    let mounted = true;
    const loadCorrelations = async () => {
      try {
        setLoading(true);
        const response = await apiService.getCorrelationAnalysis(filters);
        if (!mounted) return;
        if (response.correlations) {
          setCorrelations(response.correlations);
          setCorrelationMatrix(response.correlation_matrix);
          setPollutants(response.pollutants || []);
        } else {
          setError(response.error || 'Failed to load correlation data');
        }
      } catch (err: any) {
        if (mounted) {
          const errorMsg = err.response?.data?.error || err.message || 'Error loading correlation data. Please check your connection.';
          setError(errorMsg);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadCorrelations();
    return () => { mounted = false; };
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

  const truncateLabel = (label: string, maxLength: number) => {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength - 3) + '...';
  };

  const xLabels = pollutants.map(p => truncateLabel(p, 25));
  const yLabels = pollutants.map(p => truncateLabel(p, 35));
  const positions = pollutants.map((_, i) => i);
  const maxYLabelLength = Math.max(...yLabels.map(l => l.length));
  const leftMargin = Math.max(120, maxYLabelLength * 7 + 60);

  // Build matrix directly from correlationMatrix dict (pandas to_dict() is column-oriented:
  // correlationMatrix[col][row] = value). Diagonal set to null — self-correlations are
  // always 1.0 and redundant; null renders as a blank cell in Plotly.
  const matrixData = pollutants.map(p1 =>
    pollutants.map(p2 => {
      if (p1 === p2) return null;
      const val = correlationMatrix?.[p1]?.[p2];
      if (val === undefined || val === null || isNaN(Number(val))) return null;
      return Math.max(-1, Math.min(1, Number(val)));
    })
  );

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
                // Use numeric positions for x/y so tickvals/ticktext map unambiguously.
                // matrixData[i][j] = corr(pollutants[i], pollutants[j]),
                // rendered at (x=j, y=i) → color and annotation share the same index.
                z: matrixData,
                x: positions,
                y: positions,
                type: 'heatmap',
                colorscale: [
                  [0,    '#2166ac'],  // -1.0 → dark blue
                  [0.25, '#92c5de'],  // -0.5 → light blue
                  [0.5,  '#f7f7f7'],  //  0.0 → white
                  [0.75, '#f4a582'],  // +0.5 → light red
                  [1,    '#b2182b'],  // +1.0 → dark red
                ],
                zmin: -1,
                zmax: 1,
                zauto: false,
                text: matrixData.map(row => row.map(v => v === null ? '' : v.toFixed(2))),
                texttemplate: '%{text}',
                textfont: { size: 10 },
                hovertext: pollutants.map((p1, i) =>
                  pollutants.map((p2, j) => {
                    const v = matrixData[i][j];
                    return v === null ? `${p1}` : `${p1} vs ${p2}<br>Correlation: ${v.toFixed(3)}`;
                  })
                ),
                hovertemplate: '%{hovertext}<extra></extra>',
              },
            ]}
            layout={{
              height: Math.max(500, pollutants.length * 50),
              margin: { t: 30, b: Math.max(150, pollutants.length * 8), l: leftMargin, r: 30 },
              xaxis: {
                tickmode: 'array',
                tickvals: positions,
                ticktext: xLabels,
                tickangle: -45,
                tickfont: { size: 9 },
                fixedrange: true,
                automargin: false,
              },
              yaxis: {
                tickmode: 'array',
                tickvals: positions,
                ticktext: yLabels,
                autorange: 'reversed',
                tickfont: { size: 10 },
                fixedrange: true,
                automargin: true,
              },
              dragmode: false,
            }}
            config={{ displayModeBar: true, doubleClick: false, scrollZoom: false }}
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

