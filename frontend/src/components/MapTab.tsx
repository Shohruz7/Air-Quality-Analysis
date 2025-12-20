import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FilterRequest } from '../services/api';
import { apiService } from '../services/api';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Component to fit map bounds to show all features (without changing zoom)
function FitBounds({ geojson, mapKey }: { geojson: any; mapKey: number }) {
  const map = useMap();
  
  useEffect(() => {
    if (geojson && geojson.features) {
      try {
        const bounds = L.geoJSON(geojson).getBounds();
        if (bounds.isValid()) {
          // Fit bounds to show all boroughs with padding, but keep zoom level fixed
          map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 10, // Match the fixed zoom level
          });
          // Immediately set zoom back to 10 to prevent any zoom changes
          setTimeout(() => {
            map.setZoom(10);
          }, 100);
        }
      } catch (err) {
        console.error('Error fitting bounds:', err);
      }
    }
  }, [geojson, map, mapKey]);
  
  return null;
}

interface MapTabProps {
  filters: FilterRequest;
}

export const MapTab: React.FC<MapTabProps> = ({ filters }) => {
  const [geojson, setGeojson] = useState<any>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [selectedPollutant, setSelectedPollutant] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0); // Force re-render


  // Load GeoJSON once on mount
  useEffect(() => {
    const loadGeoJSON = async () => {
      try {
        const geojsonData = await apiService.getGeoJSON();
        setGeojson(geojsonData);
      } catch (err: any) {
        setError(err.message || 'Error loading GeoJSON');
      }
    };
    loadGeoJSON();
  }, []);

  // Reload map data whenever filters change
  useEffect(() => {
    const loadMapData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use current filters - if pollutants is null/empty, backend will aggregate all
        const mapDataResponse = await apiService.getMapData(filters);
        
        if (mapDataResponse && mapDataResponse.data && mapDataResponse.data.length > 0) {
          setMapData(mapDataResponse);
          setSelectedPollutant(mapDataResponse.pollutant || 'All');
          setMapKey(prev => prev + 1); // Force re-render
          setError(null); // Clear any previous errors
        } else {
          const errorMsg = mapDataResponse?.message || 'No data available for map with current filters';
          setError(errorMsg);
          setMapData(null);
        }
      } catch (err: any) {
        console.error('Map loading error:', err);
        setError(err.message || 'Error loading map data. Please try resetting filters.');
        setMapData(null);
      } finally {
        setLoading(false);
      }
    };

    // Only load if we have geojson and filters are valid
    if (geojson && filters) {
      // Add a small delay to debounce rapid filter changes
      const timeoutId = setTimeout(() => {
        loadMapData();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [filters, geojson]);

  if (!geojson) {
    return (
      <div className="loading-message">
        <p>Loading map...</p>
      </div>
    );
  }

  if (loading && !mapData) {
    return (
      <div className="loading-message">
        <p>Loading map data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p><strong>Error:</strong> {error}</p>
        <p>Try clicking "Show Everything" to reset filters, or adjust your filter selections.</p>
      </div>
    );
  }

  if (!mapData || !mapData.data || !Array.isArray(mapData.data) || mapData.data.length === 0) {
    return (
      <div className="no-data-message">
        <p>No data available for map.</p>
        <p>Try clicking "Show Everything" to reset filters, or adjust your filter selections.</p>
      </div>
    );
  }

  const boroughData = mapData.data;
  const boroughNames = boroughData.map((d: any) => d.borough).filter((name: any) => name);
  const values = boroughData.map((d: any) => d.avg_value).filter((val: any) => val != null && !isNaN(val));

  if (boroughNames.length === 0 || values.length === 0 || boroughNames.length !== values.length) {
    return (
      <div className="no-data-message">
        <p>No valid data available for map visualization.</p>
        <p>Try clicking "Show Everything" to reset filters.</p>
      </div>
    );
  }

  // Ensure we have valid min/max values
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  if (isNaN(minVal) || isNaN(maxVal) || minVal === maxVal) {
    return (
      <div className="no-data-message">
        <p>Invalid data range for map visualization.</p>
        <p>Try clicking "Show Everything" to reset filters.</p>
      </div>
    );
  }

  // Create a color scale function
  const getColor = (value: number) => {
    const normalized = (value - minVal) / (maxVal - minVal);
    // Blue color scale
    const colors = [
      '#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', 
      '#4292c6', '#2171b5', '#08519c', '#08306b'
    ];
    const index = Math.min(Math.floor(normalized * colors.length), colors.length - 1);
    return colors[index];
  };

  // Create data map for quick lookup - normalize borough names
  const normalizeBoroughName = (name: string): string => {
    if (!name) return name;
    // Handle variations in borough names - case insensitive
    const nameLower = name.toLowerCase().trim();
    const nameMap: Record<string, string> = {
      'manhattan': 'Manhattan',
      'brooklyn': 'Brooklyn',
      'queens': 'Queens',
      'bronx': 'Bronx',
      'the bronx': 'Bronx',
      'staten island': 'Staten Island',
      'richmond': 'Staten Island', // Staten Island was historically Richmond County
    };
    return nameMap[nameLower] || name;
  };

  // Reverse lookup - normalize data borough names to match GeoJSON
  const normalizeDataBoroughName = (name: string): string => {
    return normalizeBoroughName(name);
  };

  const dataMap = new Map<string, number>();
  boroughData.forEach((d: any) => {
    const normalizedName = normalizeDataBoroughName(d.borough);
    // Store with normalized name (standard format)
    dataMap.set(normalizedName, d.avg_value);
    // Also store with original name variations
    dataMap.set(d.borough, d.avg_value);
    // Store lowercase versions too for case-insensitive matching
    dataMap.set(d.borough.toLowerCase(), d.avg_value);
    dataMap.set(normalizedName.toLowerCase(), d.avg_value);
  });

  // Debug info - show which boroughs have data
  const boroughsWithData = Array.from(dataMap.keys()).filter(key => 
    ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].includes(key)
  );
  const geojsonBoroughs = geojson?.features?.map((f: any) => f.properties.name) || [];

  // Style function for GeoJSON
  const styleFeature = (feature: any) => {
    const boroughName = feature.properties.name;
    // Try multiple matching strategies
    let value = dataMap.get(boroughName) || 
                dataMap.get(normalizeBoroughName(boroughName)) ||
                dataMap.get(boroughName.toLowerCase()) ||
                dataMap.get(normalizeBoroughName(boroughName).toLowerCase());
    
    return {
      fillColor: value != null ? getColor(value) : '#cccccc',
      weight: 2,
      opacity: 1,
      color: 'white',
      dashArray: '',
      fillOpacity: value != null ? 0.7 : 0.3,
    };
  };

  // Event handlers for GeoJSON
  const onEachFeature = (feature: any, layer: L.Layer) => {
    const boroughName = feature.properties.name;
    // Try multiple matching strategies
    let value = dataMap.get(boroughName) || 
                dataMap.get(normalizeBoroughName(boroughName)) ||
                dataMap.get(boroughName.toLowerCase()) ||
                dataMap.get(normalizeBoroughName(boroughName).toLowerCase());
    
    // Store original style for restoration
    const originalStyle = styleFeature(feature);
    
    // Create popup content
    const popupContent = value != null
      ? `<div style="padding: 8px; font-size: 14px;"><b style="font-size: 16px;">${boroughName}</b><br><br>Average ${selectedPollutant === 'All' ? 'All Pollutants' : selectedPollutant}:<br><span style="font-size: 18px; font-weight: bold; color: #667eea;">${value.toFixed(2)} ${mapData.unit}</span></div>`
      : `<div style="padding: 8px; font-size: 14px;"><b style="font-size: 16px;">${boroughName}</b><br><br>No data available</div>`;
    
    // Bind popup for click
    layer.bindPopup(popupContent, {
      closeButton: true,
      autoPan: true,
      className: 'borough-popup',
      maxWidth: 250,
    });
    
    // Create tooltip for hover (more reliable than popup on hover)
    const tooltipContent = value != null
      ? `<div style="font-weight: 600;">${boroughName}</div><div>${value.toFixed(2)} ${mapData.unit}</div>`
      : `<div style="font-weight: 600;">${boroughName}</div><div>No data</div>`;
    
    layer.bindTooltip(tooltipContent, {
      permanent: false,
      direction: 'top',
      offset: L.point(0, -15),
      opacity: 1,
      className: 'borough-tooltip',
      interactive: false,
      sticky: true,
    });
    
    // Mouseover event - highlight and show tooltip
    layer.on('mouseover', function(e: any) {
      const currentLayer = e.target;
      currentLayer.setStyle({
        weight: 4,
        color: '#333',
        dashArray: '',
        fillOpacity: 0.95,
      });
      // Bring to front
      currentLayer.bringToFront();
      // Open tooltip
      currentLayer.openTooltip();
    });
    
    // Mouseout event - restore style and hide tooltip
    layer.on('mouseout', function(e: any) {
      const currentLayer = e.target;
      currentLayer.setStyle(originalStyle);
      currentLayer.closeTooltip();
    });
    
    // Click event - show popup
    layer.on('click', function(e: any) {
      const currentLayer = e.target;
      currentLayer.openPopup();
    });
  };

  // Calculate statistics
  const highest = maxVal;
  const lowest = minVal;
  const average = values.reduce((a: number, b: number) => a + b, 0) / values.length;
  const range = highest - lowest;
  const highestBorough = boroughData.find((d: any) => d.avg_value === highest)?.borough || '';
  const lowestBorough = boroughData.find((d: any) => d.avg_value === lowest)?.borough || '';

  return (
    <div className="map-tab">
      <h2>Interactive Borough Map</h2>
      <p>Choropleth map showing air quality by borough</p>

      {loading && mapData && (
        <div style={{ textAlign: 'center', padding: '10px', color: '#666' }}>
          Updating map...
        </div>
      )}
      {loading && !mapData && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
          Loading map data...
        </div>
      )}
      <div className="map-container" id="map-container">
        {boroughNames.length > 0 && values.length > 0 && geojson && (
          <MapContainer
            key={mapKey}
            center={[40.7128, -74.0060]}
            zoom={10}
            minZoom={10}
            maxZoom={10}
            zoomControl={false}
            maxBounds={[
              [40.4, -74.5], // Southwest corner (keeps map in NYC area)
              [41.0, -73.5]  // Northeast corner
            ]}
            maxBoundsViscosity={1.0} // Keep map strictly within bounds - prevents panning outside NYC
            style={{ height: '100%', width: '100%', zIndex: 0 }}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            boxZoom={false}
            dragging={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds geojson={geojson} mapKey={mapKey} />
            <GeoJSON
              key={`geojson-${mapKey}`}
              data={geojson}
              style={styleFeature}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
        )}
      </div>
      
      {/* Debug info - only show in development */}
      {import.meta.env.DEV && (
        <div style={{ fontSize: '0.8em', color: '#666', marginTop: '10px' }}>
          <small>
            Data boroughs: {boroughNames.join(', ')} | 
            GeoJSON boroughs: {geojsonBoroughs.join(', ')} | 
            Boroughs with data: {boroughsWithData.join(', ')}
          </small>
        </div>
      )}
      
      {/* Color legend */}
      {boroughNames.length > 0 && values.length > 0 && (
        <div className="map-legend">
          <h4>Value Scale ({mapData.unit})</h4>
          <div className="legend-scale">
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: getColor(minVal) }}></div>
              <span>{minVal.toFixed(2)}</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: getColor((minVal + maxVal) / 2) }}></div>
              <span>{((minVal + maxVal) / 2).toFixed(2)}</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ backgroundColor: getColor(maxVal) }}></div>
              <span>{maxVal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="map-statistics">
        <h3>Map Statistics for {selectedPollutant === 'All' ? 'All Pollutants' : selectedPollutant}:</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Highest</div>
            <div className="stat-value">{highest.toFixed(2)} {mapData.unit}</div>
            <div className="stat-caption">{highestBorough}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Lowest</div>
            <div className="stat-value">{lowest.toFixed(2)} {mapData.unit}</div>
            <div className="stat-caption">{lowestBorough}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Average</div>
            <div className="stat-value">{average.toFixed(2)} {mapData.unit}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Range</div>
            <div className="stat-value">{range.toFixed(2)} {mapData.unit}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

