const STARTING_LAP = 12;
const TOTAL_LAPS = 58;
const AVERAGE_LAP_SECONDS = 86;
const DEFAULT_LAP_PROGRESS_SECONDS = 34;
const TRACK_CENTER_RADIUS = 165;
const DEFAULT_TURN_COUNT = 16;

export const FLAG_STATES = Object.freeze({
  GREEN: 'green',
  YELLOW: 'yellow',
  DOUBLE_YELLOW: 'double-yellow',
  RED: 'red',
  BLUE: 'blue',
  SAFETY_CAR: 'safety-car',
  CHECKERED: 'checkered'
});

export const PENALTY_TYPES = Object.freeze({
  FIVE_SECONDS: '5s',
  TEN_SECONDS: '10s',
  DRIVE_THROUGH: 'drive-through',
  STOP_GO: 'stop-go'
});

export const SAFETY_CAR_MODES = Object.freeze({
  NONE: 'none',
  SC: 'sc',
  VSC: 'vsc'
});

export const SESSION_STATES = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  RED_FLAG: 'red-flag',
  FINISHED: 'finished'
});

export class RaceDirector {
  constructor(options = {}) {
    this.startingLap = STARTING_LAP;
    this.totalPlannedLaps = TOTAL_LAPS;
    this.turnCount = options.turnCount || DEFAULT_TURN_COUNT;
    this.trackCircumference = options.trackCircumference || (2 * Math.PI * TRACK_CENTER_RADIUS);

    this.completedLapsAtStart = Math.max(this.startingLap - 1, 0);
    this.currentLapTimeSeed = options.currentLapTime ?? DEFAULT_LAP_PROGRESS_SECONDS;
    this.initialRaceSeconds = this.completedLapsAtStart * AVERAGE_LAP_SECONDS + this.currentLapTimeSeed;

    this.speedProfiles = {
      normal: 1,
      sc: 0.55,
      vsc: 0.75,
      pitLimiter: 0.4,
      stopGoHold: 0.08
    };

    this.penaltyDurations = {
      driveThrough: 6,
      stopGoTransit: 4,
      stopGoHold: 3
    };

    this.incidentCooldown = 2;
    this.incidentChance = 0.0025;

    this.carTelemetry = new Map();
    this.incidents = [];
    this.listeners = new Map();
    this.lastWaypointIndices = new Map();
    this.lapStartTimes = new Map();
    this.protests = [];

    this.resetRaceMeta();
  }

  resetRaceMeta() {
    this.raceMeta = {
      currentLap: this.startingLap,
      totalLaps: this.totalPlannedLaps,
      lapsRemaining: Math.max(this.totalPlannedLaps - this.startingLap, 0),
      currentLapTime: this.currentLapTimeSeed,
      totalRaceTime: this.initialRaceSeconds,
      raceClockSeconds: this.initialRaceSeconds,
      weather: 'clear',
      flagState: FLAG_STATES.GREEN,
      sessionState: SESSION_STATES.RUNNING,
      safetyCar: {
        active: false,
        mode: SAFETY_CAR_MODES.NONE
      },
      outstandingProtests: 0,
      protests: []
    };

    this.globalSpeedMultiplier = this.speedProfiles.normal;
    this.incidentThrottleTime = this.initialRaceSeconds;
    this.lastIncidentTime = this.initialRaceSeconds;
  }

  createDirectiveState() {
    return {
      speedMultiplier: 1,
      limiterActive: false,
      forcedPit: false,
      reason: null
    };
  }

  randomTyreCompound() {
    const compounds = [
      { compound: 'soft', weight: 0.35 },
      { compound: 'medium', weight: 0.45 },
      { compound: 'hard', weight: 0.2 }
    ];
    let roll = Math.random();
    for (const entry of compounds) {
      if (roll < entry.weight) {
        return entry.compound;
      }
      roll -= entry.weight;
    }
    return 'medium';
  }

