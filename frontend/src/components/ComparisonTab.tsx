import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { FilterRequest, Metadata } from '../services/api';
import { apiService } from '../services/api';

interface ComparisonTabProps {
  filters: FilterRequest;
  metadata: Metadata | null;
}

export const ComparisonTab: React.FC<ComparisonTabProps> = ({ filters, metadata }) => {
  const [comparisonType, setComparisonType] = useState<'boroughs' | 'pollutants'>('boroughs');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [singleFilter, setSingleFilter] = useState<string>('');
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Allow comparison if at least 2 items are selected
    // For boroughs comparison, singleFilter (pollutant) is optional
    // For pollutants comparison, singleFilter (borough) is optional
    if (selectedItems.length >= 2) {
      loadComparisonData();
    } else {
      setComparisonData(null);
    }
  }, [comparisonType, selectedItems, singleFilter, filters]);

  if (!metadata) return <div>Loading metadata...</div>;

  const availableBoroughs = metadata.boroughs;
  const availablePollutants = metadata.pollutants;

  const loadComparisonData = async () => {
    try {
      setLoading(true);
      setError(null);
      // If singleFilter is empty, use 'All' for pollutants comparison or first available for boroughs
      let effectiveFilter = singleFilter;
      if (!effectiveFilter) {
        if (comparisonType === 'pollutants') {
          effectiveFilter = 'All'; // Compare pollutants across all boroughs
        } else {
          // For boroughs comparison, we need a pollutant - use first available or from filters
          effectiveFilter = filters.pollutants && filters.pollutants.length > 0 
            ? filters.pollutants[0] 
            : availablePollutants[0] || '';
        }
      }
      
      if (!effectiveFilter && comparisonType === 'boroughs') {
        setError('Please select a pollutant to compare boroughs');
        return;
      }
      
      const data = await apiService.getComparisonData(
        filters,
        comparisonType,
        selectedItems,
        effectiveFilter
      );
      setComparisonData(data);
    } catch (err: any) {
      setError(err.message || 'Error loading comparison data');
    } finally {
      setLoading(false);
    }
  };

  const handleComparisonTypeChange = (type: 'boroughs' | 'pollutants') => {
    setComparisonType(type);
    setSelectedItems([]);
    setSingleFilter('');
    setComparisonData(null);
  };

  const renderVisualizations = () => {
    if (!comparisonData || !comparisonData.data || comparisonData.data.length === 0) {
      return (
        <div className="no-data-message">
          <p>No data available for comparison with the selected filters.</p>
          <p>Try adjusting your selections or clicking "Show Everything" in the filters.</p>
        </div>
      );
    }

    const { data, value_col, unit } = comparisonData;

    // Calculate statistics - ensure we process all selected items
    const stats: Record<string, any> = {};
    
    // First, initialize stats for all selected items (even if no data)
    selectedItems.forEach((item) => {
      if (!stats[item]) {
        stats[item] = {
          values: [],
          mean: 0,
          median: 0,
          std: 0,
          min: 0,
          max: 0,
          count: 0,
        };
      }
    });
    
    // Then, populate with actual data
    data.forEach((row: any) => {
      const key = comparisonType === 'boroughs' ? row.borough : row.pollutant;
      if (selectedItems.includes(key)) {
        if (!stats[key]) {
          stats[key] = {
            values: [],
            mean: 0,
            median: 0,
            std: 0,
            min: 0,
            max: 0,
            count: 0,
          };
        }
        if (row[value_col] != null && !isNaN(row[value_col])) {
          stats[key].values.push(row[value_col]);
        }
      }
    });

    // Calculate statistics for each item
    Object.keys(stats).forEach((key) => {
      const values = stats[key].values;
      if (values.length > 0) {
        stats[key].mean = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        const sortedValues = [...values].sort((a: number, b: number) => a - b);
        stats[key].median = sortedValues[Math.floor(sortedValues.length / 2)];
        stats[key].std = Math.sqrt(
          values.reduce((sum: number, val: number) => sum + Math.pow(val - stats[key].mean, 2), 0) /
            values.length
        );
        stats[key].min = Math.min(...values);
        stats[key].max = Math.max(...values);
        stats[key].count = values.length;
      } else {
        // No data for this item
        stats[key].mean = 0;
        stats[key].median = 0;
        stats[key].std = 0;
        stats[key].min = 0;
        stats[key].max = 0;
        stats[key].count = 0;
      }
    });

    // Filter out items with no data for display, but keep at least showing selected items
    const itemsWithData = Object.keys(stats).filter(key => stats[key].count > 0);
    if (itemsWithData.length === 0) {
      return (
        <div className="no-data-message">
          <p>No data found for the selected {comparisonType === 'boroughs' ? 'boroughs' : 'pollutants'}.</p>
          <p>Try selecting different items or adjusting the filters.</p>
        </div>
      );
    }

    // Bar chart - only show items with data, but maintain order of selected items
    const barData = selectedItems
      .filter(key => stats[key] && stats[key].count > 0)
      .map((key) => ({
        name: key.length > 25 ? key.substring(0, 25) + '...' : key,
        value: stats[key].mean,
        fullName: key,
      }))
      .sort((a, b) => b.value - a.value); // Sort by value descending

    const barFig = {
      data: [
        {
          x: barData.map((d) => d.name),
          y: barData.map((d) => d.value),
          type: 'bar',
          marker: { 
            color: barData.map((_, i) => {
              const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#fa709a'];
              return colors[i % colors.length];
            }),
          },
          text: barData.map((d) => d.value.toFixed(2)),
          textposition: 'outside',
        },
      ],
      layout: {
        height: 400,
        xaxis: { 
          title: comparisonType === 'boroughs' ? 'Borough' : 'Pollutant',
          tickangle: -45,
        },
        yaxis: { title: `Average Value (${unit})` },
        title: `Average Values by ${comparisonType === 'boroughs' ? 'Borough' : 'Pollutant'}`,
        margin: { b: 100 },
      },
    };

    // Box plot - only show items with data
    const boxTraces = selectedItems
      .filter(key => stats[key] && stats[key].values.length > 0)
      .map((key) => ({
        y: stats[key].values,
        type: 'box',
        name: key.length > 25 ? key.substring(0, 25) + '...' : key,
      }));

    const boxFig = {
      data: boxTraces,
      layout: {
        height: 400,
        xaxis: { 
          title: comparisonType === 'boroughs' ? 'Borough' : 'Pollutant',
          tickangle: -45,
        },
        yaxis: { title: `Value (${unit})` },
        title: `Distribution Comparison`,
        margin: { b: 100 },
        showlegend: false,
      },
    };

    // Time series if date/year available
    let tsFig = null;
    if (data[0] && (data[0].date || data[0].year)) {
      const timeKey = data[0].date ? 'date' : 'year';
      const timeValues = [...new Set(data.map((d: any) => d[timeKey]))].sort();
      const groupKey = comparisonType === 'boroughs' ? 'borough' : 'pollutant';

      const tsTraces = selectedItems.map((item) => {
        const itemData = data.filter((d: any) => d[groupKey] === item);
        return {
          x: timeValues,
          y: timeValues.map((t) => {
            const point = itemData.find((d: any) => d[timeKey] === t);
            return point ? point[value_col] : null;
          }),
          type: 'scatter',
          mode: 'lines+markers',
          name: item.length > 20 ? item.substring(0, 20) + '...' : item,
        };
      });

      tsFig = {
        data: tsTraces,
        layout: {
          height: 400,
          xaxis: { title: 'Time Period' },
          yaxis: { title: `Value (${unit})` },
          title: `Over Time Comparison`,
        },
      };
    }

    return (
      <div className="comparison-visualizations">
        <div className="comparison-metrics">
          <h3>Comparison Metrics</h3>
          <div className="metrics-grid">
            {selectedItems.map((key) => {
              const stat = stats[key];
              if (!stat || stat.count === 0) {
                return (
                  <div key={key} className="metric-card no-data-card">
                    <div className="metric-label">{key.length > 30 ? key.substring(0, 30) + '...' : key}</div>
                    <div className="metric-value">No data</div>
                    <div className="metric-count">n=0</div>
                  </div>
                );
              }
              return (
                <div key={key} className="metric-card">
                  <div className="metric-label">{key.length > 30 ? key.substring(0, 30) + '...' : key}</div>
                  <div className="metric-value">
                    {stat.mean.toFixed(2)} {unit}
                  </div>
                  <div className="metric-std">±{stat.std.toFixed(2)}</div>
                  <div className="metric-count">n={stat.count.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="comparison-charts">
          {barData.length > 0 && (
            <div>
              <h4>Bar Chart Comparison</h4>
              <Plot data={barFig.data} layout={barFig.layout} style={{ width: '100%' }} />
            </div>
          )}
          {tsFig && tsFig.data.length > 0 && (
            <div>
              <h4>Time Series Comparison</h4>
              <Plot data={tsFig.data} layout={tsFig.layout} style={{ width: '100%' }} />
            </div>
          )}
          {boxTraces.length > 0 && (
            <div>
              <h4>Distribution Comparison</h4>
              <Plot data={boxFig.data} layout={boxFig.layout} style={{ width: '100%' }} />
            </div>
          )}
          {barData.length === 0 && boxTraces.length === 0 && (
            <div className="no-data-message">
              <p>No data available to display in charts for the selected items.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="comparison-tab">
      <h2>Comparison Tool</h2>
      <p>Compare boroughs or pollutants side-by-side</p>

      <div className="comparison-controls">
        <div className="comparison-type">
          <label>
            <input
              type="radio"
              value="boroughs"
              checked={comparisonType === 'boroughs'}
              onChange={() => handleComparisonTypeChange('boroughs')}
            />
            Boroughs
          </label>
          <label>
            <input
              type="radio"
              value="pollutants"
              checked={comparisonType === 'pollutants'}
              onChange={() => handleComparisonTypeChange('pollutants')}
            />
            Pollutants
          </label>
        </div>

        <div className="comparison-selectors">
          <div className="selector-group checkbox-group">
            <label>
              Select {comparisonType === 'boroughs' ? 'Boroughs' : 'Pollutants'} to Compare (select at least 2):
            </label>
            <div className="checkbox-container">
              <div className="checkbox-controls">
                <button
                  type="button"
                  className="select-all-btn"
                  onClick={() => {
                    const items = comparisonType === 'boroughs' ? availableBoroughs : availablePollutants;
                    setSelectedItems([...items]);
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="deselect-all-btn"
                  onClick={() => setSelectedItems([])}
                >
                  Deselect All
                </button>
              </div>
              <div className="checkbox-list">
                {(comparisonType === 'boroughs' ? availableBoroughs : availablePollutants).map((item) => {
                  const isSelected = selectedItems.includes(item);
                  return (
                    <label key={item} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems([...selectedItems, item]);
                          } else {
                            setSelectedItems(selectedItems.filter(i => i !== item));
                          }
                        }}
                      />
                      <span>{item}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <small>Click checkboxes to select. You need at least 2 items selected to compare.</small>
          </div>

          <div className="selector-group">
            <label>
              {comparisonType === 'boroughs' ? 'Pollutant (optional):' : 'Borough (optional):'}
            </label>
            <select
              value={singleFilter}
              onChange={(e) => setSingleFilter(e.target.value)}
            >
              <option value="">
                {comparisonType === 'boroughs' ? '-- Use filter selection --' : '-- All Boroughs --'}
              </option>
              {comparisonType === 'boroughs' ? (
                availablePollutants.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              ) : (
                <>
                  <option value="All">All Boroughs</option>
                  {availableBoroughs.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </>
              )}
            </select>
            <small>
              {comparisonType === 'boroughs' 
                ? 'Optional: Filter by specific pollutant. If empty, uses main filter selection.'
                : 'Optional: Filter by specific borough. If empty, compares across all boroughs.'}
            </small>
          </div>
        </div>
      </div>

      {selectedItems.length < 2 && (
        <div className="comparison-prompt">
          <p>Please select at least 2 {comparisonType === 'boroughs' ? 'boroughs' : 'pollutants'} to compare.</p>
        </div>
      )}
      {loading && (
        <div className="loading-message">
          <p>Loading comparison data...</p>
        </div>
      )}
      {error && (
        <div className="error-message">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}
      {!loading && !error && selectedItems.length >= 2 && renderVisualizations()}
    </div>
  );
};

