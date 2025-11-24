export class RaceDirector {
  constructor() {
    this.listeners = [];
    this.incidents = [];
    this.teamRadios = [];
    this.collisionTracker = new Map();
    
    this.raceState = {
      safetyCarActive: false,
      virtualSafetyCar: false,
      sessionPaused: false,
      sessionAborted: false,
      safetyCarLapsRemaining: 0,
      targetSafetyCarSpeed: 80,
      targetVSCSpeed: 100
    };
    
    this.penaltyQueue = [];
    this.activeInvestigations = new Map();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  emit(event, data) {
    this.listeners.forEach(callback => callback(event, data));
  }

  recordIncident(type, severity, message, carId = null) {
    const incident = {
      type,
      severity,
      message,
      carId,
      timestamp: Date.now(),
      id: `${type}-${Date.now()}-${Math.random()}`
    };
    
    this.incidents.push(incident);
    this.emit('incident', incident);
    
    if ((severity === 'critical' || severity === 'warning') && carId !== null) {
      this.generateTeamRadio(type, message, carId);
    }
    
    return incident;
  }

  generateTeamRadio(type, message, carId) {
    const radio = {
      carId,
      message,
      type,
      timestamp: Date.now(),
      id: `radio-${Date.now()}-${Math.random()}`
    };
    
    this.teamRadios.push(radio);
    this.emit('teamRadio', radio);
  }

  checkCollision(car1, car2, collisionOccurred) {
    if (!collisionOccurred) return;
    
    const collisionKey = `${Math.min(car1.id, car2.id)}-${Math.max(car1.id, car2.id)}`;
    const lastCollision = this.collisionTracker.get(collisionKey);
    const now = Date.now();
    
    if (!lastCollision || now - lastCollision > 1000) {
      this.collisionTracker.set(collisionKey, now);
      this.recordIncident(
        'collision',
        'warning',
        `Contact between Car #${car1.id} and Car #${car2.id}`,
        car1.id
      );
    }
  }

  checkTrackBoundary(car, offTrack) {
    if (!offTrack) return;
    
    const lastOffTrack = car.lastOffTrackIncident || 0;
    const now = Date.now();
    
    if (now - lastOffTrack > 2000) {
      car.lastOffTrackIncident = now;
      this.recordIncident(
        'track-limits',
        'info',
        `Car #${car.id} exceeded track limits`,
        car.id
      );
    }
  }

  clearOldData() {
    const now = Date.now();
    const maxAge = 30000;
    
    this.incidents = this.incidents.filter(inc => now - inc.timestamp < maxAge);
    this.teamRadios = this.teamRadios.filter(radio => now - radio.timestamp < maxAge);
    
    const oldKeys = [];
    for (const [key, timestamp] of this.collisionTracker.entries()) {
      if (now - timestamp > 5000) oldKeys.push(key);
    }
    oldKeys.forEach(key => this.collisionTracker.delete(key));
  }

  applyPenalty(carId, penaltyType, duration = 0) {
    this.penaltyQueue.push({
      carId,
      type: penaltyType,
      duration,
      timestamp: Date.now(),
      applied: false
    });
    
    const penaltyMessages = {
      'time-penalty': `${duration} second time penalty`,
      'drive-through': 'Drive-through penalty',
      'stop-go': `${duration} second stop-go penalty`,
      'disqualification': 'Disqualified from race',
      'warning': 'Official warning issued'
    };
    
    const message = penaltyMessages[penaltyType] || 'Penalty applied';
    
    this.recordIncident(
      'penalty',
      penaltyType === 'disqualification' ? 'critical' : 'warning',
      `Car #${carId}: ${message}`,
      carId
    );
    
    this.generateTeamRadio('penalty', message, carId);
  }

  processPenalties(cars) {
    for (const penalty of this.penaltyQueue) {
      if (penalty.applied) continue;
      
      const car = cars.find(c => c.id === penalty.carId);
      if (!car) continue;
      
      switch (penalty.type) {
        case 'time-penalty':
          if (!car.timePenalties) car.timePenalties = 0;
          car.timePenalties += penalty.duration;
          penalty.applied = true;
          break;
          
        case 'drive-through':
          if (!car.penaltyState || car.penaltyState.type === 'none') {
            car.penaltyState = {
              type: 'drive-through',
              active: true,
              startTime: Date.now(),
              pitLaneSpeed: 60,
              pitEntryTriggered: false
            };
            penalty.applied = true;
          }
          break;
          
        case 'stop-go':
          if (!car.penaltyState || car.penaltyState.type === 'none') {
            car.penaltyState = {
              type: 'stop-go',
              duration: penalty.duration,
              active: true,
              startTime: null,
              stopComplete: false,
              pitLaneSpeed: 60,
              pitEntryTriggered: false
            };
            penalty.applied = true;
          }
          break;
          
        case 'disqualification':
          car.disqualified = true;
          car.velocity.set(0, 0, 0);
          car.controls = { throttle: 0, brake: 0, steering: 0 };
          penalty.applied = true;
          break;
          
        case 'warning':
          if (!car.warnings) car.warnings = 0;
          car.warnings++;
          penalty.applied = true;
          break;
      }
    }
    
    this.penaltyQueue = this.penaltyQueue.filter(p => !p.applied);
  }

  updateCarPenalties(car) {
    if (!car.penaltyState || !car.penaltyState.active) return;
    
    const state = car.penaltyState;
    
    if (state.type === 'drive-through') {
      if (!state.pitEntryTriggered) {
        state.pitEntryTriggered = true;
        car.servingPenalty = true;
        this.generateTeamRadio('pit', 'Box this lap for drive-through penalty', car.id);
      }
      
      if (Date.now() - state.startTime > 15000) {
        state.active = false;
        car.servingPenalty = false;
        car.penaltyState = { type: 'none' };
        this.generateTeamRadio('pit', 'Drive-through penalty complete', car.id);
      }
    }
    
    if (state.type === 'stop-go') {
      if (!state.pitEntryTriggered) {
        state.pitEntryTriggered = true;
        car.servingPenalty = true;
        this.generateTeamRadio('pit', `Box this lap for ${state.duration} second stop-go`, car.id);
      }
      
      if (state.startTime === null) {
        state.startTime = Date.now();
      }
      
      if (Date.now() - state.startTime > (state.duration * 1000 + 15000)) {
        state.active = false;
        car.servingPenalty = false;
        car.penaltyState = { type: 'none' };
        this.generateTeamRadio('pit', 'Stop-go penalty complete', car.id);
      }
    }
  }

  issueBlueFlag(carId, lappingCarId) {
    const existingFlag = this.activeInvestigations.get(`blue-flag-${carId}`);
    if (existingFlag && Date.now() - existingFlag < 3000) return;
    
    this.activeInvestigations.set(`blue-flag-${carId}`, Date.now());
    this.recordIncident(
      'blue-flag',
      'info',
      `Blue flag shown to Car #${carId} for Car #${lappingCarId}`,
      carId
    );
    this.generateTeamRadio('flag', 'Blue flags, let them pass', carId);
  }

  startInvestigation(carId, reason) {
    this.activeInvestigations.set(`investigation-${carId}`, {
      carId,
      reason,
      startTime: Date.now()
    });
    
    this.recordIncident(
      'investigation',
      'warning',
      `Car #${carId} under investigation: ${reason}`,
      carId
    );
    
    this.generateTeamRadio('investigation', `Under investigation for ${reason}`, carId);
  }

  deploySafetyCar(laps = 3) {
    this.raceState.safetyCarActive = true;
    this.raceState.virtualSafetyCar = false;
    this.raceState.safetyCarLapsRemaining = laps;
    
    this.recordIncident(
      'safety-car',
      'critical',
      'Safety Car deployed'
    );
    
    this.generateTeamRadio('safety-car', 'Safety Car deployed, reduce speed', null);
  }

  deployVirtualSafetyCar() {
    this.raceState.virtualSafetyCar = true;
    this.raceState.safetyCarActive = false;
    
    this.recordIncident(
      'vsc',
      'critical',
      'Virtual Safety Car deployed'
    );
    
    this.generateTeamRadio('vsc', 'Virtual Safety Car, reduce to delta time', null);
  }

  withdrawSafetyCar() {
    if (this.raceState.safetyCarActive) {
      this.raceState.safetyCarActive = false;
      this.raceState.safetyCarLapsRemaining = 0;
      
      this.recordIncident(
        'safety-car',
        'info',
        'Safety Car withdrawn, racing resumed'
      );
      
      this.generateTeamRadio('safety-car', 'Safety Car in this lap', null);
    }
    
    if (this.raceState.virtualSafetyCar) {
      this.raceState.virtualSafetyCar = false;
      
      this.recordIncident(
        'vsc',
        'info',
        'Virtual Safety Car ended'
      );
      
      this.generateTeamRadio('vsc', 'VSC ending, prepare to race', null);
    }
  }

  updateSafetyCarLaps() {
    if (this.raceState.safetyCarActive && this.raceState.safetyCarLapsRemaining > 0) {
      this.raceState.safetyCarLapsRemaining--;
      
      if (this.raceState.safetyCarLapsRemaining === 1) {
        this.generateTeamRadio('safety-car', 'Safety Car in this lap', null);
      }
      
      if (this.raceState.safetyCarLapsRemaining === 0) {
        this.withdrawSafetyCar();
      }
    }
  }

  pauseSession() {
    this.raceState.sessionPaused = true;
    this.recordIncident('session', 'critical', 'Session paused');
  }

  resumeSession() {
    this.raceState.sessionPaused = false;
    this.recordIncident('session', 'info', 'Session resumed');
  }

  abortSession() {
    this.raceState.sessionAborted = true;
    this.raceState.sessionPaused = true;
    this.recordIncident('session', 'critical', 'Session aborted');
  }

  isSessionPaused() {
    return this.raceState.sessionPaused;
  }

  isSessionAborted() {
    return this.raceState.sessionAborted;
  }

  isSafetyCarActive() {
    return this.raceState.safetyCarActive;
  }

  isVirtualSafetyCarActive() {
    return this.raceState.virtualSafetyCar;
  }

  getSafetyCarSpeed() {
    if (this.raceState.safetyCarActive) {
      return this.raceState.targetSafetyCarSpeed;
    }
    if (this.raceState.virtualSafetyCar) {
      return this.raceState.targetVSCSpeed;
    }
    return null;
  }

  handleTechnicalViolation(carId, violation) {
    this.startInvestigation(carId, `Technical: ${violation}`);
    this.recordIncident(
      'technical',
      'warning',
      `Car #${carId}: Technical violation - ${violation}`,
      carId
    );
  }

  handleParkFerme(carId, issue) {
    this.recordIncident(
      'park-ferme',
      'warning',
      `Car #${carId}: Parc fermé issue - ${issue}`,
      carId
    );
    this.startInvestigation(carId, `Parc fermé: ${issue}`);
  }

  handleProtest(carId, protestDetails) {
    this.recordIncident(
      'protest',
      'info',
      `Protest lodged against Car #${carId}: ${protestDetails}`,
      carId
    );
    this.startInvestigation(carId, protestDetails);
  }

  update() {
    this.clearOldData();
  }
}
