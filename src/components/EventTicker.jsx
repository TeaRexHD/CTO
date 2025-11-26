import { useEffect, useRef } from 'react';

const formatTimestamp = (seconds = 0) => `T+${seconds.toFixed(1)}s`;

const EventTicker = ({ entries = [] }) => {
  const listRef = useRef(null);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [entries]);

  return (
    <div className="event-ticker hud-card">
      <div className="panel-header">
        <span>Event ticker</span>
        <span className="panel-subtitle">Last {Math.min(entries.length, 20)} events</span>
      </div>
      <div className="ticker-list" ref={listRef}>
        {entries.map(entry => (
          <div
            key={entry.id}
            className={`ticker-entry ${entry.type} severity-${(entry.severity || '').toLowerCase()}`}
          >
            <div className="ticker-meta">
              <span className="time">{formatTimestamp(entry.timestamp)}</span>
              <span className="location">{entry.location}</span>
              {entry.kmMarker && <span className="marker">{entry.kmMarker}</span>}
            </div>
            <div className="ticker-message">{entry.message}</div>
          </div>
        ))}
        {!entries.length && <div className="ticker-empty">Waiting for live incidents…</div>}
      </div>
    </div>
  );
};

export default EventTicker;
