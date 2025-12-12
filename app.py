"""
NYC Air Quality Dashboard
Minimal Streamlit app for visualizing processed air quality data.
"""

import streamlit as st
import pandas as pd
import numpy as np
from pathlib import Path
import altair as alt
import plotly.express as px
import plotly.graph_objects as go
import json

# Page config
st.set_page_config(
    page_title="NYC Air Quality Dashboard",
    layout="wide"
)

# Data path - use current working directory
PROJECT_ROOT = Path.cwd()
DATA_PROCESSED = PROJECT_ROOT / "data" / "processed"
PARQUET_PATH = DATA_PROCESSED / "measurements.parquet"


@st.cache_data
def load_data():
    """Load processed parquet file with caching."""
    # Try multiple path resolutions
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
        st.error(f"❌ Data file not found. Tried:")
        for path in possible_paths:
            st.text(f"  - {path.resolve()}")
        st.info("Please run the notebooks (01-ingest.ipynb → 02-cleaning.ipynb) to generate the data.")
        st.stop()
    
    with st.spinner("Loading air quality data..."):
        df = pd.read_parquet(parquet_file, engine='pyarrow')
    
    # Convert date column if needed
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
    
    return df


def filter_data(df, date_range, pollutants, boroughs, exclude_outliers):
    """Apply filters to dataframe."""
    df_filtered = df.copy()
    
    # Date range filter
    if date_range:
        start_date, end_date = date_range
        df_filtered = df_filtered[
            (df_filtered['date'] >= pd.Timestamp(start_date)) &
            (df_filtered['date'] <= pd.Timestamp(end_date))
        ]
    
    # Pollutant filter
    if pollutants:
        df_filtered = df_filtered[df_filtered['pollutant'].isin(pollutants)]
    
    # Borough filter
    if boroughs and 'All' not in boroughs:
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
    
    # Add borough if available and has valid values
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


# Load data
df = load_data()

# Title
st.title("NYC Air Quality Dashboard")
st.markdown("Explore air quality data from NYC monitoring stations")

# Filters in main page
st.header("Filters")
filter_col1, filter_col2, filter_col3, filter_col4 = st.columns(4)

with filter_col1:
    # Date range
    if 'date' in df.columns and df['date'].notna().any():
        min_date = df['date'].min().date()
        max_date = df['date'].max().date()
        date_range = st.date_input(
            "Date Range",
            value=(min_date, max_date),
            min_value=min_date,
            max_value=max_date
        )
    else:
        date_range = None
        st.info("No date information available")

with filter_col2:
    # Pollutant selector with short names - allow multiple selections
    pollutants = df['pollutant'].unique()
    
    # Create short names for filter display
    def get_short_pollutant_name(pollutant):
        """Get short name for pollutant filter."""
        short_names = {
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
        }
        return short_names.get(pollutant, pollutant[:30] if len(pollutant) > 30 else pollutant)
    
    # Create mapping for display
    pollutant_options = {get_short_pollutant_name(p): p for p in sorted(pollutants)}
    
    selected_short_names = st.multiselect(
        "Pollutants",
        options=list(pollutant_options.keys()),
        default=[]  # Default to nothing selected (shows all)
    )
    
    # Map back to full names - if nothing selected, show all
    if not selected_short_names:
        selected_pollutants = None  # Will show all
    else:
        selected_pollutants = [pollutant_options[name] for name in selected_short_names]

with filter_col3:
    # Borough selector - allow multiple selections
    boroughs_list = sorted([b for b in df['borough'].unique() if pd.notna(b) and b != 'Unknown'])
    selected_borough_names = st.multiselect(
        "Boroughs",
        options=boroughs_list,
        default=[]  # Default to nothing selected (shows all)
    )
    # If nothing selected, show all
    if not selected_borough_names:
        selected_boroughs = None
    else:
        selected_boroughs = selected_borough_names

with filter_col4:
    # Aggregation level
    agg_level = st.selectbox(
        "Aggregation Level",
        options=['Raw', 'Month', 'Season', 'Year'],
        index=2,  # Default to Season
        help="Aggregate data by time period. Note: Data contains seasonal aggregates, not hourly measurements."
    )
    # Exclude outliers
    exclude_outliers = st.checkbox("Exclude Outliers", value=True)

# Data info
st.caption(f"Total records: {len(df):,} | Date range: {df['date'].min().date() if 'date' in df.columns else 'N/A'} to {df['date'].max().date() if 'date' in df.columns else 'N/A'} | Pollutants: {', '.join(sorted(df['pollutant'].unique()))}")

# Apply filters
# If None, show all (initial state - "All" selected)
if selected_pollutants is None:
    selected_pollutants = list(df['pollutant'].unique())

df_filtered = filter_data(df, date_range, selected_pollutants, selected_boroughs, exclude_outliers)

if len(df_filtered) == 0:
    st.warning("⚠️ No data matches the selected filters. Please adjust your filters.")
    st.stop()