  getWearRateForCompound(compound) {
    switch (compound) {
      case 'soft':
        return 0.0025;
      case 'hard':
        return 0.0012;
      default:
        return 0.0018;
    }
  }

  initializeCar(carId) {
    const tyreCompound = this.randomTyreCompound();
    const telemetry = {
      carId,
      position: { x: 0, y: 0, z: 0 },
      speed: 0,
      lap: this.raceMeta.currentLap,
      sectorTimes: [0, 0, 0],
      currentSectorTime: 0,
      sectorIndex: 0,
      gapToLeader: 0,
      tyreHealth: 100,
      tyreSet: {
        compound: tyreCompound,
        wear: 0,
        wearRate: this.getWearRateForCompound(tyreCompound)
      },
      penaltyQueue: [],
      penalties: [],
      activePenalty: null,
      timePenaltyTotal: 0,
      directives: this.createDirectiveState(),
      trackLimitViolations: 0,
      lastWaypointIndex: 0
    };

    this.carTelemetry.set(carId, telemetry);
    this.lastWaypointIndices.set(carId, 0);
    this.lapStartTimes.set(carId, this.incidentThrottleTime);
    return telemetry;
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

    if (telemetry.tyreSet) {
      const wearGain = deltaTime * telemetry.speed * telemetry.tyreSet.wearRate * 0.01;
      telemetry.tyreSet.wear = Math.min(1, telemetry.tyreSet.wear + wearGain);
      telemetry.tyreHealth = Math.max(0, 100 - telemetry.tyreSet.wear * 100);
    }

    this.detectLapCompletion(car, telemetry, waypoints);
    this.updateGapToLeader(telemetry, allCars);

    this.emit('telemetry', { carId: car.id, telemetry: { ...telemetry } });
  }

