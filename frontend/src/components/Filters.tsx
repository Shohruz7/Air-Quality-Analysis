import React from 'react';
import { FilterRequest, Metadata } from '../services/api';

interface FiltersProps {
  metadata: Metadata | null;
  filters: FilterRequest;
  onFiltersChange: (filters: FilterRequest) => void;
}

export const Filters: React.FC<FiltersProps> = ({ metadata, filters, onFiltersChange }) => {
  if (!metadata) return <div>Loading metadata...</div>;

  const handleDateRangeChange = (start: string, end: string) => {
    onFiltersChange({
      ...filters,
      date_range: [start, end],
    });
  };

  const handlePollutantsChange = (pollutants: string[]) => {
    onFiltersChange({
      ...filters,
      pollutants: pollutants.length > 0 ? pollutants : null,
    });
  };

  const handleBoroughsChange = (boroughs: string[]) => {
    onFiltersChange({
      ...filters,
      boroughs: boroughs.length > 0 ? boroughs : null,
    });
  };

  const handleAggLevelChange = (aggLevel: string) => {
    onFiltersChange({
      ...filters,
      agg_level: aggLevel,
    });
  };

  const handleExcludeOutliersChange = (exclude: boolean) => {
    onFiltersChange({
      ...filters,
      exclude_outliers: exclude,
    });
  };

  // Get short names for pollutants
  const getShortPollutantName = (pollutant: string): string => {
    const shortNames: Record<string, string> = {
      'PM2.5': 'PM2.5',
      'NO2': 'NO2',
      'O3': 'O3',
      'Annual vehicle miles traveled': 'Vehicle Miles',
      'Annual vehicle miles traveled (cars)': 'Car Miles',
      'Annual vehicle miles traveled (trucks)': 'Truck Miles',
      'Asthma emergency department visits due to PM2.5': 'Asthma ED (PM2.5)',
      'Asthma emergency departments visits due to Ozone': 'Asthma ED (O3)',
      'Asthma hospitalizations due to Ozone': 'Asthma Hosp (O3)',
      'Boiler Emissions- Total NOx Emissions': 'Boiler NOx',
      'Boiler Emissions- Total PM2.5 Emissions': 'Boiler PM2.5',
      'Boiler Emissions- Total SO2 Emissions': 'Boiler SO2',
      'Cardiac and respiratory deaths due to Ozone': 'Deaths (O3)',
      'Cardiovascular hospitalizations due to PM2.5 (age 40+)': 'Cardio Hosp (PM2.5)',
      'Deaths due to PM2.5': 'Deaths (PM2.5)',
      'Outdoor Air Toxics - Benzene': 'Benzene',
      'Outdoor Air Toxics - Formaldehyde': 'Formaldehyde',
      'Respiratory hospitalizations due to PM2.5 (age 20+)': 'Resp Hosp (PM2.5)',
    };
    return shortNames[pollutant] || (pollutant.length > 30 ? pollutant.substring(0, 30) : pollutant);
  };

  const pollutantOptions = metadata.pollutants.reduce((acc, p) => {
    acc[getShortPollutantName(p)] = p;
    return acc;
  }, {} as Record<string, string>);

  const minDate = metadata.date_range.min || '';
  const maxDate = metadata.date_range.max || '';

  const handleResetFilters = () => {
    onFiltersChange({
      date_range: [minDate, maxDate],
      pollutants: null,
      boroughs: null,
      exclude_outliers: true,
      agg_level: 'Season',
    });
  };

  const hasActiveFilters = 
    (filters.pollutants && filters.pollutants.length > 0) ||
    (filters.boroughs && filters.boroughs.length > 0) ||
    (filters.date_range && (filters.date_range[0] !== minDate || filters.date_range[1] !== maxDate));

  return (
    <div className="filters">
      <div className="filters-header">
        <h2>Filters</h2>
        <button 
          className="reset-filters-btn"
          onClick={handleResetFilters}
          title="Reset all filters to show everything"
        >
          🔄 Show Everything
        </button>
      </div>
      {hasActiveFilters && (
        <div className="active-filters-indicator">
          <small>Filters active - showing filtered data. Click "Show Everything" to reset.</small>
        </div>
      )}
      <div className="filters-row">
        <div className="filter-group date-range-group">
          <label>Date Range</label>
          <div className="date-inputs">
            <input
              type="date"
              value={filters.date_range?.[0] || minDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleDateRangeChange(e.target.value, filters.date_range?.[1] || maxDate)}
            />
            <span>to</span>
            <input
              type="date"
              value={filters.date_range?.[1] || maxDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleDateRangeChange(filters.date_range?.[0] || minDate, e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="filters-grid">
        <div className="filter-group checkbox-group">
          <label>Pollutants</label>
          <div className="checkbox-container">
            <div className="checkbox-controls">
              <button
                type="button"
                className="select-all-btn"
                onClick={() => {
                  const allPollutants = Object.values(pollutantOptions);
                  handlePollutantsChange(allPollutants);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="deselect-all-btn"
                onClick={() => handlePollutantsChange([])}
              >
                Deselect All
              </button>
            </div>
            <div className="checkbox-list">
              {Object.entries(pollutantOptions).map(([short, full]) => {
                const isSelected = filters.pollutants?.includes(full) || false;
                return (
                  <label key={full} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const current = filters.pollutants || [];
                        if (e.target.checked) {
                          handlePollutantsChange([...current, full]);
                        } else {
                          handlePollutantsChange(current.filter(p => p !== full));
                        }
                      }}
                    />
                    <span>{short}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <small>Click checkboxes to select. Leave all unchecked to show all.</small>
        </div>

        <div className="filter-group checkbox-group">
          <label>Boroughs</label>
          <div className="checkbox-container">
            <div className="checkbox-controls">
              <button
                type="button"
                className="select-all-btn"
                onClick={() => {
                  handleBoroughsChange([...metadata.boroughs]);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="deselect-all-btn"
                onClick={() => handleBoroughsChange([])}
              >
                Deselect All
              </button>
            </div>
            <div className="checkbox-list">
              {metadata.boroughs.map((borough) => {
                const isSelected = filters.boroughs?.includes(borough) || false;
                return (
                  <label key={borough} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const current = filters.boroughs || [];
                        if (e.target.checked) {
                          handleBoroughsChange([...current, borough]);
                        } else {
                          handleBoroughsChange(current.filter(b => b !== borough));
                        }
                      }}
                    />
                    <span>{borough}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <small>Click checkboxes to select. Leave all unchecked to show all.</small>
        </div>

        <div className="filter-group">
          <label>Aggregation Level</label>
          <select
            value={filters.agg_level || 'Season'}
            onChange={(e) => handleAggLevelChange(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="Raw">Raw</option>
            <option value="Month">Month</option>
            <option value="Season">Season</option>
            <option value="Year">Year</option>
          </select>
        </div>

        <div className="filter-group">
          <label>
            <input
              type="checkbox"
              checked={filters.exclude_outliers ?? true}
              onChange={(e) => handleExcludeOutliersChange(e.target.checked)}
            />
            Exclude Outliers
          </label>
        </div>
      </div>

      <div className="data-info">
        <small>
          Total records: {metadata.total_records.toLocaleString()} | Date range: {minDate} to {maxDate} | 
          Pollutants: {metadata.pollutants.join(', ')}
        </small>
      </div>
    </div>
  );
};

