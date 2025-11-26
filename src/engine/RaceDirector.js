const INCIDENT_LOCATIONS = [
  'Turn 1',
  'Turn 2',
  'Turn 3',
  'Turn 4',
  'Turn 5',
  'Apex',
  'Chicane',
  'Main Straight',
  'Hairpin',
  'Sector 1'
];

export class RaceDirector {
  constructor() {
    this.raceMeta = {
      lapCount: 0,
      currentLapTime: 0,
      weather: 'clear',
      safetyCarActive: false,
      virtualSafetyCarActive: false,
      totalRaceTime: 0
    };

    this.sessionState = {
      status: 'initializing',
      flag: 'green',
      weather: 'clear'
    };

    this.carTelemetry = new Map();
    this.carDirectives = new Map();
    this.incidents = [];
    this.listeners = new Map();

    this.lastWaypointIndices = new Map();
    this.lapStartTimes = new Map();

    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
    this.incidentCooldown = 2;
    this.incidentChance = 0.002;

    this.globalDirectives = {
      paceMultiplier: 1,
      sessionFrozen: false
    };

    this.flagLockedPause = false;
    this.manualSessionPause = false;
    this.metaBroadcastTimer = 0;
  }

  bootstrapSession(config = {}) {
    const {
      lap = 1,
      weather = 'clear',
      currentLapTime = 0,
      totalRaceTime = 0,
      flag = 'green',
      incidents = []
    } = config;

    this.raceMeta.lapCount = lap;
    this.raceMeta.currentLapTime = currentLapTime;
    this.raceMeta.totalRaceTime = totalRaceTime;
    this.raceMeta.weather = weather;

    this.sessionState.weather = weather;
    this.sessionState.status = 'running';
    this.manualSessionPause = false;
    this.flagLockedPause = false;
    this.globalDirectives.sessionFrozen = false;

    this.setFlagState(flag);

    incidents.forEach(incident => {
      this.recordManualIncident(incident);
    });

    this.emit('session', { ...this.sessionState });
    this.emit('raceMeta', this.getRaceMeta());
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
    this.ensureCarDirective(carId);
  }

  ensureCarDirective(carId) {
    if (!this.carDirectives.has(carId)) {
      this.carDirectives.set(carId, {
        speedLimiter: 1,
        driveThroughTimer: 0,
        driveThroughLimiter: 1,
        tyrePerformance: 1,
        tyreWearRate: 1,
        frozen: false
      });
    }
    return this.carDirectives.get(carId);
  }

  getCarDirectives(carId) {
    const directives = this.ensureCarDirective(carId);
    return { ...directives };
  }

