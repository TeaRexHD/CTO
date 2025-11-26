const FALLBACK_SESSION = {
  lap: 1,
  totalLaps: 58,
  weather: 'Clear',
  flagState: 'GREEN',
  safetyCarMode: 'OFF',
  sessionPhase: 'Race'
};

const formatLapLabel = (lap, total) => `Lap ${Math.max(lap, 1)}/${total}`;

const SessionHeader = ({ session = FALLBACK_SESSION, raceDirector }) => {
  const disableControls = !raceDirector;

  const handleDecision = (type, metadata = {}) => {
    if (!raceDirector) return;
    raceDirector.applyRaceControlDecision(type, metadata);
  };

  const flagState = session.flagState || 'GREEN';
  const flagClass = flagState.toLowerCase();
  const safetyLabel = session.safetyCarMode === 'OFF' ? 'Green' : session.safetyCarMode;
  const weather = session.weather || FALLBACK_SESSION.weather;
  const lapValue = session.lap ?? FALLBACK_SESSION.lap;
  const totalLaps = session.totalLaps ?? FALLBACK_SESSION.totalLaps;
  const lapLabel = formatLapLabel(lapValue, totalLaps);
  const sessionPhase = session.sessionPhase || FALLBACK_SESSION.sessionPhase;

  return (
    <div className="session-header hud-card">
      <div className="panel-header">
        <span>Broadcast HUD</span>
        <span className="panel-subtitle">{sessionPhase}</span>
      </div>
      <div className="session-meta">
        <div className="lap">{lapLabel}</div>
        <div className="weather">{weather}</div>
        <div className={`flag badge flag-${flagClass}`}>{flagState}</div>
        <div className="safety">SC: {safetyLabel}</div>
      </div>
      <div className="session-controls">
        <span>Race control</span>
        <div className="control-buttons">
          <button
            type="button"
            onClick={() => handleDecision('SAFETY_CAR_DEPLOY', { message: 'Safety car deployed' })}
            disabled={disableControls}
          >
            Deploy SC
          </button>
          <button
            type="button"
            onClick={() => handleDecision('VIRTUAL_SC', { message: 'Virtual safety car active' })}
            disabled={disableControls}
          >
            Virtual SC
          </button>
          <button
            type="button"
            onClick={() => handleDecision('SAFETY_CAR_RETURN', { message: 'Race resumes green' })}
            disabled={disableControls}
          >
            Resume green
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionHeader;
