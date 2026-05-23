"""Fetch NYC air quality data from Socrata API and save as parquet."""
import requests
import pandas as pd
import numpy as np
from pathlib import Path

DOMAIN = "data.cityofnewyork.us"
DATASET_ID = "c3uy-2p5r"
URL = f"https://{DOMAIN}/resource/{DATASET_ID}.json"
OUT = Path("data/processed/measurements.parquet")

def fetch_all():
    records = []
    limit = 50000
    offset = 0
    while True:
        resp = requests.get(URL, params={"$limit": limit, "$offset": offset, "$order": "start_date ASC"}, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        records.extend(batch)
        print(f"  Fetched {len(batch)} rows (total: {len(records)})")
        if len(batch) < limit:
            break
        offset += len(batch)
    return records

print("Fetching from NYC Open Data...")
data = fetch_all()
print(f"Total rows: {len(data)}")

df = pd.DataFrame(data)
print(f"Columns: {list(df.columns)}")

# Parse timestamp
df['timestamp'] = pd.to_datetime(df['start_date'], errors='coerce')
if df['timestamp'].dt.tz is None:
    df['timestamp'] = df['timestamp'].dt.tz_localize('UTC')
df['timestamp'] = df['timestamp'].dt.tz_convert('America/New_York')
df['date'] = pd.to_datetime(df['timestamp'].dt.date)
df['year'] = df['timestamp'].dt.year
df['month'] = df['timestamp'].dt.month

# Season from time_period
df['season'] = df['time_period'].str.split().str[0]

# Pollutant name
df['pollutant'] = df['name'].str.strip()

# Borough from geo_place_name (e.g. "Bronx", "Brooklyn", etc.)
borough_map = {
    'bronx': 'Bronx', 'brooklyn': 'Brooklyn', 'manhattan': 'Manhattan',
    'queens': 'Queens', 'staten island': 'Staten Island',
}
def extract_borough(geo):
    if pd.isna(geo):
        return 'Unknown'
    g = str(geo).lower()
    for k, v in borough_map.items():
        if k in g:
            return v
    return 'All'

df['borough'] = df.get('geo_place_name', pd.Series(dtype=str)).apply(extract_borough)

# Value
df['value'] = pd.to_numeric(df.get('data_value', pd.Series(dtype=float)), errors='coerce')

# Latitude / longitude
df['latitude'] = pd.to_numeric(df.get('latitude', pd.Series(dtype=float)), errors='coerce')
df['longitude'] = pd.to_numeric(df.get('longitude', pd.Series(dtype=float)), errors='coerce')

# Outlier detection (z-score per pollutant)
df['is_outlier'] = False
for name, group in df.groupby('pollutant'):
    clean = group[group['value'].notna()]
    if len(clean) < 3:
        continue
    z = np.abs((clean['value'] - clean['value'].mean()) / (clean['value'].std() + 1e-9))
    df.loc[z[z > 3].index, 'is_outlier'] = True

# Select final columns
keep = ['timestamp', 'date', 'year', 'month', 'season', 'pollutant', 'borough',
        'value', 'is_outlier', 'latitude', 'longitude', 'geo_join_id', 'time_period']
for c in keep:
    if c not in df.columns:
        df[c] = None

df = df[keep].copy()
df = df.dropna(subset=['value'])

OUT.parent.mkdir(parents=True, exist_ok=True)
df.to_parquet(OUT, engine='pyarrow', index=False)
print(f"\nSaved {len(df)} rows to {OUT}")
print(f"Pollutants: {sorted(df['pollutant'].unique())}")
print(f"Boroughs: {sorted(df['borough'].dropna().unique())}")
print(f"Date range: {df['date'].min()} to {df['date'].max()}")
