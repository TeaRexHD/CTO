import { useEffect, useMemo, useState } from 'react';

const DEFAULT_SESSION = {
  lap: 1,
  totalLaps: 58,
  weather: 'Clear',
  flagState: 'GREEN',
  safetyCarMode: 'OFF',
  sessionPhase: 'Race',
  safetyCarActive: false,
  currentLapTime: 0,
  totalRaceTime: 0
};

const TICKER_LIMIT = 20;

const clampTicker = (entries) => entries.slice(-TICKER_LIMIT);

const kmMarkerFromPosition = (position) => {
  if (!position) return null;
  const distance = Math.sqrt(position.x * position.x + position.z * position.z);
  const km = Math.max(distance / 1000, 0);
  return `${km.toFixed(2)} km`;
};

const toTitle = (value = '') => value
  .split(/[-_\s]/)
  .filter(Boolean)
  .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
  .join(' ');

const buildIncidentEntry = (incident) => {
  const otherCarId = incident.metadata?.otherCarId;
  const carLabel = typeof incident.carId === 'number' ? `Car ${incident.carId + 1}` : 'Track';
  const otherCarLabel = typeof otherCarId === 'number' ? ` vs Car ${otherCarId + 1}` : '';
  const label = `${incident.severity} ${toTitle(incident.type)}`;
  const message = `${label} - ${carLabel}${otherCarLabel}`;

  return {
    id: incident.id,
    type: 'incident',
    severity: incident.severity,
    timestamp: incident.timestamp,
    location: incident.location,
    kmMarker: kmMarkerFromPosition(incident.metadata?.position),
    message
  };
};

const buildDecisionEntry = (decision) => {
  const label = toTitle(decision.type || 'decision');
  const message = decision.metadata?.message || `Race control: ${label}`;
  const location = decision.metadata?.location || 'Race Control';

  return {
    id: decision.id,
    type: 'decision',
    severity: decision.metadata?.severity || 'Info',
    timestamp: decision.timestamp ?? 0,
    location,
    kmMarker: kmMarkerFromPosition(decision.metadata?.position),
    message: `${message} (${decision.metadata?.flagState || label})`
  };
};

export default function useRaceTelemetry(raceDirector) {
  const [telemetryMap, setTelemetryMap] = useState({});
  const [session, setSession] = useState({ ...DEFAULT_SESSION });
  const [ticker, setTicker] = useState([]);

  useEffect(() => {
    if (!raceDirector) {
      setTelemetryMap({});
      setSession({ ...DEFAULT_SESSION });
      setTicker([]);
      return undefined;
    }

    setTelemetryMap(raceDirector.getAllTelemetry ? raceDirector.getAllTelemetry() : {});
    setSession(raceDirector.getSessionState ? raceDirector.getSessionState() : { ...DEFAULT_SESSION });

    const recentIncidents = raceDirector.getRecentIncidents ? raceDirector.getRecentIncidents(TICKER_LIMIT) : [];
    const recentDecisions = raceDirector.getRecentDecisions ? raceDirector.getRecentDecisions(TICKER_LIMIT) : [];
    const initialTicker = [...recentIncidents.map(buildIncidentEntry), ...recentDecisions.map(buildDecisionEntry)]
      .sort((a, b) => a.timestamp - b.timestamp);
    setTicker(clampTicker(initialTicker));

    const unsubTelem = raceDirector.subscribe('telemetry', ({ carId, telemetry }) => {
      setTelemetryMap(prev => ({
        ...prev,
        [carId]: telemetry
      }));
    });

    const unsubIncident = raceDirector.subscribe('incident', (incident) => {
      setTicker(prev => clampTicker([...prev, buildIncidentEntry(incident)]));
    });

    const unsubDecision = raceDirector.subscribe('decision', (decision) => {
      setTicker(prev => clampTicker([...prev, buildDecisionEntry(decision)]));
    });

    const unsubSession = raceDirector.subscribe('session', setSession);

    return () => {
      unsubTelem?.();
      unsubIncident?.();
      unsubDecision?.();
      unsubSession?.();
    };
  }, [raceDirector]);

  const leaderboard = useMemo(() => {
    const entries = Object.values(telemetryMap);
    if (!entries.length) return [];

    const sorted = [...entries].sort((a, b) => {
      if (b.lap !== a.lap) return b.lap - a.lap;
      return (b.lastWaypointIndex || 0) - (a.lastWaypointIndex || 0);
    });

    return sorted.map((entry, index) => ({
      carId: entry.carId,
      position: index + 1,
      lap: entry.lap,
      displayLap: Math.min(entry.lap + 1, session.totalLaps),
      sectorIndex: entry.sectorIndex,
      sectorTimes: entry.sectorTimes,
      currentSectorTime: entry.currentSectorTime,
      speed: entry.speed,
      gapToLeader: index === 0 ? 0 : entry.gapToLeader,
      tyreHealth: entry.tyreHealth,
      trackLimitViolations: entry.trackLimitViolations || 0
    }));
  }, [telemetryMap, session.totalLaps]);

  return {
    session,
    leaderboard,
    telemetryByCar: telemetryMap,
    ticker
  };
}
