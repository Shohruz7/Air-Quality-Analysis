import { getData } from './dataStore';
import type { Row } from './dataStore';
import geoUrl from '../assets/nyc-boroughs.geojson?url';

// ── Types (unchanged public interface) ──────────────────────────────────────

export interface FilterRequest {
  date_range?: [string, string] | null;
  pollutants?: string[] | null;
  boroughs?: string[] | null;
  exclude_outliers?: boolean;
  agg_level?: string;
}

export interface Metadata {
  total_records: number;
  date_range: { min: string | null; max: string | null };
  pollutants: string[];
  boroughs: string[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function filterData(rows: Row[], f: FilterRequest): Row[] {
  let out = rows;

  if (f.date_range && f.date_range.length === 2) {
    const start = f.date_range[0];
    const end = f.date_range[1];
    out = out.filter(r => r.date >= start && r.date <= end);
  }

  if (f.pollutants && f.pollutants.length > 0) {
    const set = new Set(f.pollutants);
    out = out.filter(r => set.has(r.pollutant));
  }

  if (f.boroughs && f.boroughs.length > 0 && !f.boroughs.includes('All')) {
    const set = new Set(f.boroughs);
    out = out.filter(r => set.has(r.borough));
  }

  if (f.exclude_outliers !== false) {
    out = out.filter(r => !r.is_outlier);
  }

  return out;
}

interface AggRow {
  year: number;
  month: number;
  season: string;
  pollutant: string;
  borough: string;
  date: string;
  value_mean: number;
  value_median: number;
  value_min: number;
  value_max: number;
  value_count: number;
  unit: string;
}

function groupBy<T>(arr: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of arr) {
    const k = key(r);
    const g = m.get(k);
    if (g) g.push(r); else m.set(k, [r]);
  }
  return m;
}

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function stddev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1));
}

function aggregateData(rows: Row[], aggLevel: string): AggRow[] {
  let keyFn: (r: Row) => string;
  if (aggLevel === 'Season') {
    keyFn = r => `${r.season}|${r.year}|${r.pollutant}|${r.borough}`;
  } else if (aggLevel === 'Year') {
    keyFn = r => `${r.year}|${r.pollutant}|${r.borough}`;
  } else if (aggLevel === 'Month') {
    keyFn = r => `${r.year}|${r.month}|${r.pollutant}|${r.borough}`;
  } else {
    // Raw — return rows as AggRow with value_mean = value
    return rows.map(r => ({
      year: r.year, month: r.month, season: r.season,
      pollutant: r.pollutant, borough: r.borough, date: r.date,
      value_mean: r.value, value_median: r.value,
      value_min: r.value, value_max: r.value, value_count: 1,
      unit: '',
    }));
  }

  const groups = groupBy(rows, keyFn);
  const result: AggRow[] = [];

  for (const [, grp] of groups) {
    const vals = grp.map(r => r.value).filter(v => isFinite(v));
    if (!vals.length) continue;
    const rep = grp[0];
    result.push({
      year: rep.year, month: rep.month, season: rep.season,
      pollutant: rep.pollutant, borough: rep.borough, date: rep.date,
      value_mean: mean(vals),
      value_median: median(vals),
      value_min: Math.min(...vals),
      value_max: Math.max(...vals),
      value_count: vals.length,
      unit: '',
    });
  }

  return result;
}

// Linear regression — returns { slope, intercept, r2, pValue }
function linregress(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxy += (xs[i] - mx) * (ys[i] - my);
    ssxx += (xs[i] - mx) ** 2;
    ssyy += (ys[i] - my) ** 2;
  }
  const slope = ssxx ? ssxy / ssxx : 0;
  const intercept = my - slope * mx;
  const r2 = (ssxx && ssyy) ? (ssxy ** 2) / (ssxx * ssyy) : 0;
  // t-statistic approximation for p-value (two-tailed, df = n-2)
  const se = ssxx ? Math.sqrt(Math.max(0, (ssyy - ssxy ** 2 / ssxx) / (n - 2)) / ssxx) : 1;
  const t = se ? Math.abs(slope / se) : 0;
  // rough p-value via normal approx (good enough for this use-case)
  const pValue = Math.exp(-0.717 * t - 0.416 * t * t);
  return { slope, intercept, r2: Math.min(1, Math.max(0, r2)), pValue: Math.min(1, Math.max(0, pValue)) };
}

// Pearson correlation between two arrays
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (!denom) return 0;
  return Math.max(-1, Math.min(1, num / denom));
}

