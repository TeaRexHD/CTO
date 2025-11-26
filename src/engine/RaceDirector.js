import { TeamRadioManager } from './TeamRadio';

export class RaceDirector {
  constructor() {
    this.raceMeta = {
      lapCount: 1,
      totalLaps: 58,
      currentLapTime: 0,
      weather: 'Clear',
      safetyCarActive: false,
      totalRaceTime: 0,
      flagState: 'GREEN',
      sessionPhase: 'Race',
      safetyCarMode: 'OFF'
    };

    this.carTelemetry = new Map();
    this.incidents = [];
    this.decisions = [];
    this.listeners = new Map();

    this.lastWaypointIndices = new Map();
    this.lapStartTimes = new Map();

    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
    this.incidentCooldown = 2;
    this.incidentChance = 0.002;

    this.flagResetTimer = 0;
    this.weatherChangeTimer = 0;
    this.weatherChangeInterval = 40;
    this.weatherOptions = ['Clear', 'Cloudy', 'Overcast', 'Light Rain'];

    this.safetyCarTimer = null;
    this.teamRadioManager = new TeamRadioManager(this);

    this.emitSessionState();
  }

  initializeCar(carId) {
    this.carTelemetry.set(carId, {
      carId,
      position: { x: 0, y: 0, z: 0 },
      speed: 0,
      lap: 0,
      sectorTimes: [0, 0, 0],
      currentSectorTime: 0,
      sectorIndex: 0,
      gapToLeader: 0,
      tyreHealth: 100,
      penalties: [],
      lastWaypointIndex: 0,
      trackLimitViolations: 0
    });

    this.lastWaypointIndices.set(carId, 0);
    this.lapStartTimes.set(carId, 0);
  }

  updateTelemetry(car, deltaTime, allCars, waypoints) {
    if (!this.carTelemetry.has(car.id)) {
      this.initializeCar(car.id);
    }

    const telemetry = this.carTelemetry.get(car.id);
    const position = car.mesh.position;

    telemetry.position = { x: position.x, y: position.y, z: position.z };
    telemetry.speed = car.getSpeed();
    telemetry.currentSectorTime += deltaTime;
    telemetry.tyreHealth = Math.max(0, telemetry.tyreHealth - deltaTime * 0.5);
    telemetry.lastWaypointIndex = car.waypointIndex;

    this.detectLapCompletion(car, telemetry, waypoints);
    this.updateGapToLeader(telemetry, allCars);

    this.emit('telemetry', { carId: car.id, telemetry: { ...telemetry } });
  }

  detectLapCompletion(car, telemetry, waypoints) {
    const waypointIndex = car.waypointIndex;
    const lastIndex = this.lastWaypointIndices.get(car.id);

    if (waypointIndex < lastIndex && lastIndex > waypoints.length - 5) {
      telemetry.lap++;
      const lapTime = this.incidentThrottleTime - (this.lapStartTimes.get(car.id) || this.incidentThrottleTime);
      this.lapStartTimes.set(car.id, this.incidentThrottleTime);

      if (telemetry.lap > 1) {
        telemetry.sectorTimes[telemetry.sectorIndex] = telemetry.currentSectorTime;
      }

      telemetry.currentSectorTime = 0;
      telemetry.sectorIndex = 0;

      this.updateRaceLapCount(telemetry.lap + 1);

      this.emit('lapCompleted', {
        carId: car.id,
        lap: telemetry.lap,
        time: lapTime
      });
    }

    this.lastWaypointIndices.set(car.id, waypointIndex);
  }

  updateRaceLapCount(lap) {
    const clampedLap = Math.max(1, Math.min(lap, this.raceMeta.totalLaps));
    if (clampedLap > this.raceMeta.lapCount) {
      this.raceMeta.lapCount = clampedLap;
      this.raceMeta.currentLapTime = 0;
      this.emitSessionState();
    }
  }

