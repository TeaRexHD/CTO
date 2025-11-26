const DRIVER_NAMES = [
  'Lena Hartmann',
  'Max Dalton',
  'Isla Moretti',
  'Noah Renshaw',
  'Soren Takahashi',
  'Maya Velasco',
  'Julian Pierce',
  'Aria Beaumont',
  'Theo Richter',
  'Cass Santos',
  'Leo Vasseur',
  'Nina Kohler',
  'Victor Hale',
  'Zara Petrov',
  'Hugo Kwon',
  'Amelia Frost',
  'Miles Navarro',
  'Ivy Martell',
  'Jonas Reeve',
  'Serena Okoye',
  'Dmitri Alvarez',
  'Mara Sinclair',
  'Tomas Ibarra',
  'Liv Anders',
  'Callum Reyes',
  'Aya Solberg',
  'Bruno Calder',
  'Emilia Strauss',
  'Rowan Mercer',
  'Talia Rindt',
  'Luca Serrano',
  'Imani Rivers',
  'Ezra Whitman',
  'Selene Park',
  'Harris Lockwood',
  'Viola Nakamoto',
  'Ethan Koval',
  'Mira Delgado',
  'Kasper Lund',
  'Sasha Beaumont',
  'Felicity Zhou',
  'Rafael Dominguez',
  'June Kessler',
  'Otto Varga',
  'Naomi Bishop',
  'Darius Quade',
  'Sienna Park',
  'Omar Vaziri',
  'Helena Stroud',
  'Lior Kade',
  'Astrid Volkov',
  'Mateo Laurent',
  'Ines Takagi',
  'Silas Kruger',
  'Jade Carver',
  'Nikolai Hart',
  'Lucia Andretti',
  'Marco Idris',
  'Esme Calderon',
  'Tarek Foster',
  'Jasper Quinn',
  'Nia McLaren',
  'Felix Romano',
  'Harper Wolfe',
  'Marek Zielinski',
  'Callie Rivers',
  'Roman Duarte',
  'Elliot Shaw',
  'Priya Narang',
  'Oscar Levin',
  'Yara Bennett',
  'Kai Aoki'
];

const TEAM_NAMES = [
  'Apex GP',
  'Velocity Racing',
  'Solaris Motorsport',
  'Titan Dynamics',
  'Nova Corse',
  'Prism Autosport',
  'Hyperion Works',
  'Artemis Engineering'
];

const TEMPERAMENTS = ['calm', 'fiery', 'measured'];

const INCIDENT_PHRASES = {
  collision: 'We were tagged in a collision',
  'track-limits': 'Ran out of room at the exit',
  spin: 'Car rotated on its own',
  'drs-activation': 'DRS behaved oddly',
  overtake: 'Clean overtake complete',
  default: 'Situation developing'
};

const DEFAULT_CAR_IDS = Array.from({ length: 20 }, (_, index) => index);

export class TeamRadioManager {
  constructor(raceDirector) {
    this.raceDirector = raceDirector;
    this.unsubscribeFns = [];
    this.driverProfiles = new Map();
    this.history = [];
    this.maxHistory = 20;
    this.registerListeners();
  }

  registerListeners() {
    const bindings = [
      ['penalty', this.handlePenalty],
      ['protest', this.handleProtest],
      ['incident', this.handleIncident],
      ['safetyCar', this.handleSafetyCar]
    ];

    bindings.forEach(([event, handler]) => {
      const bound = handler.bind(this);
      const unsubscribe = this.raceDirector.subscribe(event, bound);
      this.unsubscribeFns.push(unsubscribe);
    });
  }

  destroy() {
    this.unsubscribeFns.forEach(unsub => unsub && unsub());
    this.unsubscribeFns = [];
    this.history = [];
  }

  getRaceTime() {
    return this.raceDirector?.raceMeta?.totalRaceTime ?? 0;
  }

  emitTransmission(payload) {
    const transmission = {
      id: `radio-${Date.now()}-${Math.random()}`,
      timestamp: this.getRaceTime(),
      tone: payload.tone || 'calm',
      message: payload.message,
      carId: payload.carId ?? null
    };

    this.history.push(transmission);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.raceDirector.emit('teamRadio', transmission);
  }