  detectLapCompletion(car, telemetry, waypoints) {
    const waypointIndex = car.waypointIndex;
    const lastIndex = this.lastWaypointIndices.get(car.id);

    if (waypointIndex < lastIndex && lastIndex > waypoints.length - 5) {
      const now = this.incidentThrottleTime;
      telemetry.lap += 1;
      const lapTime = now - (this.lapStartTimes.get(car.id) || now);
      this.lapStartTimes.set(car.id, now);

      if (telemetry.sectorIndex >= 0 && telemetry.sectorIndex < telemetry.sectorTimes.length) {
        telemetry.sectorTimes[telemetry.sectorIndex] = telemetry.currentSectorTime;
      }

      telemetry.currentSectorTime = 0;
      telemetry.sectorIndex = 0;

      if (telemetry.lap > this.raceMeta.currentLap) {
        this.raceMeta.currentLap = Math.min(telemetry.lap, this.raceMeta.totalLaps);
        this.raceMeta.lapsRemaining = Math.max(this.raceMeta.totalLaps - this.raceMeta.currentLap, 0);
        this.raceMeta.currentLapTime = 0;
      }

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
      const telemetry = this.carTelemetry.get(car.id) || this.initializeCar(car.id);
      telemetry.trackLimitViolations++;

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

  issuePenalty(carId, type, reason = 'regulation breach') {
    if (!Object.values(PENALTY_TYPES).includes(type)) {
      throw new Error(`Unknown penalty type: ${type}`);
    }

    const telemetry = this.carTelemetry.get(carId) || this.initializeCar(carId);
    const penalty = {
      id: `pen-${carId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      reason,
      issuedAt: this.raceMeta.totalRaceTime,
      status: 'queued'
    };

    telemetry.penaltyQueue.push(penalty);

    const payload = { type: 'penalty-issued', carId, detail: penalty, raceMeta: this.getRaceMeta() };
    this.emit('decision', payload);
    this.emit('ticker', {
      message: `Car ${carId} given a ${type} penalty (${reason})`,
      category: 'penalty',
      timestamp: this.raceMeta.totalRaceTime
    });
    return penalty;
  }

  setFlag(flagType) {
    if (!Object.values(FLAG_STATES).includes(flagType)) {
      throw new Error(`Unknown flag state: ${flagType}`);
    }

    this.raceMeta.flagState = flagType;
    const payload = { type: 'flag', flag: flagType, raceMeta: this.getRaceMeta() };

    this.emit('decision', payload);
    this.emit('ticker', {
      message: `Flag update: ${flagType}`,
      category: 'flag',
      timestamp: this.raceMeta.totalRaceTime
    });
    return payload;
  }

  deploySafetyCar(mode = SAFETY_CAR_MODES.SC) {
    if (!Object.values(SAFETY_CAR_MODES).includes(mode)) {
      throw new Error(`Unknown safety car mode: ${mode}`);
    }

    this.raceMeta.safetyCar = {
      active: mode !== SAFETY_CAR_MODES.NONE,
      mode
    };

    if (mode === SAFETY_CAR_MODES.SC) {
      this.setFlag(FLAG_STATES.SAFETY_CAR);
    } else if (mode === SAFETY_CAR_MODES.VSC) {
      this.setFlag(FLAG_STATES.DOUBLE_YELLOW);
    } else if (this.raceMeta.sessionState === SESSION_STATES.RUNNING) {
      this.setFlag(FLAG_STATES.GREEN);
    }

    this.recalculateGlobalSpeedMultiplier();

    const payload = { type: 'safety-car', mode, raceMeta: this.getRaceMeta() };
    this.emit('decision', payload);
    this.emit('ticker', {
      message: mode === SAFETY_CAR_MODES.NONE ? 'Safety car in this lap' : `Safety car deployed (${mode.toUpperCase()})`,
      category: 'safety-car',
      timestamp: this.raceMeta.totalRaceTime
    });
    return payload;
  }

  handleSessionCommand(command) {
    let handled = true;

    switch (command) {
      case 'pause':
        this.raceMeta.sessionState = SESSION_STATES.PAUSED;
        break;
      case 'resume':
        this.raceMeta.sessionState = SESSION_STATES.RUNNING;
        this.setFlag(FLAG_STATES.GREEN);
        break;
      case 'red-flag':
        this.raceMeta.sessionState = SESSION_STATES.RED_FLAG;
        this.setFlag(FLAG_STATES.RED);
        this.deploySafetyCar(SAFETY_CAR_MODES.NONE);
        break;
      case 'restart':
        this.raceMeta.sessionState = SESSION_STATES.RUNNING;
        this.setFlag(FLAG_STATES.GREEN);
        break;
      case 'finish':
        this.raceMeta.sessionState = SESSION_STATES.FINISHED;
        this.setFlag(FLAG_STATES.CHECKERED);
        break;
      default:
        handled = false;
    }

    if (!handled) {
      return null;
    }

    this.recalculateGlobalSpeedMultiplier();

    const payload = {
      type: 'session',
      command,
      state: this.raceMeta.sessionState,
      raceMeta: this.getRaceMeta()
    };

    this.emit('decision', payload);
    this.emit('ticker', {
      message: `Race control: ${command}`,
      category: 'session',
      timestamp: this.raceMeta.totalRaceTime
    });
    return payload;
  }

  logProtest({ team, reason } = {}) {
    const protest = {
      id: `protest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      team: team || 'Unknown',
      reason: reason || 'unspecified',
      timestamp: this.raceMeta.totalRaceTime,
      status: 'open'
    };

    this.protests.push(protest);
    this.raceMeta.outstandingProtests = this.protests.length;
    this.raceMeta.protests = [...this.protests];

    const payload = { type: 'protest', detail: protest, raceMeta: this.getRaceMeta() };
    this.emit('decision', payload);
    this.emit('ticker', {
      message: `Protest lodged by ${protest.team}`,
      category: 'protest',
      timestamp: this.raceMeta.totalRaceTime
    });
    return protest;
  }

  update(deltaTime, context = {}) {
    const cars = Array.isArray(context.cars) ? context.cars : [];
    const carMap = new Map(cars.map(car => [car.id, car]));

    const sessionState = this.raceMeta.sessionState;
    const isSuspended = sessionState === SESSION_STATES.PAUSED || sessionState === SESSION_STATES.RED_FLAG || sessionState === SESSION_STATES.FINISHED;
    const effectiveDelta = isSuspended ? 0 : deltaTime;

    const resolvedMultiplier = this.resolveGlobalSpeedMultiplier();
    if (this.globalSpeedMultiplier !== resolvedMultiplier) {
      this.globalSpeedMultiplier = resolvedMultiplier;
    }

    if (effectiveDelta > 0) {
      this.incidentThrottleTime += effectiveDelta;
      this.raceMeta.totalRaceTime += effectiveDelta;
      this.raceMeta.currentLapTime += effectiveDelta;
      this.raceMeta.raceClockSeconds += effectiveDelta;
    }

    this.enforcePenalties(effectiveDelta);
    this.applySpeedDirectives(carMap);

    if (effectiveDelta > 0) {
      this.maybeGenerateIncident();
    }
  }

  resolveGlobalSpeedMultiplier() {
    if (this.raceMeta.sessionState === SESSION_STATES.RED_FLAG || this.raceMeta.sessionState === SESSION_STATES.PAUSED) {
      return 0;
    }

    if (this.raceMeta.sessionState === SESSION_STATES.FINISHED) {
      return 0;
    }

    const safetyCarMode = this.raceMeta.safetyCar?.mode;
    if (safetyCarMode === SAFETY_CAR_MODES.SC) {
      return this.speedProfiles.sc;
    }

    if (safetyCarMode === SAFETY_CAR_MODES.VSC) {
      return this.speedProfiles.vsc;
    }

    return this.speedProfiles.normal;
  }

  recalculateGlobalSpeedMultiplier() {
    this.globalSpeedMultiplier = this.resolveGlobalSpeedMultiplier();
  }

  enforcePenalties(deltaTime) {
    this.carTelemetry.forEach((telemetry, carId) => {
      if (!telemetry.directives) {
        telemetry.directives = this.createDirectiveState();
      }

      if (!telemetry.activePenalty && telemetry.penaltyQueue.length) {
        telemetry.activePenalty = { ...telemetry.penaltyQueue.shift(), status: 'serving' };
        this.emit('ticker', {
          message: `Car ${carId} serving ${telemetry.activePenalty.type}`,
          category: 'penalty',
          timestamp: this.raceMeta.totalRaceTime
        });
      }

      if (!telemetry.activePenalty) {
        return;
      }

      const active = telemetry.activePenalty;

      if (active.type === PENALTY_TYPES.FIVE_SECONDS || active.type === PENALTY_TYPES.TEN_SECONDS) {
        const seconds = active.type === PENALTY_TYPES.FIVE_SECONDS ? 5 : 10;
        telemetry.timePenaltyTotal += seconds;
        this.finishActivePenalty(carId, telemetry, { appliedSeconds: seconds });
        return;
      }

      if (active.type === PENALTY_TYPES.DRIVE_THROUGH) {
        if (!active.remaining) {
          active.remaining = this.penaltyDurations.driveThrough;
        }
        active.remaining = Math.max(0, active.remaining - deltaTime);
        this.setDirectiveForPenalty(telemetry, {
          speedMultiplier: this.speedProfiles.pitLimiter,
          limiterActive: true,
          forcedPit: true,
          reason: 'Drive-through penalty'
        });

        if (active.remaining === 0) {
          this.finishActivePenalty(carId, telemetry, { servedSeconds: this.penaltyDurations.driveThrough });
        }
        return;
      }

      if (active.type === PENALTY_TYPES.STOP_GO) {
        if (active.transitRemaining == null) {
          active.transitRemaining = this.penaltyDurations.stopGoTransit;
          active.holdRemaining = this.penaltyDurations.stopGoHold;
        }

        if (active.transitRemaining > 0) {
          active.transitRemaining = Math.max(0, active.transitRemaining - deltaTime);
          this.setDirectiveForPenalty(telemetry, {
            speedMultiplier: this.speedProfiles.pitLimiter,
            limiterActive: true,
            forcedPit: true,
            reason: 'Stop-go transit'
          });
        } else if (active.holdRemaining > 0) {
          active.holdRemaining = Math.max(0, active.holdRemaining - deltaTime);
          this.setDirectiveForPenalty(telemetry, {
            speedMultiplier: this.speedProfiles.stopGoHold,
            limiterActive: true,
            forcedPit: true,
            reason: 'Stop-go hold'
          });
        }

        if (active.transitRemaining === 0 && active.holdRemaining === 0) {
          const servedSeconds = this.penaltyDurations.stopGoTransit + this.penaltyDurations.stopGoHold;
          this.finishActivePenalty(carId, telemetry, { servedSeconds });
        }
      }
    });
  }

  setDirectiveForPenalty(telemetry, overrides) {
    telemetry.directives = {
      ...telemetry.directives,
      ...overrides
    };

    if (typeof telemetry.directives.speedMultiplier !== 'number') {
      telemetry.directives.speedMultiplier = 1;
    }
  }

  finishActivePenalty(carId, telemetry, extra = {}) {
    if (!telemetry.activePenalty) return;

    const completed = {
      ...telemetry.activePenalty,
      status: 'served',
      servedAt: this.raceMeta.totalRaceTime,
      ...extra
    };

    telemetry.penalties.push(completed);
    telemetry.activePenalty = null;
    telemetry.directives = this.createDirectiveState();

    this.emit('decision', {
      type: 'penalty-served',
      carId,
      detail: completed,
      raceMeta: this.getRaceMeta()
    });
  }

  applySpeedDirectives(carMap) {
    if (!carMap.size) {
      return;
    }

    this.carTelemetry.forEach((telemetry, carId) => {
      const car = carMap.get(carId);
      if (!car) return;

      if (typeof car.baseMaxSpeed !== 'number') {
        car.baseMaxSpeed = car.maxSpeed;
      }

      if (!telemetry.directives) {
        telemetry.directives = this.createDirectiveState();
      }

      const perCarMultiplier = Math.max(0, Math.min(telemetry.directives.speedMultiplier ?? 1, 1));
      const combined = Math.max(0, Math.min(perCarMultiplier * this.globalSpeedMultiplier, 1));
      car.maxSpeed = car.baseMaxSpeed * combined;
    });
  }

  maybeGenerateIncident() {
    const timeSinceLastIncident = this.incidentThrottleTime - this.lastIncidentTime;
    if (timeSinceLastIncident < this.incidentCooldown) {
      return;
    }

    if (Math.random() < this.incidentChance) {
      this.generateRandomIncident();
      this.lastIncidentTime = this.incidentThrottleTime;
    }
  }

  generateRandomIncident() {
    const incidentTypes = [
      { type: 'crash', severity: 'High', chance: 0.25 },
      { type: 'track-limits', severity: 'Medium', chance: 0.25 },
      { type: 'mechanical', severity: 'Medium', chance: 0.2 },
      { type: 'weather-shift', severity: 'Info', chance: 0.15 },
      { type: 'power-unit', severity: 'High', chance: 0.15 }
    ];

    let rand = Math.random();
    for (const incident of incidentTypes) {
      if (rand < incident.chance) {
        const telemetries = Array.from(this.carTelemetry.values());
        const targetTelemetry = telemetries.length ? telemetries[Math.floor(Math.random() * telemetries.length)] : null;
        const metadata = targetTelemetry ? { position: targetTelemetry.position, carId: targetTelemetry.carId } : {};
        this.createIncident(incident.type, targetTelemetry, incident.severity, metadata);
        return;
      }
      rand -= incident.chance;
    }
  }

  extractPosition(car, metadata = {}) {
    if (metadata.position) {
      return metadata.position;
    }

    if (car?.mesh?.position) {
      return { x: car.mesh.position.x, y: car.mesh.position.y, z: car.mesh.position.z };
    }

    if (car?.position) {
      return car.position;
    }

    if (car?.telemetry?.position) {
      return car.telemetry.position;
    }

    return null;
  }

  calculateProgressFromPosition(position) {
    if (!position) {
      return Math.random();
    }

    const angle = Math.atan2(position.z, position.x);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    return normalized / (Math.PI * 2);
  }

  buildLocationFromProgress(progress) {
    const kilometer = Number(((progress * this.trackCircumference) / 1000).toFixed(3));
    const turnNumber = Math.max(1, Math.min(this.turnCount, Math.ceil(progress * this.turnCount) || 1));
    return {
      turn: `T${turnNumber}`,
      turnNumber,
      kilometer
    };
  }

  createIncident(type, car = null, severity = 'Medium', metadata = {}) {
    const incidentId = `${type}-${this.incidentThrottleTime}-${Math.random()}`;

    const position = this.extractPosition(car, metadata);
    const progress = metadata.progress ?? this.calculateProgressFromPosition(position);
    const locationData = metadata.location || this.buildLocationFromProgress(progress);
    const locationLabel = `${locationData.turn} / ${locationData.kilometer.toFixed(2)}km`;

    const incident = {
      id: incidentId,
      type,
      severity,
      timestamp: this.incidentThrottleTime,
      location: locationLabel,
      carId: car ? (car.id ?? car.carId ?? null) : null,
      resolved: false,
      metadata: {
        ...metadata,
        location: locationData,
        position
      }
    };

    this.incidents.push(incident);

    if (this.incidents.length > 100) {
      this.incidents.shift();
    }

    this.emit('incident', incident);

    return incident;
  }

  resolveIncident(incidentId) {
    const incident = this.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      this.emit('incidentResolved', incident);
    }
  }

  getFlagState() {
    return this.raceMeta.flagState;
  }

  getSafetyCarState() {
    return {
      ...this.raceMeta.safetyCar,
      sessionState: this.raceMeta.sessionState,
      flagState: this.raceMeta.flagState,
      speedMultiplier: this.globalSpeedMultiplier
    };
  }

  getCarDirectives(carId) {
    const telemetry = this.carTelemetry.get(carId);
    return telemetry ? { ...telemetry.directives } : null;
  }

  getRaceMeta() {
    return {
      ...this.raceMeta,
      safetyCar: { ...this.raceMeta.safetyCar },
      protests: [...this.protests]
    };
  }

  getCarTelemetry(carId) {
    const telemetry = this.carTelemetry.get(carId);
    if (!telemetry) return null;
    return {
      ...telemetry,
      directives: { ...telemetry.directives },
      tyreSet: { ...telemetry.tyreSet }
    };
  }

  getAllTelemetry() {
    const all = {};
    this.carTelemetry.forEach((telemetry, carId) => {
      all[carId] = {
        ...telemetry,
        directives: { ...telemetry.directives },
        tyreSet: { ...telemetry.tyreSet }
      };
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
    this.resetRaceMeta();
    this.carTelemetry.clear();
    this.incidents = [];
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.protests = [];
    this.raceMeta.protests = [];
    this.raceMeta.outstandingProtests = 0;
  }

  destroy() {
    this.listeners.clear();
    this.carTelemetry.clear();
    this.lastWaypointIndices.clear();
    this.lapStartTimes.clear();
    this.incidents = [];
    this.protests = [];
  }
}
