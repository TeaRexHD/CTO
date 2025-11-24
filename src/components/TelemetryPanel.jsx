import DriverStatusList from './DriverStatusList';

const FLAG_LABELS = {
  green: 'GREEN FLAG',
  yellow: 'YELLOW FLAG',
  red: 'RED FLAG',
  blue: 'BLUE FLAG'
};

const TelemetryPanel = ({ data }) => {
  const flag = data?.raceFlag || 'green';
  const updatedLabel = data
    ? new Date(data.updatedAt).toLocaleTimeString('en-US', { minute: '2-digit', second: '2-digit' })
    : '--:--';

  return (
    <div className="telemetry-panel" aria-live="polite">
      <div className="telemetry-panel__header">
        <div>
          <p className="telemetry-panel__title">FIA Telemetry</p>
          <span className="telemetry-panel__subtitle">
            {data ? `Last update ${updatedLabel}` : 'Initializing telemetry feed…'}
          </span>
        </div>
        <div className={`flag-chip ${flag}`}>
          {FLAG_LABELS[flag] || flag.toUpperCase()}
        </div>
      </div>
      <DriverStatusList drivers={data?.drivers ?? []} />
    </div>
  );
};

export default TelemetryPanel;