# Aggregate if needed
if agg_level != 'Raw':
    df_display = aggregate_data(df_filtered, agg_level)
    value_col = 'value_mean'
else:
    df_display = df_filtered.copy()
    value_col = 'value'

# KPIs
st.header("Key Metrics")
col1, col2, col3, col4, col5, col6 = st.columns(6)

with col1:
    current_avg = df_display[value_col].mean() if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("Mean", f"{current_avg:.2f}", help="Average value for filtered data")

with col2:
    current_median = df_display[value_col].median() if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("Median", f"{current_median:.2f}")

with col3:
    p25 = df_display[value_col].quantile(0.25) if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("25th Percentile", f"{p25:.2f}", help="25% of values are below this")

with col4:
    p75 = df_display[value_col].quantile(0.75) if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("75th Percentile", f"{p75:.2f}", help="75% of values are below this")

with col5:
    p95 = df_display[value_col].quantile(0.95) if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("95th Percentile", f"{p95:.2f}", help="95% of values are below this")

with col6:
    record_count = len(df_display)
    st.metric("Records", f"{record_count:,}")

# Get unit for display
unit = df_display['unit'].iloc[0] if 'unit' in df_display.columns and len(df_display) > 0 else ''
if unit:
    st.caption(f"Units: {unit}")

# Add approximate coordinates based on borough centers if missing
def add_borough_coordinates(df):
    """Add approximate coordinates based on borough centers."""
    borough_centers = {
        'Manhattan': (40.7831, -73.9712),
        'Brooklyn': (40.6782, -73.9442),
        'Queens': (40.7282, -73.7949),
        'Bronx': (40.8448, -73.8648),
        'Staten Island': (40.5795, -74.1502),
    }
    
    df = df.copy()
    if 'lat' not in df.columns or df['lat'].isna().all():
        df['lat'] = df['borough'].map(lambda x: borough_centers.get(x, (40.7128, -74.0060))[0] if pd.notna(x) else None)
    if 'lon' not in df.columns or df['lon'].isna().all():
        df['lon'] = df['borough'].map(lambda x: borough_centers.get(x, (40.7128, -74.0060))[1] if pd.notna(x) else None)
    return df

# Add coordinates if missing
df_filtered = add_borough_coordinates(df_filtered)
df_display = add_borough_coordinates(df_display)

# Load GeoJSON for map tab
@st.cache_data
def load_geojson():
    """Load GeoJSON file with caching."""
    geojson_path = PROJECT_ROOT / "new-york-city-boroughs.geojson"
    if not geojson_path.exists():
        # Try alternative paths
        geojson_path = Path("new-york-city-boroughs.geojson")
        if not geojson_path.exists():
            return None
    
    with open(geojson_path, 'r') as f:
        return json.load(f)

geojson_data = load_geojson()

# Create tabs for different visualizations
tab1, tab2, tab3 = st.tabs(["🗺️ Map", "📈 Time Series & Heatmap", "🔍 Comparison"])

