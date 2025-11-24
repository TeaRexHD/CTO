const TYRE_BADGES = {
  Soft: 'S',
  Medium: 'M',
  Hard: 'H'
};

const SEVERITY_ICONS = {
  critical: '✖',
  warning: '⚠',
  info: 'ℹ'
};

const toHexColor = (value) => {
  if (typeof value !== 'number') return '#ffffff';
  return `#${value.toString(16).padStart(6, '0')}`;
};

const formatGap = (gap) => {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return '—';
  if (gap <= 0) return 'Leader';
  return `+${gap.toFixed(3)}s`;
};

const formatDelta = (delta) => {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(3)}s`;
};

const sectorClass = (delta) => {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '';
  if (delta <= -0.02) return 'sector-pill--fast';
  if (delta >= 0.02) return 'sector-pill--slow';
  return 'sector-pill--even';
};

const penaltyIcon = (penalty) => SEVERITY_ICONS[penalty.severity] || '•';

const DriverStatusList = ({ drivers }) => {
  if (!drivers || drivers.length === 0) {
    return (
      <div className="driver-status-empty">
        <p>Collecting telemetry data…</p>
      </div>
    );
  }

  return (
    <div className="driver-status-list">
      <div className="driver-status-header">
        <span>#</span>
        <span>Driver</span>
        <span>Gap</span>
        <span>Sectors</span>
        <span>Tyre</span>
        <span>Pen</span>
        <span>Flag</span>
      </div>
      <div className="driver-status-scroll">
        {drivers.map((driver) => {
          const penalties = (driver.penalties || []).slice(0, 2);
          const sectors = driver.sectorDeltas && driver.sectorDeltas.length === 3
            ? driver.sectorDeltas
            : [null, null, null];

          return (
            <div className="driver-row" key={driver.id}>
              <div className="driver-cell driver-position">{driver.position}</div>
              <div className="driver-cell driver-identity">
                <span
                  className="driver-code"
                  style={{ borderColor: toHexColor(driver.color) }}
                >
                  {driver.code}
                </span>
                <span className="driver-name">{driver.name}</span>
              </div>
              <div className="driver-cell driver-gap">{formatGap(driver.gapToLeader)}</div>
              <div className="driver-cell driver-sectors">
                {sectors.map((delta, index) => (
                  <span
                    key={`${driver.id}-sector-${index}`}
                    className={`sector-pill ${sectorClass(delta)}`}
                  >
                    S{index + 1}
                    <small>{formatDelta(delta)}</small>
                  </span>
                ))}
              </div>
              <div className="driver-cell driver-tyre">
                <span className={`tyre-chip ${driver.tyreCompound?.toLowerCase() || 'soft'}`}>
                  {TYRE_BADGES[driver.tyreCompound] || driver.tyreCompound?.[0] || 'S'}
                </span>
              </div>
              <div className="driver-cell driver-penalties">
                {penalties.length > 0 ? (
                  penalties.map((penalty, idx) => (
                    <span
                      key={`${driver.id}-penalty-${penalty.type}-${idx}`}
                      className={`penalty-icon ${penalty.severity || 'warning'}`}
                      title={penalty.label}
                    >
                      {penaltyIcon(penalty)}
                    </span>
                  ))
                ) : (
                  <span className="penalty-icon none" title="No active penalties">—</span>
                )}
              </div>
              <span className={`flag-dot ${driver.flag || 'green'}`} title={`${driver.flag || 'green'} flag`} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DriverStatusList;
