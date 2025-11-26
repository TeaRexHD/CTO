import { useEffect, useMemo, useState } from 'react';

const GAP_NORMALIZER = 20;

const formatGap = (gap) => {
  if (!gap || gap <= 0.01) return '0.0s';
  return `${(gap / GAP_NORMALIZER).toFixed(1)}s`;
};

const formatSpeed = (speed) => {
  if (typeof speed !== 'number') return '--';
  const kmh = Math.max(speed * 3.6, 0);
  return `${Math.round(kmh)} km/h`;
};

const formatTime = (time) => {
  if (typeof time !== 'number' || Number.isNaN(time)) return '--';
  return `${time.toFixed(2)}s`;
};

const TelemetryPanel = ({ leaderboard = [] }) => {
  const [focusedCarId, setFocusedCarId] = useState(null);

  useEffect(() => {
    if (!leaderboard.length) {
      setFocusedCarId(null);
      return;
    }

    if (!focusedCarId || !leaderboard.some(entry => entry.carId === focusedCarId)) {
      setFocusedCarId(leaderboard[0].carId);
    }
  }, [leaderboard, focusedCarId]);

  const focusedCar = useMemo(
    () => leaderboard.find(entry => entry.carId === focusedCarId) || null,
    [leaderboard, focusedCarId]
  );

  const sectorDisplay = useMemo(() => {
    if (!focusedCar) return [];
    const sectors = focusedCar.sectorTimes || [0, 0, 0];
    return [0, 1, 2].map(index => {
      const isCurrent = index === focusedCar.sectorIndex;
      const rawValue = isCurrent ? focusedCar.currentSectorTime : sectors[index] || 0;
      return {
        index,
        value: formatTime(rawValue)
      };
    });
  }, [focusedCar]);

  return (
    <div className="telemetry-panel hud-card">
      <div className="panel-header">
        <span>Telemetry</span>
        <span className="panel-subtitle">Live leaderboard</span>
      </div>
      <div className="leaderboard">
        {leaderboard.slice(0, 10).map(entry => (
          <button
            type="button"
            key={entry.carId}
            className={`leaderboard-row${entry.carId === focusedCarId ? ' active' : ''}`}
            onClick={() => setFocusedCarId(entry.carId)}
          >
            <span className="position">{String(entry.position).padStart(2, '0')}</span>
            <span className="car-name">Car {entry.carId + 1}</span>
            <span className="lap">Lap {entry.displayLap}</span>
            <span className="gap">{entry.position === 1 ? 'Leader' : `+${formatGap(entry.gapToLeader)}`}</span>
            <span className="tyre">{Math.round(entry.tyreHealth)}%</span>
          </button>
        ))}
        {!leaderboard.length && (
          <div className="leaderboard-empty">Telemetry warming up…</div>
        )}
      </div>
      {focusedCar && (
        <div className="car-detail">
          <div className="detail-header">
            <span>Car {focusedCar.carId + 1}</span>
            <span>Sector {Math.min(focusedCar.sectorIndex + 1, 3)}</span>
          </div>
          <div className="car-detail-grid">
            <div className="metric">
              <span className="metric-label">Speed</span>
              <span className="metric-value">{formatSpeed(focusedCar.speed)}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Gap</span>
              <span className="metric-value">
                {focusedCar.position === 1 ? 'Leader' : `+${formatGap(focusedCar.gapToLeader)}`}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Tyre</span>
              <span className="metric-value">{Math.round(focusedCar.tyreHealth)}%</span>
            </div>
            <div className="metric">
              <span className="metric-label">Track</span>
              <span className="metric-value">{focusedCar.trackLimitViolations ?? 0}</span>
            </div>
          </div>
          <div className="sector-times">
            {sectorDisplay.map(sector => (
              <div key={sector.index} className="sector">
                <span>S{sector.index + 1}</span>
                <span>{sector.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TelemetryPanel;
