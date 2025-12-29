import './Documentation.css';

export function Documentation() {
  return (
    <div className="documentation">
      <div className="doc-header">
        <h2>User Guide</h2>
        <p>Learn how to use the NYC Air Quality Dashboard</p>
      </div>

      <div className="doc-section">
        <h3>Map View</h3>
        <p>
          Visualize air quality data on an interactive map of NYC. Each marker represents a monitoring station.
          Click on markers to see detailed information about pollutants at that location. Use the filters at the top
          to focus on specific pollutants, boroughs, or time periods.
        </p>
      </div>

      <div className="doc-section">
        <h3>Time Series & Heatmap</h3>
        <p>
          Explore how air quality changes over time. The time series chart shows pollutant levels across different dates,
          while the heatmap provides a color-coded view of values. This helps identify patterns, spikes, and trends
          in air quality measurements.
        </p>
      </div>

      <div className="doc-section">
        <h3>Comparison</h3>
        <p>
          Compare air quality across different boroughs, pollutants, or time periods side-by-side. This view helps
          identify which areas have better or worse air quality and how different pollutants compare to each other.
        </p>
      </div>

      <div className="doc-section">
        <h3>Analysis</h3>
        <p>
          Advanced analytical tools to understand air quality patterns, trends, and relationships. The analysis section
          includes five specialized views:
        </p>

        <div className="analysis-subsection">
          <h4>AQI & Health</h4>
          <p>
            <strong>What it does:</strong> Calculates the Air Quality Index (AQI) for each pollutant and provides
            health recommendations based on the current levels.
          </p>
          <p>
            <strong>How it works:</strong> AQI converts pollutant concentrations into a standardized index (0-500).
            The system uses EPA breakpoints to categorize air quality as Good (0-50), Moderate (51-100), Unhealthy for
            Sensitive Groups (101-150), Unhealthy (151-200), Very Unhealthy (201-300), or Hazardous (301-500).
          </p>
          <p>
            <strong>What to look for:</strong> Green indicates good air quality, while red/orange suggests health risks.
            Follow the recommendations provided for each category.
          </p>
        </div>

        <div className="analysis-subsection">
          <h4>Trends</h4>
          <p>
            <strong>What it does:</strong> Analyzes whether pollutant levels are increasing, decreasing, or staying
            stable over time.
          </p>
          <p>
            <strong>How it works:</strong> Uses linear regression to fit a trend line through the data points.
            The analysis calculates:
          </p>
          <ul>
            <li><strong>Slope:</strong> Rate of change per year (↑ increasing, ↓ decreasing)</li>
            <li><strong>R²:</strong> How well the trend fits the data (0-100%, higher is better)</li>
            <li><strong>P-value:</strong> Statistical significance (&lt; 0.05 means the trend is reliable)</li>
            <li><strong>% Change:</strong> Overall change from first to last year</li>
          </ul>
          <p>
            <strong>What to look for:</strong> A significant decreasing trend (↓) with high R² suggests improving
            air quality. An increasing trend (↑) may indicate worsening conditions.
          </p>
        </div>

        <div className="analysis-subsection">
          <h4>Seasonal Patterns</h4>
          <p>
            <strong>What it does:</strong> Identifies how air quality varies by season (Spring, Summer, Fall, Winter).
          </p>
          <p>
            <strong>How it works:</strong> Calculates average pollutant levels for each season and identifies which
            seasons have the best and worst air quality.
          </p>
          <p>
            <strong>What to look for:</strong> Some pollutants are higher in certain seasons (e.g., ozone in summer,
            PM2.5 in winter). This helps understand seasonal air quality patterns.
          </p>
        </div>

        <div className="analysis-subsection">
          <h4>Correlation</h4>
          <p>
            <strong>What it does:</strong> Measures how different pollutants move together over time.
          </p>
          <p>
            <strong>How it works:</strong> Calculates the Pearson correlation coefficient (r) between pollutant pairs.
            The value ranges from -1.0 to +1.0:
          </p>
          <ul>
            <li><strong>r &gt; 0.7:</strong> Strong positive correlation - pollutants increase/decrease together</li>
            <li><strong>0.4 &lt; r ≤ 0.7:</strong> Moderate correlation - some relationship exists</li>
            <li><strong>r ≤ 0.4:</strong> Weak correlation - pollutants vary independently</li>
            <li><strong>r &lt; 0:</strong> Negative correlation - when one increases, the other decreases</li>
          </ul>
          <p>
            <strong>What to look for:</strong> High correlations suggest pollutants share common sources (e.g., traffic
            emissions). The heatmap shows all correlations visually, with red indicating positive and blue indicating
            negative relationships.
          </p>
          <p className="note">
            <em>Note: Correlation does not mean causation. Pollutants may be correlated because they're affected by
            the same factors (weather, traffic, etc.).</em>
          </p>
        </div>

        <div className="analysis-subsection">
          <h4>Export</h4>
          <p>
            <strong>What it does:</strong> Download filtered air quality data for further analysis.
          </p>
          <p>
            <strong>How it works:</strong> Exports data in CSV or JSON format based on your current filter settings.
            You can also export chart images from the other analysis views.
          </p>
          <p>
            <strong>What to look for:</strong> Use this to save data for reports, share with others, or analyze in
            external tools like Excel or Python.
          </p>
        </div>
      </div>

      <div className="doc-section">
        <h3>Using Filters</h3>
        <p>
          The filter panel at the top of the dashboard lets you customize what data you see:
        </p>
        <ul>
          <li><strong>Date Range:</strong> Select a specific time period to analyze</li>
          <li><strong>Pollutants:</strong> Choose which pollutants to display (e.g., PM2.5, NO2, O3)</li>
          <li><strong>Boroughs:</strong> Focus on specific NYC boroughs</li>
          <li><strong>Aggregation Level:</strong> View data by Day, Month, Season, or Year</li>
          <li><strong>Exclude Outliers:</strong> Remove extreme values that might skew the analysis</li>
        </ul>
      </div>

      <div className="doc-section">
        <h3>Tips</h3>
        <ul>
          <li>Start with broader filters and narrow down based on what you discover</li>
          <li>Use the KPI cards at the top to quickly see summary statistics</li>
          <li>Click on chart elements to see detailed values</li>
          <li>Compare different time periods to see improvements or deterioration</li>
          <li>Check multiple pollutants together to understand overall air quality</li>
        </ul>
      </div>
    </div>
  );
}