  updateGapToLeader(telemetry, allCars) {
    if (allCars.length === 0) return;

    const leaderTelemetry = this.carTelemetry.get(allCars[0].id);
    if (leaderTelemetry) {
      const leaderPos = leaderTelemetry.position;
      const gapDistance = Math.sqrt(
        Math.pow(telemetry.position.x - leaderPos.x, 2) +
        Math.pow(telemetry.position.z - leaderPos.z, 2)
      );
      telemetry.gapToLeader = gapDistance;
    }
  }

  checkTrackLimitViolation(car, track) {
    const pos = car.mesh.position;
    const distanceFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

    const outerRadius = track.innerRadius + track.trackWidth;
    const innerRadius = track.innerRadius;

    const isOutOfBounds = distanceFromCenter > outerRadius || distanceFromCenter < innerRadius;

    if (isOutOfBounds) {
      const telemetry = this.carTelemetry.get(car.id);
      if (telemetry) {
        telemetry.trackLimitViolations++;
        if (telemetry.trackLimitViolations % 3 === 0) {
          this.applyPenalty(car.id, 'track-limits', 'Warning', {
            violations: telemetry.trackLimitViolations
          });
        }
      }

      if (Math.random() > 0.7) {
        this.createIncident('track-limits', car, 'Low');
      }
    }

    return isOutOfBounds;
  }

  checkCollisionIncident(car1, car2, collided) {
    if (collided) {
      const rand = Math.random();
      if (rand > 0.6) {
        this.createIncident('collision', car1, 'High', { otherCarId: car2.id });
        this.createIncident('collision', car2, 'High', { otherCarId: car1.id });

        if (Math.random() > 0.5) {
          this.fileProtest(car1.id, car2.id, 'Car ahead forced us off.');
        } else {
          this.fileProtest(car2.id, car1.id, 'Requesting review of that contact.');
        }
      }
    }
  }

  update(deltaTime) {
    this.incidentThrottleTime += deltaTime;
    this.raceMeta.totalRaceTime += deltaTime;
    this.raceMeta.currentLapTime += deltaTime;
    this.weatherChangeTimer += deltaTime;

    if (this.flagResetTimer > 0 && this.raceMeta.safetyCarMode === 'OFF') {
      this.flagResetTimer -= deltaTime;
      if (this.flagResetTimer <= 0 && this.raceMeta.flagState !== 'GREEN') {
        this.setFlagState('GREEN');
      }
    }

    if (this.weatherChangeTimer >= this.weatherChangeInterval) {
      this.randomizeWeather();
    }

    const timeSinceLastIncident = this.incidentThrottleTime - this.lastIncidentTime;
    if (timeSinceLastIncident > this.incidentCooldown) {
      if (Math.random() < this.incidentChance) {
        this.generateRandomIncident();
        this.lastIncidentTime = this.incidentThrottleTime;
      }
    }
  }

  randomizeWeather() {
    const options = this.weatherOptions.filter(option => option !== this.raceMeta.weather);
    const nextWeather = options[Math.floor(Math.random() * options.length)];
    this.weatherChangeTimer = 0;
    this.setWeather(nextWeather);
  }

  setWeather(weather) {
    if (this.raceMeta.weather === weather) return;
    this.raceMeta.weather = weather;
    this.emitSessionState();
  }

  setFlagState(flag, options = {}) {
    if (this.raceMeta.flagState === flag) {
      if (options.holdFor) {
        this.flagResetTimer = options.holdFor;
      }
      return;
    }

    this.raceMeta.flagState = flag;

    if (options.holdFor) {
      this.flagResetTimer = options.holdFor;
    } else if (flag === 'GREEN') {
      this.flagResetTimer = 0;
    }

    this.emitSessionState();
  }