# ========== TAB 1: MAP ==========
with tab1:
    st.header("Interactive Borough Map")
    st.caption("Choropleth map showing air quality by borough")
    
    if geojson_data and len(df_filtered) > 0 and 'borough' in df_filtered.columns:
        # Filter out Unknown boroughs
        map_df = df_filtered[df_filtered['borough'] != 'Unknown'].copy()
        
        if len(map_df) > 0:
            # Allow user to select which pollutant to display on map
            available_pollutants = sorted(map_df['pollutant'].unique())
            if len(available_pollutants) > 0:
                # Create a selector for pollutant (default to first one)
                selected_pollutant_map = st.selectbox(
                    "Select Pollutant for Map",
                    options=available_pollutants,
                    index=0 if len(available_pollutants) > 0 else None,
                    key="map_pollutant_selector"
                )
                
                # Filter data for selected pollutant
                map_pollutant_df = map_df[map_df['pollutant'] == selected_pollutant_map].copy()
                
                if len(map_pollutant_df) > 0:
                    # Use 'value' column for map (from filtered data, not aggregated)
                    map_value_col = 'value' if 'value' in map_pollutant_df.columns else value_col
                    
                    # Aggregate by borough (average value)
                    borough_avg = map_pollutant_df.groupby('borough')[map_value_col].mean().reset_index()
                    borough_avg['borough'] = borough_avg['borough'].astype(str)
                    borough_avg = borough_avg.rename(columns={map_value_col: 'avg_value'})
                    
                    # Get unit for the selected pollutant
                    map_unit = map_pollutant_df['unit'].iloc[0] if 'unit' in map_pollutant_df.columns else ''
                    
                    # Debug: Check borough name matching
                    geojson_boroughs = [f['properties']['name'] for f in geojson_data['features']]
                    data_boroughs = borough_avg['borough'].tolist()
                    
                    # Create choropleth map using Plotly graph_objects for better control
                    try:
                        fig = go.Figure(go.Choroplethmapbox(
                            geojson=geojson_data,
                            locations=borough_avg['borough'],
                            z=borough_avg['avg_value'],
                            featureidkey="properties.name",
                            colorscale='Blues',  # Blue scale for map (cool colors)
                            zmin=borough_avg['avg_value'].min(),
                            zmax=borough_avg['avg_value'].max(),
                            marker_opacity=0.7,
                            marker_line_width=1,
                            marker_line_color='white',
                            text=borough_avg['borough'],
                            hovertemplate='<b>%{text}</b><br>' +
                                         f'Average {selected_pollutant_map}: %{{z:.2f}} {map_unit}<extra></extra>',
                            colorbar=dict(
                                title=dict(text=f"Value ({map_unit})", font=dict(size=12)),
                                thickness=15,
                                len=0.5
                            )
                        ))
                        
                        fig.update_layout(
                            mapbox=dict(
                                style="carto-positron",
                                center=dict(lat=40.7128, lon=-74.0060),
                                zoom=9
                            ),
                            height=600,
                            margin=dict(r=0, t=0, l=0, b=0)
                        )
                        
                        st.plotly_chart(fig, use_container_width=True)
                        
                    except Exception as e:
                        # Fallback: Try with px.choropleth_mapbox
                        try:
                            fig = px.choropleth_mapbox(
                                borough_avg,
                                geojson=geojson_data,
                                locations='borough',
                                featureidkey="properties.name",
                                color='avg_value',
                                color_continuous_scale='Blues',  # Blue scale for map (cool colors)
                                range_color=(borough_avg['avg_value'].min(), borough_avg['avg_value'].max()),
                                mapbox_style="carto-positron",
                                zoom=9,
                                center={"lat": 40.7128, "lon": -74.0060},
                                opacity=0.7,
                                labels={'avg_value': f'Average {selected_pollutant_map} ({map_unit})'},
                                hover_data={'borough': True, 'avg_value': ':.2f'}
                            )
                            fig.update_layout(
                                height=600,
                                margin={"r": 0, "t": 0, "l": 0, "b": 0},
                                coloraxis_colorbar=dict(
                                    title=f"Value ({map_unit})",
                                    titlefont=dict(size=12)
                                )
                            )
                            st.plotly_chart(fig, use_container_width=True)
                        except Exception as e2:
                            st.error(f"Error creating map: {str(e2)}")
                            st.info("**Debug Info:**")
                            st.write(f"GeoJSON boroughs: {geojson_boroughs}")
                            st.write(f"Data boroughs: {data_boroughs}")
                            st.write(f"Borough averages:\n{borough_avg}")
                    
                    # Show summary statistics
                    st.caption(f"**Map Statistics for {selected_pollutant_map}:**")
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        # Highest
                        st.markdown("**Highest**")
                        highest_value = borough_avg['avg_value'].max()
                        highest_borough = borough_avg.loc[borough_avg['avg_value'].idxmax(), 'borough']
                        st.markdown(f"{highest_value:.2f} {map_unit}")
                        st.caption(f"{highest_borough}")
                        
                        st.markdown("---")
                        
                        # Average
                        st.markdown("**Average**")
                        avg_value = borough_avg['avg_value'].mean()
                        st.markdown(f"{avg_value:.2f} {map_unit}")
                    
                    with col2:
                        # Lowest
                        st.markdown("**Lowest**")
                        lowest_value = borough_avg['avg_value'].min()
                        lowest_borough = borough_avg.loc[borough_avg['avg_value'].idxmin(), 'borough']
                        st.markdown(f"{lowest_value:.2f} {map_unit}")
                        st.caption(f"{lowest_borough}")
                        
                        st.markdown("---")
                        
                        # Range
                        st.markdown("**Range**")
                        range_value = borough_avg['avg_value'].max() - borough_avg['avg_value'].min()
                        st.markdown(f"{range_value:.2f} {map_unit}")
                else:
                    st.info(f"No data available for {selected_pollutant_map} after filtering")
            else:
                st.info("No pollutants available for map visualization")
        else:
            st.info("No data available for map (all boroughs are Unknown)")
    elif geojson_data is None:
        st.warning("⚠️ GeoJSON file not found. Expected: new-york-city-boroughs.geojson")
    else:
        st.info("Insufficient data for map visualization")

