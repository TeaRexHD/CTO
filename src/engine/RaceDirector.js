const DRIVER_ROSTER = [
  { name: 'L. Hartmann', code: 'HAR', team: 'Axiom' },
  { name: 'M. Pereira', code: 'PER', team: 'Solstice' },
  { name: 'R. Tanaka', code: 'TAN', team: 'Kokoro' },
  { name: 'E. Müller', code: 'MUL', team: 'Vanguard' },
  { name: 'C. Laurent', code: 'LAU', team: 'Lumine' },
  { name: 'I. Nakamura', code: 'NAK', team: 'Kokoro' },
  { name: 'J. Alvarez', code: 'ALV', team: 'Horizon' },
  { name: 'S. Moreno', code: 'MOR', team: 'Horizon' },
  { name: 'V. Petrov', code: 'PET', team: 'Aurora' },
  { name: 'A. Lindgren', code: 'LIN', team: 'Nordic' },
  { name: 'T. Sato', code: 'SAT', team: 'Kokoro' },
  { name: 'K. Rinaldi', code: 'RIN', team: 'Axiom' },
  { name: 'P. Wallace', code: 'WAL', team: 'Solstice' },
  { name: 'G. Costa', code: 'COS', team: 'Aurora' },
  { name: 'N. Iversen', code: 'IVE', team: 'Nordic' },
  { name: 'B. Martins', code: 'MAR', team: 'Lumine' },
  { name: 'O. Jensen', code: 'JEN', team: 'Vanguard' },
  { name: 'H. Moretti', code: 'MOR', team: 'Solstice' },
  { name: 'F. Delgado', code: 'DEL', team: 'Axiom' },
  { name: 'S. Koval', code: 'KOV', team: 'Aurora' }
];

const TYRE_COMPOUNDS = ['Soft', 'Medium', 'Hard'];

const PENALTY_LIBRARY = {
  track: {
    label: 'Track Limits',
    severity: 'warning',
    ttl: 9
  },
  collision: {
    label: 'Contact',
    severity: 'critical',
    ttl: 12
  },
  pit: {
    label: 'Pit Lane',
    severity: 'info',
    ttl: 6
  }
};

export class RaceDirector {
  constructor(track, cars) {
    this.track = track;
    this.trackRadius = track.innerRadius + track.trackWidth / 2;
    this.trackLength = Math.PI * 2 * this.trackRadius;
    this.sectorLength = this.trackLength / 3;
    this.averagePace = 70;

    this.carStates = cars.map((car, index) => this.createInitialState(car, index));
    this.stateById = new Map(this.carStates.map(state => [state.id, state]));

    this.snapshot = {
      raceFlag: 'green',
      updatedAt: Date.now(),
      drivers: []
    };
  }

  createInitialState(car, index) {
    const profile = DRIVER_ROSTER[index % DRIVER_ROSTER.length];
    const compound = TYRE_COMPOUNDS[index % TYRE_COMPOUNDS.length];
    const initialAngle = this.computeAngle(car.mesh.position);
    const lapDistance = initialAngle * this.trackRadius;

    return {
      id: car.id,
      driver: profile,
      color: car.color,
      tyreCompound: compound,
      lap: 0,
      lapDistance,
      totalDistance: lapDistance,
      prevAngle: initialAngle,
      currentLapTime: 0,
      lastLapTime: null,
      bestLapTime: null,
      sectorTimer: 0,
      lastSectorTimes: [null, null, null],
      currentSector: Math.floor(lapDistance / this.sectorLength) % 3,
      speed: 0,
      offTrackTimer: 0,
      collisionTimer: 0,
      penalties: []
    };
  }

  computeAngle(position) {
    const angle = Math.atan2(position.z, position.x);
    return angle >= 0 ? angle : angle + Math.PI * 2;
  }

  getState(carId) {
    return this.stateById.get(carId);
  }

  reportOffTrack(carId) {
    const state = this.getState(carId);
    if (!state) return;

    state.offTrackTimer = 4;
    this.addPenalty(state, 'track');
  }

  reportCollision(carId) {
    const state = this.getState(carId);
    if (!state) return;

    state.collisionTimer = 5;
    this.addPenalty(state, 'collision');
  }

  addPenalty(state, type) {
    const template = PENALTY_LIBRARY[type];
    if (!template) return;

    const existing = state.penalties.find(penalty => penalty.type === type);
    if (existing) {
      existing.ttl = template.ttl;
      return;
    }

    state.penalties.push({
      type,
      label: template.label,
      severity: template.severity,
      ttl: template.ttl
    });
  }

