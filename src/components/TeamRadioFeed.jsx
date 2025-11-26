import { useEffect, useState } from 'react';

const formatTime = (seconds = 0) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
  const mins = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (safeSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

const TeamRadioFeed = ({ raceDirector }) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!raceDirector) {
      setMessages([]);
      return undefined;
    }

    const unsubscribe = raceDirector.subscribe('teamRadio', (transmission) => {
      setMessages(prev => {
        const next = [transmission, ...prev];
        return next.slice(0, 10);
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [raceDirector]);

  const latestId = messages[0]?.id || 'silent-radio';

  return (
    <div className="team-radio-feed hud-card" aria-live="polite" aria-label="Latest team radio messages">
      <div className={`team-radio-beep ${messages.length ? 'pulse' : ''}`} key={latestId} aria-hidden="true">
        🔊
        <span>Team Radio</span>
      </div>
      <ul>
        {messages.length === 0 && (
          <li className="transmission placeholder">
            <div className="message">Awaiting team communications...</div>
          </li>
        )}
        {messages.map((message) => (
          <li key={message.id} className={`transmission ${message.tone || 'calm'}`}>
            <div className="timestamp">{formatTime(message.timestamp)}</div>
            <div className="message">{message.message}</div>
          </li>
        ))}
      </ul>
      <span className="sr-only">
        {messages[0]
          ? `New radio at ${formatTime(messages[0].timestamp)}: ${messages[0].message}`
          : 'No team radio messages yet'}
      </span>
    </div>
  );
};

export default TeamRadioFeed;
