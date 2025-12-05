"""
NYC Air Quality Dashboard
Minimal Streamlit app for visualizing processed air quality data.
"""

import streamlit as st
import pandas as pd
import numpy as np
from pathlib import Path
import altair as alt

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
col1, col2, col3, col4 = st.columns(4)

with col1:
    current_avg = df_display[value_col].mean() if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("Current Average", f"{current_avg:.2f}", help="Average value for filtered data")

with col2:
    current_median = df_display[value_col].median() if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("Median", f"{current_median:.2f}")

with col3:
    current_max = df_display[value_col].max() if len(df_display) > 0 and value_col in df_display.columns else 0
    st.metric("Maximum", f"{current_max:.2f}")

with col4:
    record_count = len(df_display)
    st.metric("Records", f"{record_count:,}")

# Get unit for display
unit = df_display['unit'].iloc[0] if 'unit' in df_display.columns and len(df_display) > 0 else ''
if unit:
    st.caption(f"Units: {unit}")

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

# Data table and download
st.header("Data Table")
st.caption("Filtered and aggregated data")

# Select columns to display
display_cols = ['timestamp', 'date', 'year', 'month', 'season', 'pollutant', value_col, 'unit', 
                'station_name', 'borough']
display_cols = [col for col in display_cols if col in df_display.columns]

# Show table
st.dataframe(
    df_display[display_cols].head(1000),
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

# Footer
st.markdown("---")
st.caption("Data source: NYC Open Data (Dataset: c3uy-2p5r) | Processed parquet: data/processed/measurements.parquet")

