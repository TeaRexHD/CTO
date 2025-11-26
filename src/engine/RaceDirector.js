import { TeamRadioManager } from './TeamRadio';

export class RaceDirector {
  constructor() {
    this.raceMeta = {
      lapCount: 0,
      currentLapTime: 0,
      weather: 'clear',
      safetyCarActive: false,
      totalRaceTime: 0,
      sessionState: 'idle',
      flagState: 'green',
      safetyCarMode: 'off'
    };

    this.carTelemetry = new Map();
    this.incidents = [];
    this.listeners = new Map();
    this.penaltyLog = [];
    this.protests = [];

    this.lastWaypointIndices = new Map();
    this.lapStartTimes = new Map();

    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
    this.incidentCooldown = 2;
    this.incidentChance = 0.002;

    this.safetyCarTimer = null;
    this.teamRadioManager = new TeamRadioManager(this);
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

      this.emit('lapCompleted', {
        carId: car.id,
        lap: telemetry.lap,
        time: lapTime
      });
    }

    this.lastWaypointIndices.set(car.id, waypointIndex);
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
          this.fileProtest(car1.id, car2.id, 'Car forced us wide at the apex.');
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

    const timeSinceLastIncident = this.incidentThrottleTime - this.lastIncidentTime;
    if (timeSinceLastIncident > this.incidentCooldown) {
      if (Math.random() < this.incidentChance) {
        this.generateRandomIncident();
        this.lastIncidentTime = this.incidentThrottleTime;
      }
    }
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

    this.emit('incident', incident);

    if (severity === 'High') {
      this.triggerSafetyCar(`Responding to ${type} near ${location}`);
    }

    return incident;
  }

  setFlag(flagColor = 'green') {
    if (!flagColor) {
      return this.raceMeta.flagState;
    }
    const normalized = flagColor.toLowerCase();
    if (this.raceMeta.flagState === normalized) {
      return normalized;
    }
    this.raceMeta.flagState = normalized;
    this.emit('flagChange', { flag: normalized });
    return normalized;
  }

  setSafetyCarState(active, reason = '', mode = 'sc') {
    const nextMode = active ? (mode || 'sc') : 'off';
    if (this.raceMeta.safetyCarActive === active && this.raceMeta.safetyCarMode === nextMode) {
      return;
    }

    this.raceMeta.safetyCarActive = active;
    this.raceMeta.safetyCarMode = nextMode;

    const payload = {
      active,
      mode: nextMode,
      reason,
      timestamp: this.raceMeta.totalRaceTime
    };

    this.emit('safetyCar', payload);
    this.emit('safetyCarChange', payload);
  }

  deploySafetyCar(reason = 'Manual deployment') {
    this.clearSafetyCarTimer();
    this.setSafetyCarState(true, reason, 'sc');
  }

  deployVirtualSafetyCar(reason = 'Manual VSC deployment') {
    this.clearSafetyCarTimer();
    this.setSafetyCarState(true, reason, 'vsc');
  }

  releaseSafetyCar(reason = 'Race control release') {
    this.clearSafetyCarTimer();
    this.setSafetyCarState(false, reason, 'off');
  }

  triggerSafetyCar(reason = '') {
    this.deploySafetyCar(reason);
    this.clearSafetyCarTimer();
    this.safetyCarTimer = setTimeout(() => {
      this.releaseSafetyCar('Track clear, racing resumes');
      this.safetyCarTimer = null;
    }, 6000);
  }

  clearSafetyCarTimer() {
    if (this.safetyCarTimer) {
      clearTimeout(this.safetyCarTimer);
      this.safetyCarTimer = null;
    }
  }

  startSession() {
    this.raceMeta.sessionState = 'running';
    this.emit('sessionChange', { state: 'running' });
  }

  pauseSession() {
    this.raceMeta.sessionState = 'paused';
    this.emit('sessionChange', { state: 'paused' });
  }

  abortSession() {
    this.raceMeta.sessionState = 'aborted';
    this.emit('sessionChange', { state: 'aborted' });
  }

  applyPenalty(carId, penaltyType = 'warning', severity = 'Info', metadata = {}) {
    if (!this.carTelemetry.has(carId)) {
      return null;
    }

    const penalty = {
      id: `penalty-${Date.now()}-${Math.random()}`,
      carId,
      type: penaltyType,
      severity,
      metadata,
      timestamp: this.raceMeta.totalRaceTime
    };

    const telemetry = this.carTelemetry.get(carId);
    telemetry.penalties = [...telemetry.penalties, penalty];

    this.penaltyLog.push(penalty);
    if (this.penaltyLog.length > 50) {
      this.penaltyLog.shift();
    }

    this.emit('penaltyIssued', penalty);
    this.emit('penalty', penalty);
    return penalty;
  }

  issuePenalty(carId, penaltyType) {
    return this.applyPenalty(carId, penaltyType, 'Manual', { issuedBy: 'race-control' });
  }

  getPenaltyLog() {
    return [...this.penaltyLog];
  }

  fileProtest(arg1, arg2, arg3) {
    let protestData = {};

    if (typeof arg1 === 'object' && arg1 !== null) {
      protestData = arg1;
    } else if (typeof arg1 === 'number' || typeof arg1 === 'string') {
      protestData = {
        carId: Number(arg1),
        targetCarId: Number(arg2),
        reason: arg3
      };
    } else {
      protestData = {
        team: arg1,
        issue: arg2
      };
    }

    const team = protestData.team?.trim() || '';
    const issue = protestData.issue?.trim() || '';
    const reason = protestData.reason?.trim() || issue || '';
    const carId = Number.isFinite(protestData.carId) ? Number(protestData.carId) : null;
    const targetCarId = Number.isFinite(protestData.targetCarId) ? Number(protestData.targetCarId) : null;

    if (!team && !issue && carId === null && !reason) {
      return null;
    }

    const protest = {
      id: `protest-${Date.now()}-${Math.random()}`,
      carId,
      targetCarId,
      team: team || (carId !== null ? `Car ${carId + 1}` : ''),
      issue: issue || reason || 'General protest',
      reason: reason || issue || 'General protest',
      timestamp: this.raceMeta.totalRaceTime
    };

    this.protests.push(protest);
    if (this.protests.length > 50) {
      this.protests.shift();
    }

    this.emit('protestFiled', protest);
    this.emit('protest', protest);
    return protest;
  }

  getProtests() {
    return [...this.protests];
  }

  resolveIncident(incidentId) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      this.emit('incidentResolved', incident);
    }
  }

  getRaceMeta() {
    return { ...this.raceMeta };
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

  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    return () => {
      const callbacks = this.listeners.get(event);
      if (!callbacks) {
        return;
      }
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
    this.clearSafetyCarTimer();
    this.raceMeta = {
      lapCount: 0,
      currentLapTime: 0,
      weather: 'clear',
      safetyCarActive: false,
      totalRaceTime: 0,
      sessionState: 'idle',
      flagState: 'green',
      safetyCarMode: 'off'
    };
    this.carTelemetry.clear();
    this.incidents = [];
    this.penaltyLog = [];
    this.protests = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
  }

  destroy() {
    this.clearSafetyCarTimer();
    if (this.teamRadioManager) {
      this.teamRadioManager.destroy();
      this.teamRadioManager = null;
    }
    this.listeners.clear();
    this.carTelemetry.clear();
    this.incidents = [];
    this.penaltyLog = [];
    this.protests = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
  }
}