  handlePenalty(penalty) {
    if (!penalty) return;

    const penalized = this.getDriverProfile(penalty.carId);
    if (penalized) {
      const complaint = `${penalized.driver}: That ${penalty.type} penalty is brutal, we barely stepped over the line.`;
      this.emitTransmission({
        message: complaint,
        tone: 'angry',
        carId: penalty.carId
      });
    }

    const rival = this.getRivalFor(penalty.carId);
    if (rival) {
      const praiseTarget = penalized ? penalized.driver.split(' ')[0] : `car ${penalty.carId}`;
      const praise = `${rival.team} pit wall: Copy, ${praiseTarget} picked up a ${penalty.type}. Keep it tidy.`;
      this.emitTransmission({
        message: praise,
        tone: 'calm',
        carId: rival.carId
      });
    }
  }

  handleProtest(protest) {
    if (!protest) return;

    const team = this.getDriverProfile(protest.carId);
    const target = this.getDriverProfile(protest.targetCarId);
    const caller = team ? `${team.team}` : 'Pit wall';
    const accused = target ? target.driver : `car ${protest.targetCarId}`;
    const detail = protest.reason || protest.issue || 'Requesting steward review.';

    this.emitTransmission({
      message: `${caller}: Lodging protest on ${accused}. ${detail}`,
      tone: 'angry',
      carId: protest.carId
    });
  }

  handleIncident(incident) {
    if (!incident) return;

    const driver = this.getDriverProfile(incident.carId);
    const descriptor = INCIDENT_PHRASES[incident.type] || INCIDENT_PHRASES.default;
    const location = incident.location ? ` at ${incident.location}` : '';
    const speaker = driver ? driver.driver : 'Race engineer';
    const fiery = driver?.temperament === 'fiery';
    const tone = incident.severity === 'High' || (fiery && incident.severity !== 'Info') ? 'angry' : 'calm';
    const suffix = tone === 'angry' ? 'Need help immediately.' : 'Will keep it steady.';

    this.emitTransmission({
      message: `${speaker}: ${descriptor}${location}. ${suffix}`,
      tone,
      carId: incident.carId ?? null
    });
  }

  handleSafetyCar(payload) {
    if (!payload) return;

    const driver = this.getRandomProfile();
    const prefix = payload.active ? 'Safety car deployed' : 'Safety car ending';
    const reason = payload.reason ? ` ${payload.reason}` : '';
    const speaker = driver ? driver.driver : 'Race control';

    this.emitTransmission({
      message: `${speaker}: ${prefix}.${reason}`,
      tone: 'calm',
      carId: driver?.carId ?? null
    });
  }

  getDriverProfile(carId) {
    if (carId === null || carId === undefined) {
      return null;
    }

    if (!this.driverProfiles.has(carId)) {
      this.driverProfiles.set(carId, this.createDriverProfile(carId));
    }

    return this.driverProfiles.get(carId);
  }

  createDriverProfile(carId) {
    return {
      carId,
      driver: DRIVER_NAMES[carId % DRIVER_NAMES.length],
      team: TEAM_NAMES[carId % TEAM_NAMES.length],
      temperament: TEMPERAMENTS[carId % TEMPERAMENTS.length]
    };
  }

  getRivalFor(carId) {
    const ids = this.getKnownCarIds().filter(id => id !== carId);
    if (ids.length === 0) return null;
    const rivalId = ids[Math.floor(Math.random() * ids.length)];
    return this.getDriverProfile(rivalId);
  }

  getKnownCarIds() {
    if (this.raceDirector?.carTelemetry) {
      const ids = Array.from(this.raceDirector.carTelemetry.keys());
      if (ids.length) return ids;
    }
    return DEFAULT_CAR_IDS;
  }

  getRandomProfile() {
    const ids = this.getKnownCarIds();
    if (ids.length === 0) return null;
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    return this.getDriverProfile(randomId);
  }
}