// Normalize pollutant for heatmap (mirrors Python backend logic)
function normalizePollutant(p: string): string {
  const pl = p.toLowerCase();
  if (pl.includes('vehicle') || pl.includes('truck')) return 'Vehicle Miles';
  return p;
}

// ── AQI ──────────────────────────────────────────────────────────────────────

type BPRow = [number, number, number, number, string];

const AQI_BREAKPOINTS: Record<string, BPRow[]> = {
  PM2_5: [
    [0, 12.0, 0, 50, 'Good'],
    [12.1, 35.4, 51, 100, 'Moderate'],
    [35.5, 55.4, 101, 150, 'Unhealthy for Sensitive Groups'],
    [55.5, 150.4, 151, 200, 'Unhealthy'],
    [150.5, 250.4, 201, 300, 'Very Unhealthy'],
    [250.5, 500.4, 301, 500, 'Hazardous'],
  ],
  PM10: [
    [0, 54, 0, 50, 'Good'],
    [55, 154, 51, 100, 'Moderate'],
    [155, 254, 101, 150, 'Unhealthy for Sensitive Groups'],
    [255, 354, 151, 200, 'Unhealthy'],
    [355, 424, 201, 300, 'Very Unhealthy'],
    [425, 604, 301, 500, 'Hazardous'],
  ],
  O3: [
    [0, 54, 0, 50, 'Good'],
    [55, 70, 51, 100, 'Moderate'],
    [71, 85, 101, 150, 'Unhealthy for Sensitive Groups'],
    [86, 105, 151, 200, 'Unhealthy'],
    [106, 200, 201, 300, 'Very Unhealthy'],
  ],
  NO2: [
    [0, 53, 0, 50, 'Good'],
    [54, 100, 51, 100, 'Moderate'],
    [101, 360, 101, 150, 'Unhealthy for Sensitive Groups'],
    [361, 649, 151, 200, 'Unhealthy'],
    [650, 1249, 201, 300, 'Very Unhealthy'],
    [1250, 2049, 301, 500, 'Hazardous'],
  ],
};

const AQI_COLORS: Record<string, string> = {
  Good: '#00e400',
  Moderate: '#ffff00',
  'Unhealthy for Sensitive Groups': '#ff7e00',
  Unhealthy: '#ff0000',
  'Very Unhealthy': '#8f3f97',
  Hazardous: '#7e0023',
};

function getPollutantAQIKey(pollutant: string): string | null {
  const u = pollutant.toUpperCase();
  if (u.includes('PM2.5') || u.includes('PM 2.5')) return 'PM2_5';
  if (u.includes('PM10') || u.includes('PM 10')) return 'PM10';
  if (u.includes('O3') || u.includes('OZONE')) return 'O3';
  if (u.includes('NO2') || u.includes('NITROGEN DIOXIDE')) return 'NO2';
  return null;
}

function calculateAQI(pollutant: string, value: number) {
  const key = getPollutantAQIKey(pollutant);
  if (!key) return { aqi: null as number | null, category: 'Not Available', color: '#808080', pollutant, message: `AQI not available for ${pollutant}` };

  for (const [bpLo, bpHi, aqiLo, aqiHi, category] of AQI_BREAKPOINTS[key]) {
    if (value >= bpLo && value <= bpHi) {
      const aqi = Math.round(((aqiHi - aqiLo) / (bpHi - bpLo)) * (value - bpLo) + aqiLo);
      return { aqi, category, color: AQI_COLORS[category] ?? '#808080', value, pollutant };
    }
  }
  return { aqi: 500, category: 'Hazardous', color: '#7e0023', value, pollutant };
}