  setSafetyCarMode(mode, reason = '') {
    if (this.raceMeta.safetyCarMode === mode) {
      if (reason) {
        this.setSafetyCarState(this.raceMeta.safetyCarActive, reason);
      }
      return;
    }

    this.raceMeta.safetyCarMode = mode;
    const active = mode !== 'OFF';
    this.raceMeta.safetyCarActive = active;
    this.raceMeta.sessionPhase = active
      ? mode === 'VIRTUAL'
        ? 'VSC'
        : 'Safety Car'
      : 'Race';

    const defaultReason = mode === 'OFF'
      ? 'Safety car ending'
      : mode === 'VIRTUAL'
        ? 'Virtual safety car active'
        : 'Safety car deployed';

    this.setSafetyCarState(active, reason || defaultReason);

    if (active) {
      this.setFlagState('YELLOW', { holdFor: this.flagResetTimer || 12 });
    } else if (this.raceMeta.flagState !== 'GREEN' && this.flagResetTimer <= 0) {
      this.setFlagState('GREEN');
    }

    this.emitSessionState();
  }

  generateRandomIncident() {
    const incidentTypes = [
      { type: 'spin', severity: 'Medium', chance: 0.4 },
      { type: 'drs-activation', severity: 'Info', chance: 0.3 },
      { type: 'overtake', severity: 'Info', chance: 0.3 }
    ];

    let rand = Math.random();
    for (const incident of incidentTypes) {
      if (rand < incident.chance) {
        this.createIncident(incident.type, null, incident.severity);
        return;
      }
      rand -= incident.chance;
    }
  }

  createIncident(type, car = null, severity = 'Medium', metadata = {}) {
    const incidentId = `${type}-${this.incidentThrottleTime}-${Math.random()}`;

    const incidentLocations = [
      'Turn 1', 'Turn 2', 'Turn 3', 'Turn 4', 'Turn 5',
      'Apex', 'Chicane', 'Main Straight', 'Hairpin', 'Sector 1'
    ];

    const location = incidentLocations[Math.floor(Math.random() * incidentLocations.length)];

    const incident = {
      id: incidentId,
      type,
      severity,
      timestamp: this.incidentThrottleTime,
      location,
      carId: car ? car.id : null,
      resolved: false,
      metadata: {
        ...metadata,
        position: car ? { x: car.mesh.position.x, y: car.mesh.position.y, z: car.mesh.position.z } : null
      }
    };

    this.incidents.push(incident);

    if (this.incidents.length > 100) {
      this.incidents.shift();
    }

    if (severity === 'High') {
      this.setFlagState('YELLOW', { holdFor: 8 });
      this.triggerSafetyCar(`Responding to ${type} near ${location}`);
    }

    this.emit('incident', incident);

    return incident;
  }

  applyPenalty(carId, penaltyType = 'generic', severity = 'Minor', metadata = {}) {
    const telemetry = this.carTelemetry.get(carId);
    if (!telemetry) {
      return null;
    }

    const penalty = {
      id: `${penaltyType}-${carId}-${Date.now()}`,
      carId,
      type: penaltyType,
      severity,
      timestamp: this.raceMeta.totalRaceTime,
      metadata
    };

    telemetry.penalties.push(penalty);
    this.emit('penalty', penalty);
    return penalty;
  }

  fileProtest(carId, targetCarId, reason = '') {
    if (carId === undefined || carId === null) {
      return null;
    }

    const protest = {
      id: `protest-${carId}-${Date.now()}-${Math.random()}`,
      carId,
      targetCarId,
      reason,
      timestamp: this.raceMeta.totalRaceTime
    };

    this.emit('protest', protest);
    return protest;
  }

  setSafetyCarState(active, reason = '') {
    if (this.raceMeta.safetyCarActive === active && !reason) {
      return;
    }

    this.raceMeta.safetyCarActive = active;
    this.emit('safetyCar', {
      active,
      reason,
      timestamp: this.raceMeta.totalRaceTime
    });
  }

  triggerSafetyCar(reason = '') {
    this.setSafetyCarMode('DEPLOYED', reason || 'Safety car deployed');
    this.clearSafetyCarTimer();
    this.safetyCarTimer = setTimeout(() => {
      this.setSafetyCarMode('OFF', 'Track clear, racing resumes');
      this.safetyCarTimer = null;
    }, 6000);
  }

  clearSafetyCarTimer() {
    if (this.safetyCarTimer) {
      clearTimeout(this.safetyCarTimer);
      this.safetyCarTimer = null;
    }
  }

