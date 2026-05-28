"""
One-time script: export measurements.parquet → frontend/public/data/measurements.csv
Also copies the GeoJSON boundary file into the same directory.
Run from the project root: python3 scripts/export_to_csv.py
"""
import pathlib
import shutil
import pandas as pd

ROOT = pathlib.Path(__file__).parent.parent
OUT = ROOT / "frontend" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

df = pd.read_parquet(ROOT / "data" / "processed" / "measurements.parquet")
csv_path = OUT / "measurements.csv"
df.to_csv(csv_path, index=False)
print(f"Exported {len(df)} rows → {csv_path}")

geojson_src = ROOT / "new-york-city-boroughs.geojson"
geojson_dst = OUT / "nyc-boroughs.geojson"
shutil.copy(geojson_src, geojson_dst)
print(f"Copied GeoJSON → {geojson_dst}")
