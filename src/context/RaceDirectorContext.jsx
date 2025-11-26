import { createContext, useContext, useMemo, useRef } from 'react';
import { RaceDirector } from '../engine/RaceDirector';

const RaceDirectorContext = createContext(null);

export const RaceDirectorProvider = ({ children }) => {
  const directorRef = useRef();

  if (!directorRef.current) {
    directorRef.current = new RaceDirector();
  }

  const value = useMemo(() => {
    const raceDirector = directorRef.current;

    return {
      raceDirector,
      dispatchers: {
        onPenalty: (carId, penalty) => raceDirector.applyPenalty(carId, penalty),
        onPenaltyClear: (carId, type) => raceDirector.clearPenalty(carId, type),
        onFlagChange: (flag) => raceDirector.setFlagState(flag),
        onSessionControl: (status) => raceDirector.setSessionStatus(status),
        onIncident: (incident) => raceDirector.reportManualIncident(incident),
        onBootstrap: (config) => raceDirector.bootstrapSession(config)
      }
    };
  }, []);

  return (
    <RaceDirectorContext.Provider value={value}>
      {children}
    </RaceDirectorContext.Provider>
  );
};

export const useRaceDirector = () => {
  const context = useContext(RaceDirectorContext);
  if (!context) {
    throw new Error('useRaceDirector must be used within a RaceDirectorProvider');
  }
  return context;
};
