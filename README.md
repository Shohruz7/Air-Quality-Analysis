# NYC Air Quality Analysis Dashboard

## Project Overview

This project provides an interactive dashboard for analyzing air quality data from New York City's Open Data portal. The dashboard enables users to explore temporal trends, geospatial distributions, and pollutant comparisons across NYC's monitoring stations.

## Objectives

- Visualize air quality trends over time
- Map pollutant concentrations across NYC boroughs
- Compare different pollutants and their levels
- Provide insights for city planners, researchers, and concerned citizens

## Data Sources

### Primary Dataset: NYC Air Quality

- **Dataset ID**: `c3uy-2p5r`
- **API Endpoint**: `https://data.cityofnewyork.us/resource/c3uy-2p5r.json`
- **Socrata Domain**: `data.cityofnewyork.us`

### Required Columns

The dataset includes the following key columns:
- `timestamp`: Date and time of the measurement
- `pollutant`: Type of pollutant measured (e.g., PM2.5, PM10, O3, NO2)
- `value`: Measured concentration of the pollutant
- `unit`: Unit of measurement (e.g., µg/m³, ppb)
- `station_id`: Identifier for the monitoring station
- `latitude` / `lat`: Latitude coordinate of the station
- `longitude` / `lon`: Longitude coordinate of the station
- `borough`: Borough where the station is located

### API Access

To access the NYC Open Data API, you'll need a Socrata App Token:
1. Sign up at [NYC Open Data](https://opendata.cityofnewyork.us/)
2. Create an app token in your account settings
3. Store the token in a `.env` file or as an environment variable

## Repository Structure

```
Air-Quality-Analysis/
├── README.md                 # Project documentation
├── requirements.txt          # Python dependencies
├── Dockerfile               # Docker configuration (optional)
├── notebooks/               # Jupyter notebooks for exploration
├── app.py              # Main Streamlit application
├── data/
│   ├── raw/                # Raw data files from API
│   └── processed/          # Processed/cleaned data files
└── src/                     # Source code modules
    └── __init__.py
```

## Setup and Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)

### Quick Start Checklist

- [ ] Clone the repository
  ```bash
  git clone <repository-url>
  cd Air-Quality-Analysis
  ```

- [ ] Create and activate a virtual environment
  ```bash
  python -m venv venv
  source venv/bin/activate  # On Windows: venv\Scripts\activate
  ```

- [ ] Install dependencies
  ```bash
  pip install -r requirements.txt
  ```

- [ ] Set up Socrata App Token
  - Create a `.env` file in the project root
  - Add your token: `SOCRATA_APP_TOKEN=your_token_here`
  - Or export as environment variable: `export SOCRATA_APP_TOKEN=your_token_here`

- [ ] Run the data processing notebooks (if not already done)
  - Run `01-ingest.ipynb` to fetch raw data
  - Run `02-cleaning.ipynb` to clean and process data
  - This creates `data/processed/measurements.parquet`

- [ ] Run the Streamlit application
  ```bash
  streamlit run app.py
  ```

- [ ] Access the dashboard
  - Open your browser to `http://localhost:8501`
  - The app reads from `data/processed/measurements.parquet`

## Development

### Data Processing

Raw data from the NYC Open Data API is stored in `data/raw/`. Processed data (cleaned, transformed) is saved to `data/processed/` for faster loading in the dashboard.

### Notebooks

Jupyter notebooks in the `notebooks/` directory perform all data processing:

1. **01-ingest.ipynb**: Fetches data from NYC Open Data API using Socrata, saves raw JSON and sample CSV
2. **02-cleaning.ipynb**: Cleans data (timestamp parsing, unit normalization, outlier detection, spatial joins), saves cleaned parquet
3. **03-eda.ipynb**: Exploratory data analysis with visualizations and dashboard field decisions

**Running the notebooks:**
1. Ensure you have a `.env` file with `SOCRATA_APP_TOKEN=your_token_here`
2. Run notebooks in order: `01-ingest.ipynb` → `02-cleaning.ipynb` → `03-eda.ipynb`
3. The final processed data is saved to `data/processed/measurements.parquet`

**Output:**
- Raw data: `data/raw/air_quality_raw_*.json` and sample CSV
- Processed data: `data/processed/measurements.parquet` (and partitioned version by year/month)

### Streamlit Dashboard

The Streamlit app (`streamlit_app/app.py`) provides an interactive dashboard for exploring the processed data.

**Running the dashboard:**
```bash
streamlit run app.py
```

**Features:**
- Interactive filters (date range, pollutants, boroughs, aggregation level)
- Key metrics (average, median, max values)
- Time series charts with Altair
- Data table with CSV download

**Note:** The app reads from `data/processed/measurements.parquet`. Make sure you've run the notebooks first to generate this file.

### Source Code

Reusable functions and classes are organized in the `src/` directory for:
- API data fetching
- Data cleaning and transformation
- Visualization utilities
- Statistical analysis

## Dependencies

See `requirements.txt` for the complete list of Python packages. Key libraries include:
- `pandas`, `numpy`: Data manipulation
- `sodapy`: NYC Open Data API client
- `streamlit`: Interactive dashboard framework
- `altair` / `plotly`: Data visualization
- `pydeck` / `folium`: Geospatial mapping
- `geopandas`: Geospatial data processing (if needed)
- `pyarrow`: Parquet file support