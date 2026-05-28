export interface Row {
  timestamp: string;
  date: string;
  year: number;
  month: number;
  season: string;
  pollutant: string;
  borough: string;
  value: number;
  is_outlier: boolean;
  latitude: number | null;
  longitude: number | null;
  geo_join_id: string | null;
  time_period: string | null;
}

let cache: Row[] | null = null;
let loadingPromise: Promise<Row[]> | null = null;

function parseCSV(text: string): Row[] {
  const lines = text.split('\n');
  const headers = lines[0].split(',');
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV split — values in this dataset don't contain commas
    const vals = line.split(',');
    if (vals.length < headers.length) continue;

    const get = (col: string) => vals[headers.indexOf(col)] ?? '';

    const valueStr = get('value');
    const parsedValue = parseFloat(valueStr);
    if (isNaN(parsedValue)) continue;

    const isOutlierRaw = get('is_outlier').toLowerCase();

    rows.push({
      timestamp: get('timestamp'),
      // Trim to YYYY-MM-DD in case pandas wrote a datetime string
      date: get('date').substring(0, 10),
      year: parseInt(get('year'), 10),
      month: parseInt(get('month'), 10),
      season: get('season'),
      pollutant: get('pollutant'),
      borough: get('borough'),
      value: parsedValue,
      is_outlier: isOutlierRaw === 'true' || isOutlierRaw === '1',
      latitude: parseFloat(get('latitude')) || null,
      longitude: parseFloat(get('longitude')) || null,
      geo_join_id: get('geo_join_id') || null,
      time_period: get('time_period') || null,
    });
  }

  return rows;
}

export async function getData(): Promise<Row[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/data/measurements.csv')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching /data/measurements.csv`);
      return r.text();
    })
    .then(text => {
      cache = parseCSV(text);
      if (cache.length === 0)
        console.error('[dataStore] 0 rows parsed — server may have returned HTML instead of CSV. First 200 chars:', text.slice(0, 200));
      else
        console.log(`[dataStore] Loaded ${cache.length} rows`);
      loadingPromise = null;
      return cache;
    })
    .catch(err => {
      loadingPromise = null;
      console.error('[dataStore] CSV load failed:', err.message);
      throw err;
    });
  return loadingPromise;
}
