import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface FilterRequest {
  date_range?: [string, string] | null;
  pollutants?: string[] | null;
  boroughs?: string[] | null;
  exclude_outliers?: boolean;
  agg_level?: string;
}

export interface Metadata {
  total_records: number;
  date_range: {
    min: string | null;
    max: string | null;
  };
  pollutants: string[];
  boroughs: string[];
}

export const apiService = {
  getMetadata: async (): Promise<Metadata> => {
    const response = await api.get('/api/data/metadata');
    return response.data;
  },

  getFilteredData: async (filters: FilterRequest) => {
    const response = await api.post('/api/data/filtered', filters);
    return response.data;
  },

  getKPIs: async (filters: FilterRequest) => {
    const response = await api.post('/api/data/kpis', filters);
    return response.data;
  },

  getGeoJSON: async () => {
    const response = await api.get('/api/map/geojson');
    return response.data;
  },

  getMapData: async (filters: FilterRequest) => {
    const response = await api.post('/api/map/data', filters);
    return response.data;
  },

  getHeatmapData: async (filters: FilterRequest) => {
    const response = await api.post('/api/heatmap/data', filters);
    return response.data;
  },

  getTimeseriesData: async (filters: FilterRequest) => {
    const response = await api.post('/api/timeseries/data', filters);
    return response.data;
  },

  getComparisonData: async (
    filters: FilterRequest,
    comparisonType: string,
    selectedItems: string[],
    singleFilter?: string
  ) => {
    const response = await api.post('/api/comparison/data', {
      filters,
      comparison_type: comparisonType,
      selected_items: selectedItems,
      single_filter: singleFilter || null,
    });
    return response.data;
  },
};