  update(cars, deltaTime) {
    cars.forEach(car => {
      const state = this.getState(car.id);
      if (!state) return;

      const angle = this.computeAngle(car.mesh.position);
      if (state.prevAngle === null) {
        state.prevAngle = angle;
      }

      let angleDiff = angle - state.prevAngle;
      if (angleDiff < -Math.PI) {
        angleDiff += Math.PI * 2;
      } else if (angleDiff > Math.PI) {
        angleDiff -= Math.PI * 2;
      }

      let distanceDelta = angleDiff * this.trackRadius;
      if (!Number.isFinite(distanceDelta)) {
        distanceDelta = 0;
      }

      state.lapDistance += distanceDelta;
      state.prevAngle = angle;

      state.currentLapTime += deltaTime;
      state.sectorTimer += deltaTime;
      state.speed = car.velocity.length();

      while (state.lapDistance >= this.trackLength) {
        state.lapDistance -= this.trackLength;
        state.lap += 1;
        state.lastLapTime = state.currentLapTime;
        if (!state.bestLapTime || (state.lastLapTime && state.lastLapTime < state.bestLapTime)) {
          state.bestLapTime = state.lastLapTime;
        }
        state.currentLapTime = 0;
      }

      while (state.lapDistance < 0 && state.lap > 0) {
        state.lapDistance += this.trackLength;
        state.lap = Math.max(0, state.lap - 1);
      }

      if (state.lapDistance < 0) {
        state.lapDistance = 0;
      }

      state.totalDistance = state.lap * this.trackLength + state.lapDistance;

      const sectorIndex = Math.floor(state.lapDistance / this.sectorLength) % 3;
      if (sectorIndex !== state.currentSector) {
        state.lastSectorTimes[state.currentSector] = state.sectorTimer;
        state.sectorTimer = 0;
        state.currentSector = sectorIndex;
      }

      state.offTrackTimer = Math.max(0, state.offTrackTimer - deltaTime);
      state.collisionTimer = Math.max(0, state.collisionTimer - deltaTime);

      state.penalties = state.penalties
        .map(penalty => ({ ...penalty, ttl: penalty.ttl - deltaTime }))
        .filter(penalty => penalty.ttl > 0);
    });

    this.buildSnapshot();
  }

  buildSnapshot() {
    const ordered = [...this.carStates].sort((a, b) => b.totalDistance - a.totalDistance);
    const leaderDistance = ordered[0]?.totalDistance ?? 0;

    const bestSectorTimes = [null, null, null];
    ordered.forEach(state => {
      state.lastSectorTimes.forEach((value, idx) => {
        if (value === null) return;
        if (bestSectorTimes[idx] === null || value < bestSectorTimes[idx]) {
          bestSectorTimes[idx] = value;
        }
      });
    });

    let raceFlag = 'green';
    ordered.forEach(state => {
      let driverFlag = 'green';

      if (state.collisionTimer > 2.5) {
        driverFlag = 'red';
        raceFlag = 'red';
      } else if (state.collisionTimer > 0 || state.offTrackTimer > 0) {
        driverFlag = 'yellow';
        if (raceFlag !== 'red') {
          raceFlag = 'yellow';
        }
      } else {
        const lapsDown = (leaderDistance - state.totalDistance) / this.trackLength;
        if (lapsDown >= 1) {
          driverFlag = 'blue';
        }
      }

      state.resolvedFlag = driverFlag;
    });

    const drivers = ordered.map((state, index) => {
      const gapMeters = leaderDistance - state.totalDistance;
      const gapSeconds = index === 0 ? 0 : Math.max(0, gapMeters) / this.averagePace;
      const sectorDeltas = state.lastSectorTimes.map((value, idx) => {
        if (value === null || bestSectorTimes[idx] === null) return null;
        return Number((value - bestSectorTimes[idx]).toFixed(3));
      });

      return {
        id: state.id,
        position: index + 1,
        name: state.driver.name,
        code: state.driver.code,
        team: state.driver.team,
        color: state.color,
        gapToLeader: Number(gapSeconds.toFixed(3)),
        tyreCompound: state.tyreCompound,
        penalties: state.penalties.map(({ type, label, severity }) => ({ type, label, severity })),
        flag: state.resolvedFlag,
        sectorDeltas,
        speed: Number((state.speed * 3.6).toFixed(1)),
        laps: state.lap,
        lastLapTime: state.lastLapTime ? Number(state.lastLapTime.toFixed(3)) : null,
        bestLapTime: state.bestLapTime ? Number(state.bestLapTime.toFixed(3)) : null
      };
    });

    this.snapshot = {
      raceFlag,
      updatedAt: Date.now(),
      drivers
    };
  }

  getTelemetrySnapshot() {
    return this.snapshot;
  }
}
