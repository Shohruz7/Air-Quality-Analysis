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
      date: get('date'),
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
  const text = await fetch('/data/measurements.csv').then(r => {
    if (!r.ok) throw new Error(`Failed to load data: ${r.status}`);
    return r.text();
  });
  cache = parseCSV(text);
  return cache;
}