  resolveIncident(incidentId) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      this.emit('incidentResolved', incident);
    }
  }

  issueDecision(type, metadata = {}) {
    const decision = {
      id: `decision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      timestamp: this.raceMeta.totalRaceTime,
      metadata
    };

    this.decisions.push(decision);
    if (this.decisions.length > 50) {
      this.decisions.shift();
    }

    this.emit('decision', decision);
    return decision;
  }

  applyRaceControlDecision(decisionType, metadata = {}) {
    const normalized = decisionType.toUpperCase();
    const reason = metadata.message;

    if (normalized === 'SAFETY_CAR_DEPLOY') {
      this.setSafetyCarMode('DEPLOYED', reason || 'Safety car deployed by race control');
    } else if (normalized === 'SAFETY_CAR_RETURN') {
      this.setSafetyCarMode('OFF', reason || 'Safety car returning to pit lane');
    } else if (normalized === 'VIRTUAL_SC') {
      this.setSafetyCarMode('VIRTUAL', reason || 'Virtual safety car in effect');
    } else if (normalized === 'YELLOW_FLAG') {
      this.setSafetyCarMode('OFF', reason || 'Local yellow flag');
      this.setFlagState('YELLOW', { holdFor: metadata.holdFor || 6 });
    } else if (normalized === 'GREEN_FLAG') {
      this.setSafetyCarMode('OFF', reason || 'Green flag conditions');
      this.setFlagState('GREEN');
    }

    return this.issueDecision(decisionType, {
      ...metadata,
      flagState: this.raceMeta.flagState,
      safetyCarMode: this.raceMeta.safetyCarMode
    });
  }

  getRaceMeta() {
    return { ...this.raceMeta };
  }

  getSessionState() {
    return {
      lap: this.raceMeta.lapCount,
      totalLaps: this.raceMeta.totalLaps,
      weather: this.raceMeta.weather,
      flagState: this.raceMeta.flagState,
      safetyCarMode: this.raceMeta.safetyCarMode,
      sessionPhase: this.raceMeta.sessionPhase,
      safetyCarActive: this.raceMeta.safetyCarActive,
      currentLapTime: this.raceMeta.currentLapTime,
      totalRaceTime: this.raceMeta.totalRaceTime
    };
  }

  emitSessionState() {
    this.emit('session', this.getSessionState());
  }

  getCarTelemetry(carId) {
    const telemetry = this.carTelemetry.get(carId);
    return telemetry ? { ...telemetry } : null;
  }

  getAllTelemetry() {
    const all = {};
    this.carTelemetry.forEach((telemetry, carId) => {
      all[carId] = { ...telemetry };
    });
    return all;
  }

  getIncidents(resolved = false) {
    return this.incidents.filter(i => i.resolved === resolved);
  }

  getRecentIncidents(limit = 10) {
    return this.incidents
      .slice(-limit)
      .reverse();
  }

  getRecentDecisions(limit = 10) {
    return this.decisions
      .slice(-limit)
      .reverse();
  }

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    return () => {
      const callbacks = this.listeners.get(event);
      if (!callbacks) return;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        callback(data);
      });
    }
  }

  reset() {
    this.raceMeta = {
      lapCount: 1,
      totalLaps: 58,
      currentLapTime: 0,
      weather: 'Clear',
      safetyCarActive: false,
      totalRaceTime: 0,
      flagState: 'GREEN',
      sessionPhase: 'Race',
      safetyCarMode: 'OFF'
    };
    this.carTelemetry.clear();
    this.incidents = [];
    this.decisions = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
    this.flagResetTimer = 0;
    this.weatherChangeTimer = 0;
    this.clearSafetyCarTimer();

    if (this.teamRadioManager) {
      this.teamRadioManager.destroy();
      this.teamRadioManager = new TeamRadioManager(this);
    }

    this.emitSessionState();
  }

  destroy() {
    this.listeners.clear();
    this.carTelemetry.clear();
    this.incidents = [];
    this.decisions = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.clearSafetyCarTimer();
    if (this.teamRadioManager) {
      this.teamRadioManager.destroy();
      this.teamRadioManager = null;
    }
  }
}
