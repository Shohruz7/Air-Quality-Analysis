import React, { useEffect, useState } from 'react';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

interface AQIComponentProps {
  filters: FilterRequest;
}

interface AQIData {
  aqi: number | null;
  category: string;
  color: string;
  value?: number;
  pollutant: string;
  avg_value?: number;
  unit?: string;
  message?: string;
}

export const AQIComponent: React.FC<AQIComponentProps> = ({ filters }) => {
  const [aqiData, setAqiData] = useState<AQIData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAQI = async () => {
      try {
        setLoading(true);
        const response = await apiService.getAQI(filters);
        if (response.aqi_data) {
          setAqiData(response.aqi_data);
        } else {
          setError(response.error || 'Failed to load AQI data');
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Error loading AQI data. Please check your connection.';
        setError(errorMsg);
        console.error('AQI loading error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAQI();
  }, [filters]);

  if (loading) return <div className="loading">Loading AQI data...</div>;
  if (error) return <div className="error-message-inline"><p>{error}</p></div>;
  if (aqiData.length === 0) {
    return (
      <div className="no-data-message">
        <p>No AQI data available for selected filters.</p>
      </div>
    );
  }

  const getHealthRecommendations = (category: string) => {
    const recommendations: Record<string, string> = {
      'Good': 'Air quality is satisfactory. Enjoy your usual outdoor activities.',
      'Moderate': 'Air quality is acceptable. Sensitive individuals may experience minor breathing discomfort.',
      'Unhealthy for Sensitive Groups': 'Sensitive groups should reduce prolonged outdoor exertion.',
      'Unhealthy': 'Everyone should reduce outdoor activities. Sensitive groups should avoid outdoor activities.',
      'Very Unhealthy': 'Health alert: Everyone should avoid outdoor activities.',
      'Hazardous': 'Health warning: Everyone should stay indoors and keep activity levels low.',
    };
    return recommendations[category] || 'No specific recommendations available.';
  };

  return (
    <div className="aqi-component">
      <h3>Air Quality Index (AQI) & Health Alerts</h3>
      <p className="subtitle">Current air quality levels and health recommendations</p>
      
      <div className="aqi-grid">
        {aqiData
          .filter(item => item.aqi !== null) // Only show items with valid AQI
          .map((item, idx) => (
            <div key={idx} className="aqi-card" style={{ borderLeft: `5px solid ${item.color}` }}>
              <div className="aqi-header">
                <h3>{item.pollutant}</h3>
                <div className="aqi-value" style={{ color: item.color }}>
                  {item.aqi}
                </div>
              </div>
              
              <div className="aqi-category" style={{ color: item.color }}>
                {item.category}
              </div>
              
              {item.avg_value !== undefined && (
                <div className="aqi-details">
                  <span>Average Value: {item.avg_value.toFixed(2)} {item.unit || ''}</span>
                </div>
              )}
              
              <div className="aqi-recommendation">
                <strong>Recommendation:</strong> {getHealthRecommendations(item.category)}
              </div>
            </div>
          ))}
      </div>
      
      <div className="aqi-legend">
        <h4>AQI Scale</h4>
        <div className="legend-items">
          <div className="legend-item"><span style={{ color: '#00e400' }}>0-50</span> Good</div>
          <div className="legend-item"><span style={{ color: '#ffff00' }}>51-100</span> Moderate</div>
          <div className="legend-item"><span style={{ color: '#ff7e00' }}>101-150</span> Unhealthy for Sensitive Groups</div>
          <div className="legend-item"><span style={{ color: '#ff0000' }}>151-200</span> Unhealthy</div>
          <div className="legend-item"><span style={{ color: '#8f3f97' }}>201-300</span> Very Unhealthy</div>
          <div className="legend-item"><span style={{ color: '#7e0023' }}>301-500</span> Hazardous</div>
        </div>
      </div>
    </div>
  );
};

