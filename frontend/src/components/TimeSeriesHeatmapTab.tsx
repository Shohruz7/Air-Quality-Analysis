import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface TimeSeriesHeatmapTabProps {
  filters: FilterRequest;
}

export const TimeSeriesHeatmapTab: React.FC<TimeSeriesHeatmapTabProps> = ({ filters }) => {
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [timeseriesData, setTimeseriesData] = useState<any>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [heatmapResponse, timeseriesResponse, filteredResponse] = await Promise.all([
          apiService.getHeatmapData(filters),
          apiService.getTimeseriesData(filters),
          apiService.getFilteredData(filters),
        ]);

        setHeatmapData(heatmapResponse);
        setTimeseriesData(timeseriesResponse);
        setTableData(filteredResponse.data || []);
      } catch (err: any) {
        setError(err.message || 'Error loading data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filters]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  // Heatmap visualization
  const renderHeatmap = () => {
    if (!heatmapData || !heatmapData.data) return <div>No heatmap data available</div>;

    const { data, boroughs, pollutants, unit } = heatmapData;
    const z: (number | null)[][] = [];
    const text: string[][] = [];

    // Ensure boroughs are in the correct order
    const orderedBoroughs = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].filter(b => boroughs.includes(b));
    
    orderedBoroughs.forEach((borough: string) => {
      const row: (number | null)[] = [];
      const textRow: string[] = [];
      pollutants.forEach((pollutant: string) => {
        const value = data[borough]?.[pollutant] ?? null;
        row.push(value);
        textRow.push(value !== null ? value.toFixed(2) : '');
      });
      z.push(row);
      text.push(textRow);
    });

    const allValues = z.flat().filter((v) => v !== null) as number[];
    if (allValues.length === 0) return <div>No data available for heatmap</div>;

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const binSize = 25;
    const minBin = Math.floor(minVal / binSize) * binSize;
    const maxBin = (Math.floor(maxVal / binSize) + 1) * binSize;

    // Create discrete colorscale
    const orangeColors = [
      '#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c',
      '#f16913', '#d94801', '#a63603', '#7f2704'
    ];
    const numSteps = Math.max(1, Math.floor((maxBin - minBin) / binSize) + 1);
    const colorscale: any[] = [];
    for (let i = 0; i < numSteps; i++) {
      const pos = numSteps > 1 ? i / (numSteps - 1) : 0;
      const colorIdx = Math.min(i, orangeColors.length - 1);
      colorscale.push([pos, orangeColors[colorIdx]]);
    }

    const heatmapFig = {
      data: [
        {
          type: 'heatmap',
          z: z,
          x: pollutants,
          y: orderedBoroughs,
          colorscale: colorscale,
          zmin: minBin,
          zmax: maxBin,
          text: text,
          texttemplate: '%{text}',
          textfont: { size: 10, color: '#000' },
          hovertemplate: '<b>%{y}</b><br>%{x}<br>Value: %{z:.2f} ' + unit + '<extra></extra>',
          colorbar: {
            title: {
              text: `Value (${unit})`,
              font: { size: 12 },
            },
            tickmode: 'linear',
            tick0: minBin,
            dtick: binSize,
            tickformat: '.0f',
          },
        },
      ],
      layout: {
        height: 500,
        xaxis: { 
          title: 'Pollutant', 
          side: 'bottom', 
          tickangle: -45,
          automargin: true,
        },
        yaxis: { title: 'Borough' },
        margin: { b: 150, l: 80, r: 20, t: 20 },
      },
    };

    return <Plot data={heatmapFig.data} layout={heatmapFig.layout} style={{ width: '100%' }} config={{ displayModeBar: false }} />;
  };

  // Time series visualization
  const renderTimeSeries = () => {
    if (!timeseriesData || !timeseriesData.data) return <div>No time series data available</div>;

    const { data, x_col, value_col, unit } = timeseriesData;

    // Group by pollutant_short for different lines
    const pollutants = [...new Set(data.map((d: any) => d.pollutant_short))];
    const traces = pollutants.map((pollutant: string) => {
      const pollutantData = data.filter((d: any) => d.pollutant_short === pollutant);
      return {
        x: pollutantData.map((d: any) => d[x_col]),
        y: pollutantData.map((d: any) => d[value_col]),
        type: 'scatter',
        mode: 'lines+markers',
        name: pollutant,
      };
    });

    const tsFig = {
      data: traces,
      layout: {
        height: 400,
        xaxis: { title: 'Time Period' },
        yaxis: { title: `Value (${unit})` },
        hovermode: 'closest',
      },
    };

    return <Plot data={tsFig.data} layout={tsFig.layout} style={{ width: '100%' }} />;
  };

  const downloadCSV = () => {
    if (tableData.length === 0) return;

    const headers = Object.keys(tableData[0]);
    const csv = [
      headers.join(','),
      ...tableData.map((row) =>
        headers.map((header) => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        }).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `air_quality_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="timeseries-heatmap-tab">
      <div className="heatmap-section">
        <h2>Heatmap: Borough by Pollutant</h2>
        <p>Average values across boroughs and pollutants</p>
        {renderHeatmap()}
      </div>

      <div className="timeseries-section">
        <h2>Time Series</h2>
        <p>Trends over time (aggregated by {filters.agg_level?.toLowerCase() || 'season'})</p>
        {renderTimeSeries()}
      </div>

      <div className="data-table-section">
        <h2>Data Table</h2>
        <p>Filtered and aggregated data</p>
        <div className="table-controls">
          <button onClick={downloadCSV}>Download CSV</button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              {tableData.length > 0 && (
                <tr>
                  {Object.keys(tableData[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {tableData.slice(0, 1000).map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((value: any, colIdx) => (
                    <td key={colIdx}>{String(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tableData.length > 1000 && (
          <small>Showing first 1,000 of {tableData.length.toLocaleString()} records</small>
        )}
      </div>
    </div>
  );
};

