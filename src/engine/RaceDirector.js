const DEFAULT_STATE = {
  currentFlag: 'green',
  safetyMode: 'none',
  isPaused: false,
  isAborted: false,
  admin: {
    startReleasesOpen: false,
    techReviewActive: false,
    parcFermeLocked: true,
    protestPending: false
  },
  eventLog: []
};

const FLAG_LABELS = {
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
  blue: 'Blue',
  black: 'Black',
  meatball: 'Black/Orange'
};

const createLogEntry = (message, command, payload) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  timestamp: new Date().toLocaleTimeString(),
  message,
  command,
  payload
});

export class RaceDirector {
  constructor() {
    this.state = {
      ...DEFAULT_STATE,
      admin: { ...DEFAULT_STATE.admin },
      eventLog: []
    };
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispatch(command, payload = {}) {
    let nextState = { ...this.state };
    let message = '';

    switch (command) {
      case 'SET_FLAG': {
        const { flag } = payload;
        if (!flag || flag === this.state.currentFlag) return;

        nextState.currentFlag = flag;
        if (flag === 'green') {
          nextState.safetyMode = 'none';
          nextState.isPaused = false;
        }
        if (flag === 'red') {
          nextState.isPaused = true;
        }

        const flagLabel = FLAG_LABELS[flag] || flag;
        message = `${flagLabel} flag issued`;
        break;
      }

      case 'ISSUE_PENALTY': {
        const { penalty } = payload;
        if (!penalty) return;
        nextState.lastPenalty = penalty;
        message = `${penalty} penalty delivered`;
        break;
      }

      case 'SAFETY_ACTION': {
        const { action } = payload;
        if (!action) return;

        if (action === 'SC') {
          if (this.state.safetyMode === 'SC') {
            nextState.safetyMode = 'none';
            message = 'Safety car recalled';
          } else if (this.state.safetyMode === 'none') {
            nextState.safetyMode = 'SC';
            nextState.isPaused = false;
            message = 'Safety car deployed';
          } else {
            return;
          }
        } else if (action === 'VSC') {
          if (this.state.safetyMode === 'VSC') {
            nextState.safetyMode = 'none';
            message = 'Virtual safety car ended';
          } else if (this.state.safetyMode === 'none') {
            nextState.safetyMode = 'VSC';
            nextState.isPaused = false;
            message = 'Virtual safety car deployed';
          } else {
            return;
          }
        } else if (action === 'PAUSE') {
          nextState.isPaused = !this.state.isPaused;
          message = nextState.isPaused ? 'Race paused' : 'Race resumed';
        } else if (action === 'ABORT') {
          if (this.state.isAborted) return;
          nextState.isAborted = true;
          nextState.isPaused = true;
          nextState.safetyMode = 'none';
          nextState.currentFlag = 'red';
          message = 'Race aborted';
        }
        break;
      }

      case 'ADMIN_ACTION': {
        const { action } = payload;
        if (!action) return;
        const adminState = { ...this.state.admin };

        if (action === 'START_RELEASES') {
          adminState.startReleasesOpen = !adminState.startReleasesOpen;
          message = adminState.startReleasesOpen
            ? 'Pit start releases opened'
            : 'Pit start releases closed';
        } else if (action === 'TECH_REVIEW') {
          adminState.techReviewActive = !adminState.techReviewActive;
          message = adminState.techReviewActive
            ? 'Technical infraction under review'
            : 'Technical infraction cleared';
        } else if (action === 'PARC_FERME') {
          adminState.parcFermeLocked = !adminState.parcFermeLocked;
          message = adminState.parcFermeLocked
            ? 'Parc fermé secured'
            : 'Parc fermé released';
        } else if (action === 'PROTEST') {
          adminState.protestPending = !adminState.protestPending;
          message = adminState.protestPending
            ? 'Protest lodged for review'
            : 'Protest resolved';
        } else {
          return;
        }

        nextState.admin = adminState;
        break;
      }

      default:
        return;
    }

    if (!message) return;

    nextState.eventLog = [
      createLogEntry(message, command, payload),
      ...this.state.eventLog
    ].slice(0, 30);

    this.state = nextState;
    this._emit();
  }

  _emit() {
    this.listeners.forEach(listener => listener(this.state));
  }
}