  updateTelemetry(car, deltaTime, allCars, waypoints) {
    if (!this.carTelemetry.has(car.id)) {
      this.initializeCar(car.id);
    }

    const telemetry = this.carTelemetry.get(car.id);
    const position = car.mesh.position;
    const directives = this.ensureCarDirective(car.id);

    telemetry.position = { x: position.x, y: position.y, z: position.z };
    telemetry.speed = car.getSpeed();
    telemetry.currentSectorTime += deltaTime;
    telemetry.tyreHealth = Math.max(0, telemetry.tyreHealth - deltaTime * 0.5 * directives.tyreWearRate);

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

      this.raceMeta.lapCount = Math.max(this.raceMeta.lapCount, telemetry.lap);
      this.raceMeta.currentLapTime = 0;
      this.emit('raceMeta', this.getRaceMeta());

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
      }
    }
  }

  update(deltaTime) {
    if (this.isSessionRunning()) {
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

    this.updateDirectives(deltaTime);

    this.metaBroadcastTimer += deltaTime;
    if (this.metaBroadcastTimer >= 1) {
      this.metaBroadcastTimer = 0;
      this.emit('raceMeta', this.getRaceMeta());
    }
  }

  updateDirectives(deltaTime) {
    if (!this.isSessionRunning()) return;

    this.carDirectives.forEach(directive => {
      if (directive.driveThroughTimer > 0) {
        directive.driveThroughTimer = Math.max(0, directive.driveThroughTimer - deltaTime);
        if (directive.driveThroughTimer === 0) {
          directive.driveThroughLimiter = 1;
        }
      }
    });
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
        this.recordManualIncident({ type: incident.type, severity: incident.severity });
        return;
      }
      rand -= incident.chance;
    }
  }

  createIncident(type, car = null, severity = 'Medium', metadata = {}) {
    const payload = {
      type,
      severity,
      carId: car ? car.id : metadata.carId ?? null,
      location: metadata.location,
      metadata: {
        ...metadata
      }
    };

    if (car) {
      payload.metadata.position = {
        x: car.mesh.position.x,
        y: car.mesh.position.y,
        z: car.mesh.position.z
      };
    }

    return this.recordManualIncident(payload);
  }

  recordManualIncident(incident, options = {}) {
    if (!incident || !incident.type) return null;

    const normalized = {
      id: incident.id || `${incident.type}-${Date.now()}-${Math.random()}`,
      type: incident.type,
      severity: incident.severity || 'Medium',
      timestamp: this.incidentThrottleTime,
      location: incident.location || this.getRandomIncidentLocation(),
      carId: typeof incident.carId === 'number' ? incident.carId : incident.carId ?? null,
      resolved: !!incident.resolved,
      metadata: incident.metadata || {}
    };

    this.incidents.push(normalized);

    if (this.incidents.length > 100) {
      this.incidents.shift();
    }

    if (options.broadcast !== false) {
      this.emit('incident', normalized);
    }

    return normalized;
  }

  getRandomIncidentLocation() {
    return INCIDENT_LOCATIONS[Math.floor(Math.random() * INCIDENT_LOCATIONS.length)];
  }

  resolveIncident(incidentId) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      this.emit('incidentResolved', incident);
    }
  }

  applyPenalty(carId, penalty = {}) {
    if (typeof carId === 'undefined' || carId === null) {
      return null;
    }

    if (!this.carTelemetry.has(carId)) {
      this.initializeCar(carId);
    }

    const telemetry = this.carTelemetry.get(carId);
    if (!telemetry) return null;

    const penaltyRecord = {
      id: penalty.id || `${penalty.type || 'penalty'}-${Date.now()}-${Math.random()}`,
      type: penalty.type || 'generic',
      severity: penalty.severity || 'Low',
      issuedAt: this.raceMeta.totalRaceTime,
      status: 'active'
    };

    telemetry.penalties.push(penaltyRecord);

    const directives = this.ensureCarDirective(carId);

    switch (penalty.type) {
      case 'drive-through':
        directives.driveThroughTimer = penalty.duration ?? 15;
        directives.driveThroughLimiter = penalty.limit ?? 0.55;
        break;
      case 'speed-limiter':
        directives.speedLimiter = Math.min(directives.speedLimiter, penalty.limit ?? 0.8);
        break;
      case 'tyre-deg':
        directives.tyrePerformance = Math.min(directives.tyrePerformance, penalty.performance ?? 0.85);
        directives.tyreWearRate = Math.max(directives.tyreWearRate, penalty.wearRate ?? 1.4);
        break;
      case 'freeze':
        directives.frozen = true;
        break;
      default:
        directives.speedLimiter = Math.min(directives.speedLimiter, penalty.limit ?? 0.9);
    }

    this.emit('penalty', { carId, penalty: penaltyRecord });
    return penaltyRecord;
  }

  clearPenalty(carId, type) {
    if (!this.carTelemetry.has(carId)) return;

    const directives = this.ensureCarDirective(carId);
    const telemetry = this.carTelemetry.get(carId);

    if (telemetry) {
      telemetry.penalties = telemetry.penalties.map(p =>
        !type || p.type === type ? { ...p, status: 'cleared' } : p
      );
    }

    if (!type || type === 'drive-through') {
      directives.driveThroughTimer = 0;
      directives.driveThroughLimiter = 1;
    }

    if (!type || type === 'speed-limiter') {
      directives.speedLimiter = 1;
    }

    if (!type || type === 'tyre-deg') {
      directives.tyrePerformance = 1;
      directives.tyreWearRate = 1;
    }

    if (!type || type === 'freeze') {
      directives.frozen = false;
    }
  }

  setFlagState(flag) {
    const previousFlagLock = this.flagLockedPause;
    this.flagLockedPause = flag === 'red';
    this.sessionState.flag = flag;

    this.updateGlobalPaceMultiplier(flag);

    if (this.flagLockedPause) {
      this.globalDirectives.sessionFrozen = true;
      if (this.sessionState.status !== 'aborted') {
        this.sessionState.status = 'paused';
      }
    } else if (previousFlagLock && !this.manualSessionPause && this.sessionState.status !== 'aborted') {
      this.sessionState.status = 'running';
      this.globalDirectives.sessionFrozen = false;
    }

    this.emit('flagChange', { ...this.sessionState });
    this.emit('session', { ...this.sessionState });
  }

  updateGlobalPaceMultiplier(flag) {
    const paceMap = {
      green: 1,
      yellow: 0.85,
      vsc: 0.7,
      sc: 0.6,
      red: 0
    };

    this.globalDirectives.paceMultiplier = paceMap[flag] ?? 1;
    this.raceMeta.safetyCarActive = flag === 'sc';
    this.raceMeta.virtualSafetyCarActive = flag === 'vsc';
  }

  setSessionStatus(status) {
    this.sessionState.status = status;
    this.manualSessionPause = status === 'paused';

    if (status === 'aborted') {
      this.globalDirectives.sessionFrozen = true;
    } else if (status === 'running' && !this.flagLockedPause) {
      this.globalDirectives.sessionFrozen = false;
    } else if (status === 'paused') {
      this.globalDirectives.sessionFrozen = true;
    }

    this.emit('session', { ...this.sessionState });
  }

  getSessionState() {
    return { ...this.sessionState };
  }

  isSessionRunning() {
    return this.sessionState.status === 'running' && !this.globalDirectives.sessionFrozen;
  }

  shouldFreezeCars() {
    return this.globalDirectives.sessionFrozen;
  }

  getGlobalPaceModifier() {
    return this.globalDirectives.paceMultiplier;
  }

  getRaceMeta() {
    return { ...this.raceMeta, flag: this.sessionState.flag };
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

  reportManualIncident(incident) {
    return this.recordManualIncident(incident);
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
      lapCount: 0,
      currentLapTime: 0,
      weather: 'clear',
      safetyCarActive: false,
      virtualSafetyCarActive: false,
      totalRaceTime: 0
    };
    this.sessionState = {
      status: 'initializing',
      flag: 'green',
      weather: 'clear'
    };
    this.carTelemetry.clear();
    this.carDirectives.clear();
    this.incidents = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.incidentThrottleTime = 0;
    this.lastIncidentTime = 0;
    this.globalDirectives = {
      paceMultiplier: 1,
      sessionFrozen: false
    };
    this.flagLockedPause = false;
    this.manualSessionPause = false;
    this.metaBroadcastTimer = 0;
  }

  destroy() {
    this.listeners.clear();
    this.carTelemetry.clear();
    this.carDirectives.clear();
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
  }
}