// ── Public apiService (same interface as before) ──────────────────────────────
// Return types are Promise<any> to preserve loose typing for components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiService: Record<string, (...args: any[]) => Promise<any>> & {
  getMetadata: () => Promise<Metadata>;
} = {
  getMetadata: async (): Promise<Metadata> => {
    const rows = await getData();
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    const pollutants = [...new Set(rows.map(r => r.pollutant))].sort();
    const boroughs = [...new Set(rows.map(r => r.borough).filter(b => b && b !== 'Unknown' && b !== 'All'))].sort();
    return {
      total_records: rows.length,
      date_range: { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null },
      pollutants,
      boroughs,
    };
  },

  getFilteredData: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { data: [], message: 'No data matches the selected filters' };

    const aggLevel = filters.agg_level ?? 'Raw';
    if (aggLevel !== 'Raw') {
      const agg = aggregateData(filtered, aggLevel);
      return { data: agg, value_col: 'value_mean', unit: '' };
    }
    return { data: filtered.map(r => ({ ...r, unit: '' })), value_col: 'value', unit: '' };
  },

  getKPIs: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    const aggLevel = filters.agg_level ?? 'Raw';
    const vals = aggLevel !== 'Raw'
      ? aggregateData(filtered, aggLevel).map(r => r.value_mean)
      : filtered.map(r => r.value);

    const finite = vals.filter(isFinite);
    return {
      mean: mean(finite),
      median: median(finite),
      p25: percentile(finite, 25),
      p75: percentile(finite, 75),
      p95: percentile(finite, 95),
      count: finite.length,
      unit: '',
    };
  },

  getGeoJSON: async () => {
    const res = await fetch(geoUrl);
    if (!res.ok) throw new Error('GeoJSON not found');
    return res.json();
  },

  getMapData: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters).filter(r => r.borough && r.borough !== 'Unknown' && r.borough !== 'All');
    if (!filtered.length) return { data: [], message: 'No data available for map' };

    const byBorough = groupBy(filtered, r => r.borough);
    const data = [...byBorough.entries()].map(([borough, grp]) => ({
      borough,
      avg_value: mean(grp.map(r => r.value).filter(isFinite)),
    }));

    return { data, pollutant: filters.pollutants?.[0] ?? 'All', unit: '' };
  },

  getHeatmapData: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters).filter(r => r.borough && r.borough !== 'Unknown' && r.borough !== 'All');
    if (!filtered.length) return { data: {}, boroughs: [], pollutants: [], unit: '', message: 'No data available for heatmap' };

    const boroughOrder = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
    const boroughSet = new Set(filtered.map(r => r.borough));
    const pollutantSet = new Set(filtered.map(r => normalizePollutant(r.pollutant)));

    const boroughs = boroughOrder.filter(b => boroughSet.has(b));
    const pollutants = [...pollutantSet].sort();

    // pivot: borough → pollutant_norm → mean(value)
    const pivot: Record<string, Record<string, number>> = {};
    for (const b of boroughs) pivot[b] = {};

    const groups = groupBy(filtered, r => `${r.borough}|${normalizePollutant(r.pollutant)}`);
    for (const [key, grp] of groups) {
      const [borough, pollNorm] = key.split('|');
      if (!pivot[borough]) continue;
      pivot[borough][pollNorm] = parseFloat(mean(grp.map(r => r.value).filter(isFinite)).toFixed(2));
    }

    return { data: pivot, boroughs, pollutants, unit: '' };
  },

  getTimeseriesData: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { data: [], message: 'No data available for time series' };

    const aggLevel = filters.agg_level ?? 'Season';
    const agg = aggLevel !== 'Raw' ? aggregateData(filtered, aggLevel) : filtered.map(r => ({ ...r, value_mean: r.value }));

    const POLLUTANT_SHORT: Record<string, string> = {
      'Fine particles (PM 2.5)': 'PM2.5',
      'Nitrogen dioxide (NO2)': 'NO2',
      'Ozone (O3)': 'O3',
      'Sulfur dioxide (SO2)': 'SO2',
      'Black carbon': 'Black Carbon',
      'Nitric oxide (NO)': 'NO',
    };
    const shortenPollutant = (p: string) => POLLUTANT_SHORT[p] ?? normalizePollutant(p).slice(0, 20);
    const SEASON_MONTH: Record<string, number> = { Winter: 1, Spring: 3, Summer: 6, Fall: 9, Annual: 1 };

    type TSRow = { date_str?: string; year?: string; date?: string; pollutant_short: string; value_mean: number; sort_key?: number };
    let tsData: TSRow[] = [];

    if (aggLevel === 'Season') {
      const groups = groupBy(agg as AggRow[], r => `${r.season}|${r.year}|${r.pollutant}`);
      for (const [, grp] of groups) {
        const rep = grp[0] as AggRow;
        const seasonMonth = SEASON_MONTH[rep.season] ?? 1;
        tsData.push({
          date_str: `${rep.season} ${rep.year}`,
          pollutant_short: shortenPollutant(rep.pollutant),
          value_mean: mean(grp.map(r => (r as AggRow).value_mean).filter(isFinite)),
          sort_key: rep.year * 100 + seasonMonth,
        });
      }
      tsData.sort((a, b) => (a.sort_key ?? 0) - (b.sort_key ?? 0));
      return { data: tsData, x_col: 'date_str', value_col: 'value_mean', unit: '' };
    }

    if (aggLevel === 'Year') {
      const groups = groupBy(agg as AggRow[], r => `${r.year}|${r.pollutant}`);
      for (const [, grp] of groups) {
        const rep = grp[0] as AggRow;
        tsData.push({
          year: String(rep.year),
          pollutant_short: shortenPollutant(rep.pollutant),
          value_mean: mean(grp.map(r => (r as AggRow).value_mean).filter(isFinite)),
          sort_key: rep.year,
        });
      }
      tsData.sort((a, b) => (a.sort_key ?? 0) - (b.sort_key ?? 0));
      return { data: tsData, x_col: 'year', value_col: 'value_mean', unit: '' };
    }

    // Month or Raw
    const groups = groupBy(agg as AggRow[], r => `${r.date}|${r.pollutant}`);
    for (const [, grp] of groups) {
      const rep = grp[0] as AggRow;
      tsData.push({
        date: rep.date,
        pollutant_short: shortenPollutant(rep.pollutant),
        value_mean: mean(grp.map(r => (r as AggRow).value_mean).filter(isFinite)),
      });
    }
    tsData.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    return { data: tsData, x_col: 'date', value_col: 'value_mean', unit: '' };
  },

  getComparisonData: async (
    filters: FilterRequest,
    comparisonType: string,
    selectedItems: string[],
    singleFilter?: string
  ) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { data: [], message: 'No data available for comparison' };

    const aggLevel = filters.agg_level ?? 'Raw';
    const agg = aggLevel !== 'Raw' ? aggregateData(filtered, aggLevel) : filtered.map(r => ({ ...r, value_mean: r.value }));

    let comp;
    if (comparisonType === 'boroughs') {
      const boroughSet = new Set(selectedItems);
      comp = (agg as AggRow[]).filter(r => boroughSet.has(r.borough) && r.pollutant === singleFilter);
    } else {
      const pollSet = new Set(selectedItems);
      if (!singleFilter || singleFilter === 'All') {
        comp = (agg as AggRow[]).filter(r => pollSet.has(r.pollutant));
      } else {
        comp = (agg as AggRow[]).filter(r => pollSet.has(r.pollutant) && r.borough === singleFilter);
      }
    }

    const valueCol = aggLevel !== 'Raw' ? 'value_mean' : 'value';
    return { data: comp.map(r => ({ ...r, unit: '' })), value_col: valueCol, unit: '' };
  },

  getAQI: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters).filter(r => r.borough !== 'All');
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    const byPollutant = groupBy(filtered, r => r.pollutant);
    const aqiData = [...byPollutant.entries()].map(([pollutant, grp]) => {
      const avg = mean(grp.map(r => r.value).filter(isFinite));
      const result = calculateAQI(pollutant, avg);
      return { ...result, avg_value: avg, unit: '' };
    });

    return { aqi_data: aqiData };
  },

  getTrendAnalysis: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    const aggLevel = filters.agg_level ?? 'Season';
    const agg = aggLevel !== 'Raw' ? aggregateData(filtered, aggLevel) : filtered.map(r => ({ ...r, value_mean: r.value }));

    const byPollutant = groupBy(agg as AggRow[], r => r.pollutant);
    const trends = [];

    for (const [pollutant, grp] of byPollutant) {
      const yearlyGroups = groupBy(grp, r => String(r.year));
      const yearly = [...yearlyGroups.entries()]
        .map(([y, g]) => ({ year: parseInt(y), val: mean(g.map(r => r.value_mean).filter(isFinite)) }))
        .filter(e => isFinite(e.val))
        .sort((a, b) => a.year - b.year);

      if (yearly.length < 2) continue;

      const xs = yearly.map(e => e.year);
      const ys = yearly.map(e => e.val);
      const { slope, r2, pValue } = linregress(xs, ys);
      const pct_change = ys[0] ? ((ys[ys.length - 1] - ys[0]) / ys[0]) * 100 : 0;
      const significant = pValue < 0.05;
      const direction = significant ? (slope > 0 ? 'increasing' : 'decreasing') : 'stable';

      trends.push({
        pollutant, years: xs, values: ys, slope, r_squared: r2, p_value: pValue,
        significant, direction, trend_icon: direction === 'increasing' ? '↑' : direction === 'decreasing' ? '↓' : '→',
        pct_change, first_year: xs[0], last_year: xs[xs.length - 1],
      });
    }

    return { trends };
  },

  getSeasonalPatterns: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    const byPollutant = groupBy(filtered, r => r.pollutant);
    const seasonal_patterns = [];

    for (const [pollutant, grp] of byPollutant) {
      const bySeason = groupBy(grp, r => r.season);
      const seasons = [...bySeason.entries()].map(([season, sg]) => {
        const vals = sg.map(r => r.value).filter(isFinite);
        return { season, avg_value: mean(vals), std_value: stddev(vals), count: vals.length };
      });

      if (!seasons.length) continue;
      const STANDARD_SEASONS = new Set(['Winter', 'Spring', 'Summer', 'Fall']);
      const standardSeasons = seasons.filter(s => STANDARD_SEASONS.has(s.season));
      const candidates = standardSeasons.length ? standardSeasons : seasons;
      const worst_season = candidates.reduce((a, b) => a.avg_value > b.avg_value ? a : b).season;
      const best_season = candidates.reduce((a, b) => a.avg_value < b.avg_value ? a : b).season;
      seasonal_patterns.push({ pollutant, seasons, worst_season, best_season, unit: '' });
    }

    return { seasonal_patterns };
  },

  getCorrelationAnalysis: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters).filter(r => r.borough !== 'All');
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    // Build pivot: time_key → pollutant → value
    const pivot = new Map<string, Map<string, number[]>>();
    for (const r of filtered) {
      const key = r.date ? `${r.date}_${r.borough ?? 'All'}` : `${r.year}_${r.season}_${r.borough ?? 'All'}`;
      if (!pivot.has(key)) pivot.set(key, new Map());
      const cell = pivot.get(key)!;
      if (!cell.has(r.pollutant)) cell.set(r.pollutant, []);
      cell.get(r.pollutant)!.push(r.value);
    }

    // Collect mean per (time_key, pollutant)
    const pollutants = [...new Set(filtered.map(r => r.pollutant))].sort();
    const vectors: Record<string, number[]> = {};
    for (const p of pollutants) vectors[p] = [];

    for (const [, cell] of pivot) {
      for (const p of pollutants) {
        const vals = cell.get(p);
        vectors[p].push(vals ? mean(vals) : NaN);
      }
    }

    // Build correlation matrix
    const corrMatrix: Record<string, Record<string, number>> = {};
    for (const p of pollutants) corrMatrix[p] = {};

    const correlations: { pollutant1: string; pollutant2: string; correlation: number; strength: string }[] = [];

    for (let i = 0; i < pollutants.length; i++) {
      for (let j = 0; j < pollutants.length; j++) {
        const p1 = pollutants[i], p2 = pollutants[j];
        // pairwise deletion: only use indices where both are defined
        const pairs = vectors[p1]
          .map((v, k) => [v, vectors[p2][k]] as [number, number])
          .filter(([a, b]) => isFinite(a) && isFinite(b));

        const corr = pairs.length >= 2 ? pearson(pairs.map(x => x[0]), pairs.map(x => x[1])) : 0;
        corrMatrix[p1][p2] = corr;

        if (i < j && isFinite(corr)) {
          correlations.push({
            pollutant1: p1, pollutant2: p2, correlation: corr,
            strength: Math.abs(corr) > 0.7 ? 'strong' : Math.abs(corr) > 0.4 ? 'moderate' : 'weak',
          });
        }
      }
    }

    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    return { correlation_matrix: corrMatrix, pollutants, correlations };
  },

  exportData: async (filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, filters);
    const aggLevel = filters.agg_level ?? 'Raw';
    const data = aggLevel !== 'Raw' ? aggregateData(filtered, aggLevel) : filtered;
    return { data, count: data.length };
  },

  getYearlyComparison: async (pollutant: string, selectedYears: number[], filters: FilterRequest) => {
    const rows = await getData();
    const filtered = filterData(rows, { ...filters, pollutants: [pollutant] });
    if (!filtered.length) return { error: 'No data matches the selected filters' };

    const SEASON_ORDER = ['Winter', 'Spring', 'Summer', 'Fall', 'Annual'];
    const seasonsPresent = [...new Set(filtered.map(r => r.season).filter(Boolean))];
    const orderedSeasons = [
      ...SEASON_ORDER.filter(s => seasonsPresent.includes(s)),
      ...seasonsPresent.filter(s => !SEASON_ORDER.includes(s)).sort(),
    ];

    const data: Record<string, Record<string, number>> = {};
    for (const year of selectedYears) {
      const yearRows = filtered.filter(r => r.year === year);
      if (!yearRows.length) continue;
      const seasonData: Record<string, number> = {};
      const bySeason = groupBy(yearRows, r => r.season);
      for (const [season, grp] of bySeason) {
        const v = mean(grp.map(r => r.value).filter(isFinite));
        if (isFinite(v)) seasonData[season] = parseFloat(v.toFixed(3));
      }
      if (Object.keys(seasonData).length) data[String(year)] = seasonData;
    }

    return { pollutant, seasons: orderedSeasons, data };
  },
};
