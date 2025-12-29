import React, { useState } from 'react';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface ExportComponentProps {
  filters: FilterRequest;
}

export const ExportComponent: React.FC<ExportComponentProps> = ({ filters }) => {
  const [exporting, setExporting] = useState(false);

  const exportData = async (format: 'csv' | 'json') => {
    try {
      setExporting(true);
      const response = await apiService.exportData(filters);
      
      if (format === 'csv') {
        if (response.data && response.data.length > 0) {
          const headers = Object.keys(response.data[0]);
          const csv = [
            headers.join(','),
            ...response.data.map((row: any) =>
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
        }
      } else {
        const json = JSON.stringify(response.data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `air_quality_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportChartAsImage = (chartId: string, filename: string) => {
    const chartElement = document.getElementById(chartId);
    if (!chartElement) {
      alert('Chart not found');
      return;
    }

    // For Plotly charts, use the built-in export
    const plotlyElement = chartElement.querySelector('.js-plotly-plot');
    if (plotlyElement) {
      // Plotly charts can be exported using their API
      alert('Right-click on the chart and select "Download plot as png" to export.');
      return;
    }

    // For other charts, use html2canvas (would need to install)
    alert('Chart export functionality requires additional setup. Use browser screenshot for now.');
  };

  return (
    <div className="export-component">
      <h3>Export Data</h3>
      <div className="export-buttons">
        <button 
          onClick={() => exportData('csv')} 
          disabled={exporting}
          className="export-btn"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
        <button 
          onClick={() => exportData('json')} 
          disabled={exporting}
          className="export-btn"
        >
          {exporting ? 'Exporting...' : 'Export JSON'}
        </button>
      </div>
      <p className="export-note">
        Export filtered data in CSV or JSON format. For charts, right-click and select "Download plot as png".
      </p>
    </div>
  );
};

