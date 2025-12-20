"""
FastAPI backend for NYC Air Quality Dashboard
Serves data from parquet files to React frontend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pathlib import Path
import pandas as pd
import numpy as np
import json
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

app = FastAPI(title="NYC Air Quality API")

# CORS middleware to allow React frontend to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite and CRA default ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
PARQUET_PATH = DATA_PROCESSED / "measurements.parquet"
GEOJSON_PATH = PROJECT_ROOT / "new-york-city-boroughs.geojson"

# Cache for loaded data
_data_cache = None
_geojson_cache = None


def load_data():
    """Load processed parquet file with caching."""
    global _data_cache
    if _data_cache is not None:
        return _data_cache
    
    possible_paths = [
        PARQUET_PATH,
        Path("data/processed/measurements.parquet"),
        Path.cwd() / "data" / "processed" / "measurements.parquet",
    ]
    
    parquet_file = None
    for path in possible_paths:
        if path.exists():
            parquet_file = path
            break
    
    if parquet_file is None:
        raise FileNotFoundError(f"Data file not found. Tried: {possible_paths}")
    
    df = pd.read_parquet(parquet_file, engine='pyarrow')
    
    # Convert date column if needed
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
    
    _data_cache = df
    return df


def load_geojson():
    """Load GeoJSON file with caching."""
    global _geojson_cache
    if _geojson_cache is not None:
        return _geojson_cache
    
    possible_paths = [
        GEOJSON_PATH,
        Path("new-york-city-boroughs.geojson"),
        Path.cwd() / "new-york-city-boroughs.geojson",
    ]
    
    geojson_file = None
    for path in possible_paths:
        if path.exists():
            geojson_file = path
            break
    
    if geojson_file is None:
        return None
    
    with open(geojson_file, 'r') as f:
        _geojson_cache = json.load(f)
    
    return _geojson_cache


class FilterRequest(BaseModel):
    date_range: Optional[List[str]] = None
    pollutants: Optional[List[str]] = None
    boroughs: Optional[List[str]] = None
    exclude_outliers: bool = True
    agg_level: str = "Season"


def filter_data(df, date_range, pollutants, boroughs, exclude_outliers):
    """Apply filters to dataframe."""
    df_filtered = df.copy()
    
    # Date range filter
    if date_range and len(date_range) == 2:
        start_date, end_date = date_range
        df_filtered = df_filtered[
            (df_filtered['date'] >= pd.Timestamp(start_date)) &
            (df_filtered['date'] <= pd.Timestamp(end_date))
        ]
    
    # Pollutant filter - only apply if pollutants list is provided and not empty
    if pollutants and len(pollutants) > 0:
        df_filtered = df_filtered[df_filtered['pollutant'].isin(pollutants)]
    
    # Borough filter - only apply if boroughs list is provided and not empty
    if boroughs and len(boroughs) > 0 and 'All' not in boroughs:
        df_filtered = df_filtered[df_filtered['borough'].isin(boroughs)]
    
    # Exclude outliers
    if exclude_outliers and 'is_outlier' in df_filtered.columns:
        df_filtered = df_filtered[~df_filtered['is_outlier']]
    
    return df_filtered


def aggregate_data(df, agg_level):
    """Aggregate data by specified level."""
    if agg_level == 'Season':
        group_cols = ['season', 'year', 'pollutant']
    elif agg_level == 'Year':
        group_cols = ['year', 'pollutant']
    elif agg_level == 'Month':
        group_cols = ['year', 'month', 'pollutant']
    else:  # 'Raw' or default
        return df
    
    # Add borough if available
    if 'borough' in df.columns and df['borough'].notna().any():
        group_cols.append('borough')
    
    # Prepare aggregation dict
    agg_dict = {'value': ['mean', 'median', 'min', 'max', 'count']}
    
    # Add timestamp if available
    if 'timestamp' in df.columns:
        agg_dict['timestamp'] = 'min'
    elif 'date' in df.columns:
        agg_dict['date'] = 'min'
    
    agg_df = df.groupby(group_cols, dropna=False).agg(agg_dict).reset_index()
    
    # Flatten column names
    agg_df.columns = [col[0] if col[1] == '' else f"{col[0]}_{col[1]}" for col in agg_df.columns]
    
    # Rename date column if created
    if 'timestamp_min' in agg_df.columns:
        agg_df = agg_df.rename(columns={'timestamp_min': 'date'})
    elif 'date_min' in agg_df.columns:
        agg_df = agg_df.rename(columns={'date_min': 'date'})
    
    return agg_df


@app.get("/")
def root():
    return {"message": "NYC Air Quality API"}


@app.get("/api/data/metadata")
def get_metadata():
    """Get metadata about the dataset."""
    df = load_data()
    
    return {
        "total_records": len(df),
        "date_range": {
            "min": df['date'].min().isoformat() if 'date' in df.columns else None,
            "max": df['date'].max().isoformat() if 'date' in df.columns else None,
        },
        "pollutants": sorted(df['pollutant'].unique().tolist()),
        "boroughs": sorted([b for b in df['borough'].unique() if pd.notna(b) and b != 'Unknown']),
    }


@app.post("/api/data/filtered")
def get_filtered_data(request: FilterRequest):
    """Get filtered and aggregated data."""
    df = load_data()
    
    # Apply filters
    df_filtered = filter_data(
        df,
        request.date_range,
        request.pollutants,
        request.boroughs,
        request.exclude_outliers
    )
    
    if len(df_filtered) == 0:
        return {"data": [], "message": "No data matches the selected filters"}
    
    # Aggregate if needed
    if request.agg_level != 'Raw':
        df_display = aggregate_data(df_filtered, request.agg_level)
        value_col = 'value_mean'
    else:
        df_display = df_filtered.copy()
        value_col = 'value'
    
    # Convert to JSON-serializable format
    df_display['date'] = df_display['date'].astype(str) if 'date' in df_display.columns else None
    
    return {
        "data": df_display.to_dict(orient='records'),
        "value_col": value_col,
        "unit": df_display['unit'].iloc[0] if 'unit' in df_display.columns and len(df_display) > 0 else '',
    }


@app.post("/api/data/kpis")
def get_kpis(request: FilterRequest):
    """Get KPI metrics for filtered data."""
    df = load_data()
    
    df_filtered = filter_data(
        df,
        request.date_range,
        request.pollutants,
        request.boroughs,
        request.exclude_outliers
    )
    
    if len(df_filtered) == 0:
        return {"error": "No data matches the selected filters"}
    
    if request.agg_level != 'Raw':
        df_display = aggregate_data(df_filtered, request.agg_level)
        value_col = 'value_mean'
    else:
        df_display = df_filtered.copy()
        value_col = 'value'
    
    unit = df_display['unit'].iloc[0] if 'unit' in df_display.columns and len(df_display) > 0 else ''
    
    return {
        "mean": float(df_display[value_col].mean()) if len(df_display) > 0 else 0,
        "median": float(df_display[value_col].median()) if len(df_display) > 0 else 0,
        "p25": float(df_display[value_col].quantile(0.25)) if len(df_display) > 0 else 0,
        "p75": float(df_display[value_col].quantile(0.75)) if len(df_display) > 0 else 0,
        "p95": float(df_display[value_col].quantile(0.95)) if len(df_display) > 0 else 0,
        "count": len(df_display),
        "unit": unit,
    }


@app.get("/api/map/geojson")
def get_geojson():
    """Get GeoJSON data for map."""
    geojson_data = load_geojson()
    if geojson_data is None:
        raise HTTPException(status_code=404, detail="GeoJSON file not found")
    return geojson_data


@app.post("/api/map/data")
def get_map_data(request: FilterRequest):
    """Get aggregated data for map visualization."""
    df = load_data()
    
    df_filtered = filter_data(
        df,
        request.date_range,
        request.pollutants,
        request.boroughs,
        request.exclude_outliers
    )
    
    # Filter out Unknown boroughs
    map_df = df_filtered[df_filtered['borough'] != 'Unknown'].copy()
    
    if len(map_df) == 0:
        return {"data": [], "message": "No data available for map"}
    
    # If no pollutants specified or empty, aggregate across all pollutants
    if not request.pollutants or len(request.pollutants) == 0:
        # Aggregate by borough across all pollutants (average of all pollutant values)
        borough_avg = map_df.groupby('borough')['value'].mean().reset_index()
        borough_avg = borough_avg.rename(columns={'value': 'avg_value'})
        selected_pollutant = 'All'
    else:
        # Get first pollutant if multiple selected
        selected_pollutant = request.pollutants[0]
        map_pollutant_df = map_df[map_df['pollutant'] == selected_pollutant].copy()
        
        if len(map_pollutant_df) == 0:
            return {"data": [], "message": f"No data available for {selected_pollutant}"}
        
        # Aggregate by borough (average value)
        borough_avg = map_pollutant_df.groupby('borough')['value'].mean().reset_index()
        borough_avg = borough_avg.rename(columns={'value': 'avg_value'})
    
    # Get unit (use first available unit)
    map_unit = map_df['unit'].iloc[0] if 'unit' in map_df.columns and len(map_df) > 0 else ''
    
    return {
        "data": borough_avg.to_dict(orient='records'),
        "pollutant": selected_pollutant,
        "unit": map_unit,
    }


@app.post("/api/heatmap/data")
def get_heatmap_data(request: FilterRequest):
    """Get data for heatmap visualization."""
    df = load_data()
    
    df_filtered = filter_data(
        df,
        request.date_range,
        request.pollutants,
        request.boroughs,
        request.exclude_outliers
    )
    
    heatmap_df = df_filtered[df_filtered['borough'] != 'Unknown'].copy()
    
    if len(heatmap_df) == 0:
        return {"data": {}, "message": "No data available for heatmap"}
    
    # Normalize pollutant names (combine vehicles/trucks)
    def normalize_pollutant_for_heatmap(pollutant):
        pollutant_str = str(pollutant).lower()
        if 'vehicle' in pollutant_str or 'truck' in pollutant_str:
            return 'Vehicle Miles'
        return pollutant
    
    heatmap_df['pollutant_norm'] = heatmap_df['pollutant'].apply(normalize_pollutant_for_heatmap)
    
    # Aggregate by normalized pollutant
    heatmap_data = heatmap_df.groupby(['borough', 'pollutant_norm'])['value'].mean().reset_index()
    heatmap_pivot = heatmap_data.pivot(index='borough', columns='pollutant_norm', values='value')
    
    # Round values
    heatmap_pivot = heatmap_pivot.round(2)
    
    # Sort boroughs
    borough_order = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
    heatmap_pivot = heatmap_pivot.reindex([b for b in borough_order if b in heatmap_pivot.index])
    
    return {
        "data": heatmap_pivot.to_dict(orient='index'),
        "boroughs": heatmap_pivot.index.tolist(),
        "pollutants": heatmap_pivot.columns.tolist(),
        "unit": df_filtered['unit'].iloc[0] if 'unit' in df_filtered.columns else '',
    }


@app.post("/api/timeseries/data")
def get_timeseries_data(request: FilterRequest):
    """Get data for time series visualization."""
    df = load_data()
    
    df_filtered = filter_data(
        df,
        request.date_range,
        request.pollutants,
        request.boroughs,
        request.exclude_outliers
    )
    
    if len(df_filtered) == 0:
        return {"data": [], "message": "No data available for time series"}
    
    # Aggregate if needed
    if request.agg_level != 'Raw':
        df_display = aggregate_data(df_filtered, request.agg_level)
        value_col = 'value_mean'
    else:
        df_display = df_filtered.copy()
        value_col = 'value'
    
    # Prepare time series data based on aggregation level
    if request.agg_level == 'Season':
        ts_data = df_display.groupby(['season', 'year', 'pollutant'])[value_col].mean().reset_index()
        season_to_month = {'Winter': 1, 'Spring': 3, 'Summer': 6, 'Fall': 9, 'Annual': 1}
        ts_data['sort_key'] = ts_data['year'] * 100 + ts_data['season'].map(season_to_month).fillna(1)
        ts_data['date_str'] = ts_data['season'] + ' ' + ts_data['year'].astype(str)
        ts_data = ts_data.sort_values('sort_key')
        x_col = 'date_str'
    elif request.agg_level == 'Year':
        ts_data = df_display.groupby(['year', 'pollutant'])[value_col].mean().reset_index()
        ts_data = ts_data.sort_values('year')
        x_col = 'year'
    elif request.agg_level == 'Month':
        ts_data = df_display.copy()
        ts_data['date'] = pd.to_datetime(ts_data[['year', 'month']].assign(day=1))
        ts_data = ts_data.sort_values('date')
        x_col = 'date'
    else:
        ts_data = df_display.copy()
        if 'date' in ts_data.columns:
            ts_data['date'] = pd.to_datetime(ts_data['date'])
            ts_data = ts_data.sort_values('date')
            x_col = 'date'
        else:
            ts_data = ts_data.sort_values('timestamp')
            x_col = 'timestamp'
    
    # Normalize pollutant names
    def normalize_pollutant_name(pollutant):
        pollutant_str = str(pollutant).lower()
        if 'vehicle' in pollutant_str or 'truck' in pollutant_str:
            return 'Vehicle Miles'
        return pollutant[:15] if len(str(pollutant)) > 15 else pollutant
    
    ts_data['pollutant_short'] = ts_data['pollutant'].apply(normalize_pollutant_name)
    
    # Aggregate by short name
    if 'sort_key' in ts_data.columns:
        ts_data = ts_data.groupby([x_col, 'pollutant_short', 'sort_key'], as_index=False)[value_col].mean()
        ts_data = ts_data.sort_values('sort_key')
    else:
        ts_data = ts_data.groupby([x_col, 'pollutant_short'], as_index=False)[value_col].mean()
    
    return {
        "data": ts_data.to_dict(orient='records'),
        "x_col": x_col,
        "value_col": value_col,
        "unit": df_display['unit'].iloc[0] if 'unit' in df_display.columns else '',
    }


class ComparisonRequest(BaseModel):
    filters: FilterRequest
    comparison_type: str
    selected_items: List[str]
    single_filter: Optional[str] = None

@app.post("/api/comparison/data")
def get_comparison_data(request: ComparisonRequest):
    """Get data for comparison visualization."""
    df = load_data()
    
    df_filtered = filter_data(
        df,
        request.filters.date_range,
        request.filters.pollutants,
        request.filters.boroughs,
        request.filters.exclude_outliers
    )
    
    if len(df_filtered) == 0:
        return {"data": [], "message": "No data available for comparison"}
    
    if request.filters.agg_level != 'Raw':
        df_display = aggregate_data(df_filtered, request.filters.agg_level)
        value_col = 'value_mean'
    else:
        df_display = df_filtered.copy()
        value_col = 'value'
    
    if request.comparison_type == "boroughs":
        # Filter by selected boroughs and pollutant
        comp_df = df_display[
            (df_display['borough'].isin(request.selected_items)) &
            (df_display['pollutant'] == request.single_filter)
        ].copy()
    else:  # pollutants
        if request.single_filter == 'All' or not request.single_filter:
            # Compare pollutants across all boroughs (or filtered boroughs from main filters)
            comp_df = df_display[df_display['pollutant'].isin(request.selected_items)].copy()
        else:
            # Compare pollutants for a specific borough
            comp_df = df_display[
                (df_display['pollutant'].isin(request.selected_items)) &
                (df_display['borough'] == request.single_filter)
            ].copy()
    
    # Get units - handle case where different pollutants might have different units
    if len(comp_df) > 0:
        # For pollutants comparison, units might differ - return first one
        # For boroughs comparison, should be same unit
        unit = comp_df['unit'].iloc[0] if 'unit' in comp_df.columns else ''
    else:
        unit = ''
    
    return {
        "data": comp_df.to_dict(orient='records'),
        "value_col": value_col,
        "unit": unit,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

