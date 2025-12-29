# NYC Air Quality Dashboard

A web application for analyzing and visualizing air quality data from NYC monitoring stations. Built with FastAPI (backend) and React (frontend).

## Features

### Data Visualization
- **Map View**: Interactive map showing air quality measurements by location
- **Time Series & Heatmap**: Temporal analysis of pollutant levels across boroughs
- **Comparison**: Side-by-side comparison of pollutants, boroughs, and time periods

### Analysis Tools
- **AQI & Health**: Air Quality Index calculation with health recommendations
- **Trend Analysis**: Statistical trend analysis with linear regression (slope, R², p-value)
- **Seasonal Patterns**: Analysis of air quality variations by season
- **Correlation Analysis**: Correlation matrix showing relationships between pollutants
- **Data Export**: Export filtered data as CSV or JSON

### User Features
- Advanced filtering by date range, pollutants, boroughs, and aggregation level
- Real-time KPI cards showing summary statistics
- Dark mode support
- Responsive design
- Documentation tab with user guide

## Tech Stack

- **Backend**: FastAPI, Python, Pandas, NumPy, SciPy
- **Frontend**: React, TypeScript, Vite, Plotly.js
- **Data**: NYC Open Data (Dataset: c3uy-2p5r)

## Setup

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:3000` (frontend) and `http://localhost:8000` (backend API).

## Project Structure

```
Air-Quality-Analysis/
├── backend/
│   ├── main.py              # FastAPI application
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API service
│   │   └── App.tsx          # Main application
│   └── package.json
└── data/                     # Data files (gitignored)
```

## Data Source

Data is sourced from NYC Open Data (Dataset: c3uy-2p5r). The application processes parquet files containing air quality measurements from monitoring stations across NYC boroughs.

## License

This project is for educational and research purposes.
