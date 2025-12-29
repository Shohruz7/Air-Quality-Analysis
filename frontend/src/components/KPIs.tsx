import React from 'react';

interface KPIsProps {
  kpis: {
    mean: number;
    median: number;
    p25: number;
    p75: number;
    p95: number;
    count: number;
  } | null;
  unit: string;
}

export const KPIs: React.FC<KPIsProps> = ({ kpis, unit }) => {
  if (!kpis) return <div>Loading KPIs...</div>;

  return (
    <div className="kpis">
      <h2>Key Metrics</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Mean</div>
          <div className="kpi-value">{kpis.mean.toFixed(2)}</div>
          <div className="kpi-unit">{unit}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Median</div>
          <div className="kpi-value">{kpis.median.toFixed(2)}</div>
          <div className="kpi-unit">{unit}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">25th Percentile</div>
          <div className="kpi-value">{kpis.p25.toFixed(2)}</div>
          <div className="kpi-unit">{unit}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">75th Percentile</div>
          <div className="kpi-value">{kpis.p75.toFixed(2)}</div>
          <div className="kpi-unit">{unit}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">95th Percentile</div>
          <div className="kpi-value">{kpis.p95.toFixed(2)}</div>
          <div className="kpi-unit">{unit}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Records</div>
          <div className="kpi-value">{kpis.count.toLocaleString()}</div>
        </div>
      </div>
      {unit && <small>Units: {unit}</small>}
    </div>
  );
};