# ========== TAB 2: TIME SERIES & HEATMAP ==========
with tab2:
    # Heatmap visualization
    st.header("Heatmap: Borough by Pollutant")
    st.caption("Average values across boroughs and pollutants")

    if len(df_filtered) > 0 and 'borough' in df_filtered.columns and 'pollutant' in df_filtered.columns:
        # Filter out Unknown boroughs for cleaner visualization
        heatmap_df = df_filtered[df_filtered['borough'] != 'Unknown'].copy()
        
        if len(heatmap_df) > 0:
            # First, combine vehicle-related pollutants (like in time series)
            def normalize_pollutant_for_heatmap(pollutant):
                """Normalize pollutant names, combining vehicles and trucks."""
                pollutant_str = str(pollutant).lower()
                if 'vehicle' in pollutant_str or 'truck' in pollutant_str:
                    return 'Vehicle Miles'
                return pollutant
            
            # Add normalized pollutant column
            heatmap_df['pollutant_norm'] = heatmap_df['pollutant'].apply(normalize_pollutant_for_heatmap)
            
            # Aggregate by normalized pollutant to combine vehicles/trucks
            heatmap_data = heatmap_df.groupby(['borough', 'pollutant_norm'])['value'].mean().reset_index()
            heatmap_data = heatmap_data.pivot(index='borough', columns='pollutant_norm', values='value')
            
            # Round all values to 2 decimals
            heatmap_data = heatmap_data.round(2)
            
            # Create short pollutant names for display (ensure uniqueness)
            def get_short_name_unique(pollutant):
                """Get short name for display."""
                short_names = {
                    'PM2.5': 'PM2.5', 'NO2': 'NO2', 'O3': 'O3',
                    'Vehicle Miles': 'Vehicle Miles',
                }
                
                # Check exact match first
                if pollutant in short_names:
                    return short_names[pollutant]
                
                # For other pollutants, use first 25 chars to avoid truncation issues
                return pollutant[:25] if len(pollutant) > 25 else pollutant
            
            # Rename columns with short names
            heatmap_data.columns = [get_short_name_unique(col) for col in heatmap_data.columns]
            
            # Ensure column names are unique (add suffix if duplicates)
            columns_list = list(heatmap_data.columns)
            seen = {}
            unique_columns = []
            for col in columns_list:
                if col in seen:
                    seen[col] += 1
                    unique_columns.append(f"{col} ({seen[col]})")
                else:
                    seen[col] = 0
                    unique_columns.append(col)
            heatmap_data.columns = unique_columns
            
            # Sort boroughs for consistent display
            borough_order = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']
            heatmap_data = heatmap_data.reindex([b for b in borough_order if b in heatmap_data.index])
            
            if len(heatmap_data) > 0 and len(heatmap_data.columns) > 0:
                # Create discrete color bins every 25 units
                min_val = heatmap_data.min().min()
                max_val = heatmap_data.max().max()
                bin_size = 25
                
                # Round min_val down to nearest 25 and max_val up to nearest 25
                min_bin = (min_val // bin_size) * bin_size
                max_bin = ((max_val // bin_size) + 1) * bin_size
                
                # Create custom discrete colorscale with color stops every 25 units
                orange_colors = px.colors.sequential.Oranges
                num_steps = int((max_bin - min_bin) / bin_size) + 1
                
                # Create colorscale with distinct color stops
                colorscale = []
                for i in range(num_steps):
                    pos = i / (num_steps - 1) if num_steps > 1 else 0
                    # Use distinct colors from Oranges palette
                    color_idx = min(i, len(orange_colors) - 1)
                    colorscale.append([pos, orange_colors[color_idx]])
                
                # Create heatmap with discrete color scale
                fig = go.Figure(data=go.Heatmap(
                    z=heatmap_data.values,
                    x=heatmap_data.columns,
                    y=heatmap_data.index,
                    colorscale=colorscale,
                    zmin=min_bin,
                    zmax=max_bin,
                    colorbar=dict(
                        title=f"Value ({unit})",
                        tickmode='linear',
                        tick0=min_bin,
                        dtick=bin_size,
                        tickformat='.0f'
                    ),
                    text=heatmap_data.values,
                    texttemplate='%{text:.2f}',
                    textfont={"size": 10},
                    hovertemplate='<b>%{y}</b><br>%{x}<br>Value: %{text:.2f} ' + unit + '<extra></extra>'
                ))
                
                fig.update_layout(
                    height=400,
                    xaxis_title="Pollutant",
                    yaxis_title="Borough",
                    xaxis=dict(side="bottom")
                )
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("No data available for heatmap after filtering")
        else:
            st.info("No data available for heatmap (all boroughs are Unknown)")
    else:
        st.info("Insufficient data for heatmap visualization")

    # Time series chart
    st.header("Time Series")
    st.caption(f"Trends over time (aggregated by {agg_level.lower()})")

    if len(df_display) > 0:
        # Prepare data for time series
        if agg_level == 'Season':
            ts_data = df_display.groupby(['season', 'year', 'pollutant'])[value_col].mean().reset_index()
            
            # Create a sortable date column for proper chronological ordering
            # Map seasons to months for sorting (Summer=6, Winter=12, Annual=1, etc.)
            season_to_month = {
                'Winter': 1,
                'Spring': 3,
                'Summer': 6,
                'Fall': 9,
                'Annual': 1,
            }
            
            # Create a numeric sort key: year * 100 + month
            ts_data['sort_key'] = ts_data['year'] * 100 + ts_data['season'].map(season_to_month).fillna(1)
            
            # Create display string
            ts_data['date_str'] = ts_data['season'] + ' ' + ts_data['year'].astype(str)
            
            # Sort by the sort key to ensure chronological order
            ts_data = ts_data.sort_values('sort_key')
            
            x_col = 'date_str'
        elif agg_level == 'Year':
            ts_data = df_display.groupby(['year', 'pollutant'])[value_col].mean().reset_index()
            ts_data = ts_data.sort_values('year')  # Ensure chronological order
            x_col = 'year'
        elif agg_level == 'Month':
            ts_data = df_display.copy()
            ts_data['date'] = pd.to_datetime(ts_data[['year', 'month']].assign(day=1))
            ts_data = ts_data.sort_values('date')  # Ensure chronological order
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
        
        # Create short names for pollutants and combine vehicles/trucks
        pollutant_short_names = {
            'PM2.5': 'PM2.5',
            'NO2': 'NO2',
            'O3': 'O3',
            'Fine particles (PM 2.5)': 'PM2.5',
            'Nitrogen dioxide (NO2)': 'NO2',
            'Ozone (O3)': 'O3',
            'Annual vehicle miles traveled': 'Vehicle Miles',
            'Annual vehicle miles traveled (cars)': 'Vehicle Miles',
            'Annual vehicle miles traveled (trucks)': 'Vehicle Miles',
        }
        
        # Combine vehicle-related pollutants into one category
        def normalize_pollutant_name(pollutant):
            """Normalize pollutant names, combining vehicles and trucks."""
            # First check exact matches
            if pollutant in pollutant_short_names:
                return pollutant_short_names[pollutant]
            
            pollutant_str = str(pollutant).lower()
            # Combine any pollutant with 'vehicle' or 'truck' in the name
            if 'vehicle' in pollutant_str or 'truck' in pollutant_str:
                return 'Vehicle Miles'
            # Truncate long names
            return pollutant[:15] if len(str(pollutant)) > 15 else pollutant
        
        # Add short name column for display
        ts_data['pollutant_short'] = ts_data['pollutant'].apply(normalize_pollutant_name)
        
        # Aggregate by short name to combine vehicles/trucks
        # This ensures if there are separate vehicle and truck entries, they're combined
        # Preserve the sort order by including sort_key in groupby if it exists
        if 'sort_key' in ts_data.columns:
            # Group by all relevant columns including sort_key to preserve order
            ts_data = ts_data.groupby([x_col, 'pollutant_short', 'sort_key'], as_index=False)[value_col].mean()
            # Sort by sort_key to ensure chronological order
            ts_data = ts_data.sort_values('sort_key')
        else:
            ts_data = ts_data.groupby([x_col, 'pollutant_short'], as_index=False)[value_col].mean()
        
        # Create Altair chart with fixed size (non-resizable)
        # For season aggregation, use the data order (already sorted by sort_key)
        if agg_level == 'Season' and 'sort_key' in ts_data.columns:
            # Get unique date_str values in sorted order
            date_order = ts_data.sort_values('sort_key')[x_col].unique().tolist()
            x_encoding = alt.X(
                x_col, 
                title="Time Period",
                sort=date_order  # Use explicit sort order
            )
        else:
            x_encoding = alt.X(x_col, title="Time Period", sort='ascending')
        
        chart = alt.Chart(ts_data).mark_line(point=True).encode(
            x=x_encoding,
            y=alt.Y(f"{value_col}:Q", title=f"Value ({unit})"),
            color=alt.Color("pollutant_short:N", title="Pollutant", legend=alt.Legend(title="Pollutant")),
            tooltip=[
                x_col, 
                alt.Tooltip('pollutant:N', title='Pollutant (full)'),
                alt.Tooltip(f"{value_col}:Q", format=".2f")
            ]
        ).properties(
            width=800,
            height=400
        ).configure_view(
            strokeWidth=0
        )
        
        st.altair_chart(chart, use_container_width=False)
    else:
        st.warning("No data available for time series")
    
    # Data table
    st.header("Data Table")
    st.caption("Filtered and aggregated data")
    
    # Select columns to display
    display_cols = ['timestamp', 'date', 'year', 'month', 'season', 'pollutant', value_col, 'unit', 
                    'station_name', 'borough']
    display_cols = [col for col in display_cols if col in df_display.columns]
    
    # Format value column to 2 decimals for display
    df_table = df_display[display_cols].head(1000).copy()
    if value_col in df_table.columns:
        df_table[value_col] = df_table[value_col].round(2)
    
    # Show table
    st.dataframe(
        df_table,
        use_container_width=True,
        height=400
    )
    
    if len(df_display) > 1000:
        st.caption(f"Showing first 1,000 of {len(df_display):,} records")
    
    # Download button
    csv = df_display[display_cols].to_csv(index=False)
    st.download_button(
        label="Download CSV",
        data=csv,
        file_name=f"air_quality_data_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.csv",
        mime="text/csv"
    )

# ========== TAB 3: COMPARISON ==========
with tab3:
    st.header("🔍 Comparison Tool")
    st.caption("Compare boroughs or pollutants side-by-side")
    
    if len(df_display) > 0:
        # Comparison type selector
        comparison_type = st.radio(
            "What would you like to compare?",
            options=["Boroughs", "Pollutants"],
            horizontal=True,
            key="comparison_type"
        )
        
        if comparison_type == "Boroughs":
            # Borough comparison
            available_boroughs = sorted([b for b in df_display['borough'].unique() if pd.notna(b) and b != 'Unknown'])
            available_pollutants_comp = sorted(df_display['pollutant'].unique())
            
            if len(available_boroughs) > 0 and len(available_pollutants_comp) > 0:
                comp_col1, comp_col2 = st.columns(2)
                
                with comp_col1:
                    selected_boroughs_comp = st.multiselect(
                        "Select Boroughs to Compare",
                        options=available_boroughs,
                        default=available_boroughs[:2] if len(available_boroughs) >= 2 else available_boroughs[:1],
                        key="borough_comparison"
                    )
                
                with comp_col2:
                    selected_pollutant_comp = st.selectbox(
                        "Select Pollutant",
                        options=available_pollutants_comp,
                        index=0,
                        key="pollutant_for_borough_comp"
                    )
                
                if len(selected_boroughs_comp) > 0:
                    # Filter data for comparison
                    comp_df = df_display[
                        (df_display['borough'].isin(selected_boroughs_comp)) &
                        (df_display['pollutant'] == selected_pollutant_comp)
                    ].copy()
                    
                    if len(comp_df) > 0:
                        # Get unit
                        comp_unit = comp_df['unit'].iloc[0] if 'unit' in comp_df.columns else ''
                        
                        # Comparison metrics
                        st.subheader("📊 Comparison Metrics")
                        borough_stats = comp_df.groupby('borough')[value_col].agg(['mean', 'median', 'std', 'min', 'max', 'count']).reset_index()
                        borough_stats = borough_stats.round(2)
                        
                        # Display metrics in columns
                        num_boroughs = len(selected_boroughs_comp)
                        cols = st.columns(min(num_boroughs, 5))
                        
                        for idx, borough in enumerate(selected_boroughs_comp):
                            if idx < len(cols):
                                borough_data = comp_df[comp_df['borough'] == borough]
                                if len(borough_data) > 0:
                                    with cols[idx]:
                                        st.metric(
                                            borough,
                                            f"{borough_data[value_col].mean():.2f} {comp_unit}",
                                            delta=f"±{borough_data[value_col].std():.2f}" if borough_data[value_col].std() > 0 else None
                                        )
                                        st.caption(f"n={len(borough_data):,} records")
                        
                        # Detailed comparison table
                        with st.expander("📋 Detailed Statistics Table"):
                            st.dataframe(borough_stats, use_container_width=True)
                        
                        # Visualizations
                        st.subheader("📈 Visualizations")
                        
                        # 1. Grouped Bar Chart - Average values
                        comp_avg = comp_df.groupby('borough')[value_col].mean().reset_index()
                        comp_avg = comp_avg.sort_values(value_col, ascending=False)
                        
                        fig_bar = px.bar(
                            comp_avg,
                            x='borough',
                            y=value_col,
                            color='borough',
                            title=f'Average {selected_pollutant_comp} by Borough',
                            labels={value_col: f'Average Value ({comp_unit})', 'borough': 'Borough'},
                            color_discrete_sequence=px.colors.qualitative.Set3
                        )
                        fig_bar.update_layout(
                            height=400,
                            showlegend=False,
                            xaxis_title="Borough",
                            yaxis_title=f"Average Value ({comp_unit})"
                        )
                        st.plotly_chart(fig_bar, use_container_width=True)
                        
                        # 2. Time Series Comparison
                        if 'date' in comp_df.columns or 'year' in comp_df.columns:
                            st.caption("**Time Series Comparison**")
                            
                            # Prepare time series data
                            if agg_level == 'Season' and 'season' in comp_df.columns and 'year' in comp_df.columns:
                                ts_comp = comp_df.groupby(['borough', 'season', 'year'])[value_col].mean().reset_index()
                                ts_comp['date_str'] = ts_comp['season'] + ' ' + ts_comp['year'].astype(str)
                                
                                # Create sort key
                                season_to_month = {'Winter': 1, 'Spring': 3, 'Summer': 6, 'Fall': 9, 'Annual': 1}
                                ts_comp['sort_key'] = ts_comp['year'] * 100 + ts_comp['season'].map(season_to_month).fillna(1)
                                ts_comp = ts_comp.sort_values('sort_key')
                                
                                fig_ts = px.line(
                                    ts_comp,
                                    x='date_str',
                                    y=value_col,
                                    color='borough',
                                    markers=True,
                                    title=f'{selected_pollutant_comp} Over Time by Borough',
                                    labels={value_col: f'Value ({comp_unit})', 'date_str': 'Time Period', 'borough': 'Borough'}
                                )
                                fig_ts.update_layout(
                                    height=400,
                                    xaxis_title="Time Period",
                                    yaxis_title=f"Value ({comp_unit})"
                                )
                                st.plotly_chart(fig_ts, use_container_width=True)
                            elif 'year' in comp_df.columns:
                                ts_comp = comp_df.groupby(['borough', 'year'])[value_col].mean().reset_index()
                                ts_comp = ts_comp.sort_values('year')
                                
                                fig_ts = px.line(
                                    ts_comp,
                                    x='year',
                                    y=value_col,
                                    color='borough',
                                    markers=True,
                                    title=f'{selected_pollutant_comp} Over Time by Borough',
                                    labels={value_col: f'Value ({comp_unit})', 'year': 'Year', 'borough': 'Borough'}
                                )
                                fig_ts.update_layout(height=400)
                                st.plotly_chart(fig_ts, use_container_width=True)
                        
                        # 3. Box Plot Comparison
                        st.caption("**Distribution Comparison**")
                        fig_box = px.box(
                            comp_df,
                            x='borough',
                            y=value_col,
                            color='borough',
                            title=f'Distribution of {selected_pollutant_comp} by Borough',
                            labels={value_col: f'Value ({comp_unit})', 'borough': 'Borough'},
                            color_discrete_sequence=px.colors.qualitative.Set3
                        )
                        fig_box.update_layout(
                            height=400,
                            showlegend=False,
                            xaxis_title="Borough",
                            yaxis_title=f"Value ({comp_unit})"
                        )
                        st.plotly_chart(fig_box, use_container_width=True)
                        
                    else:
                        st.warning(f"No data available for selected boroughs and pollutant: {selected_pollutant_comp}")
                else:
                    st.info("Please select at least one borough to compare")
            else:
                st.info("Insufficient data for borough comparison")
        
        else:  # Pollutants comparison
            # Pollutant comparison
            available_pollutants_comp = sorted(df_display['pollutant'].unique())
            available_boroughs_comp = sorted([b for b in df_display['borough'].unique() if pd.notna(b) and b != 'Unknown'])
            
            if len(available_pollutants_comp) > 0:
                comp_col1, comp_col2 = st.columns(2)
                
                with comp_col1:
                    selected_pollutants_comp = st.multiselect(
                        "Select Pollutants to Compare",
                        options=available_pollutants_comp,
                        default=available_pollutants_comp[:2] if len(available_pollutants_comp) >= 2 else available_pollutants_comp[:1],
                        key="pollutant_comparison"
                    )
                
                with comp_col2:
                    if len(available_boroughs_comp) > 0:
                        selected_borough_comp = st.selectbox(
                            "Select Borough (or All)",
                            options=['All'] + available_boroughs_comp,
                            index=0,
                            key="borough_for_pollutant_comp"
                        )
                    else:
                        selected_borough_comp = 'All'
                
                if len(selected_pollutants_comp) > 0:
                    # Filter data for comparison
                    if selected_borough_comp == 'All':
                        comp_df = df_display[df_display['pollutant'].isin(selected_pollutants_comp)].copy()
                    else:
                        comp_df = df_display[
                            (df_display['pollutant'].isin(selected_pollutants_comp)) &
                            (df_display['borough'] == selected_borough_comp)
                        ].copy()
                    
                    if len(comp_df) > 0:
                        # Note: Different pollutants may have different units
                        pollutant_units = comp_df.groupby('pollutant')['unit'].first().to_dict()
                        
                        # Comparison metrics
                        st.subheader("📊 Comparison Metrics")
                        pollutant_stats = comp_df.groupby('pollutant')[value_col].agg(['mean', 'median', 'std', 'min', 'max', 'count']).reset_index()
                        pollutant_stats = pollutant_stats.merge(
                            comp_df.groupby('pollutant')['unit'].first().reset_index(),
                            on='pollutant'
                        )
                        pollutant_stats = pollutant_stats.round(2)
                        
                        # Display metrics in columns
                        num_pollutants = len(selected_pollutants_comp)
                        cols = st.columns(min(num_pollutants, 5))
                        
                        for idx, pollutant in enumerate(selected_pollutants_comp):
                            if idx < len(cols):
                                pollutant_data = comp_df[comp_df['pollutant'] == pollutant]
                                if len(pollutant_data) > 0:
                                    with cols[idx]:
                                        unit_display = pollutant_units.get(pollutant, '')
                                        st.metric(
                                            pollutant[:30] + ('...' if len(pollutant) > 30 else ''),
                                            f"{pollutant_data[value_col].mean():.2f} {unit_display}",
                                            delta=f"±{pollutant_data[value_col].std():.2f}" if pollutant_data[value_col].std() > 0 else None
                                        )
                                        st.caption(f"n={len(pollutant_data):,} records")
                        
                        # Detailed comparison table
                        with st.expander("📋 Detailed Statistics Table"):
                            st.dataframe(pollutant_stats, use_container_width=True)
                        
                        # Visualizations
                        st.subheader("📈 Visualizations")
                        
                        # 1. Grouped Bar Chart - Average values
                        comp_avg = comp_df.groupby('pollutant')[value_col].mean().reset_index()
                        comp_avg = comp_avg.sort_values(value_col, ascending=False)
                        
                        # Create short names for display
                        comp_avg['pollutant_short'] = comp_avg['pollutant'].apply(
                            lambda x: x[:25] + '...' if len(x) > 25 else x
                        )
                        
                        fig_bar = px.bar(
                            comp_avg,
                            x='pollutant_short',
                            y=value_col,
                            color='pollutant',
                            title=f'Average Values by Pollutant' + (f' ({selected_borough_comp})' if selected_borough_comp != 'All' else ' (All Boroughs)'),
                            labels={value_col: 'Average Value', 'pollutant_short': 'Pollutant'},
                            color_discrete_sequence=px.colors.qualitative.Set3
                        )
                        fig_bar.update_layout(
                            height=400,
                            showlegend=False,
                            xaxis_title="Pollutant",
                            yaxis_title="Average Value"
                        )
                        fig_bar.update_xaxes(tickangle=45)
                        st.plotly_chart(fig_bar, use_container_width=True)
                        
                        # 2. Time Series Comparison
                        if 'date' in comp_df.columns or 'year' in comp_df.columns:
                            st.caption("**Time Series Comparison**")
                            
                            # Prepare time series data
                            if agg_level == 'Season' and 'season' in comp_df.columns and 'year' in comp_df.columns:
                                ts_comp = comp_df.groupby(['pollutant', 'season', 'year'])[value_col].mean().reset_index()
                                ts_comp['date_str'] = ts_comp['season'] + ' ' + ts_comp['year'].astype(str)
                                
                                # Create sort key
                                season_to_month = {'Winter': 1, 'Spring': 3, 'Summer': 6, 'Fall': 9, 'Annual': 1}
                                ts_comp['sort_key'] = ts_comp['year'] * 100 + ts_comp['season'].map(season_to_month).fillna(1)
                                ts_comp = ts_comp.sort_values('sort_key')
                                
                                # Create short names
                                ts_comp['pollutant_short'] = ts_comp['pollutant'].apply(
                                    lambda x: x[:20] + '...' if len(x) > 20 else x
                                )
                                
                                fig_ts = px.line(
                                    ts_comp,
                                    x='date_str',
                                    y=value_col,
                                    color='pollutant_short',
                                    markers=True,
                                    title=f'Pollutants Over Time' + (f' ({selected_borough_comp})' if selected_borough_comp != 'All' else ' (All Boroughs)'),
                                    labels={value_col: 'Value', 'date_str': 'Time Period', 'pollutant_short': 'Pollutant'}
                                )
                                fig_ts.update_layout(
                                    height=400,
                                    xaxis_title="Time Period",
                                    yaxis_title="Value"
                                )
                                st.plotly_chart(fig_ts, use_container_width=True)
                            elif 'year' in comp_df.columns:
                                ts_comp = comp_df.groupby(['pollutant', 'year'])[value_col].mean().reset_index()
                                ts_comp = ts_comp.sort_values('year')
                                
                                # Create short names
                                ts_comp['pollutant_short'] = ts_comp['pollutant'].apply(
                                    lambda x: x[:20] + '...' if len(x) > 20 else x
                                )
                                
                                fig_ts = px.line(
                                    ts_comp,
                                    x='year',
                                    y=value_col,
                                    color='pollutant_short',
                                    markers=True,
                                    title=f'Pollutants Over Time' + (f' ({selected_borough_comp})' if selected_borough_comp != 'All' else ' (All Boroughs)'),
                                    labels={value_col: 'Value', 'year': 'Year', 'pollutant_short': 'Pollutant'}
                                )
                                fig_ts.update_layout(height=400)
                                st.plotly_chart(fig_ts, use_container_width=True)
                        
                        # 3. Box Plot Comparison
                        st.caption("**Distribution Comparison**")
                        comp_df['pollutant_short'] = comp_df['pollutant'].apply(
                            lambda x: x[:25] + '...' if len(x) > 25 else x
                        )
                        
                        fig_box = px.box(
                            comp_df,
                            x='pollutant_short',
                            y=value_col,
                            color='pollutant',
                            title=f'Distribution Comparison' + (f' ({selected_borough_comp})' if selected_borough_comp != 'All' else ' (All Boroughs)'),
                            labels={value_col: 'Value', 'pollutant_short': 'Pollutant'},
                            color_discrete_sequence=px.colors.qualitative.Set3
                        )
                        fig_box.update_layout(
                            height=400,
                            showlegend=False,
                            xaxis_title="Pollutant",
                            yaxis_title="Value"
                        )
                        fig_box.update_xaxes(tickangle=45)
                        st.plotly_chart(fig_box, use_container_width=True)
                        
                    else:
                        st.warning(f"No data available for selected pollutants" + (f" in {selected_borough_comp}" if selected_borough_comp != 'All' else ""))
                else:
                    st.info("Please select at least one pollutant to compare")
            else:
                st.info("Insufficient data for pollutant comparison")
    else:
        st.warning("No data available for comparison")

# Footer
st.markdown("---")
st.markdown("**Data source:** NYC Open Data (Dataset: c3uy-2p5r) | Processed parquet: data/processed/measurements.parquet")

