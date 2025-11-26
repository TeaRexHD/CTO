import { useMemo, useState } from 'react'
import { useRaceControl } from '../context/RaceControlContext'

const flagOptions = [
  { value: 'green', label: 'Green' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' }
]

const penaltyOptions = [
  { value: '5s', label: '5s' },
  { value: '10s', label: '10s' },
  { value: 'dt', label: 'Drive Through' },
  { value: 'stop-go', label: 'Stop & Go' }
]

const penaltyLabels = {
  '5s': '5s time penalty',
  '10s': '10s time penalty',
  dt: 'drive-through penalty',
  'stop-go': 'stop-and-go penalty'
}

const sessionLabel = {
  idle: 'Idle',
  running: 'Live Session',
  paused: 'Paused',
  aborted: 'Aborted'
}

const sessionTone = {
  idle: 'neutral',
  running: 'success',
  paused: 'warning',
  aborted: 'danger'
}

const flagTone = {
  red: 'danger',
  yellow: 'warning',
  blue: 'info',
  green: 'success'
}

const FIAControlPanel = () => {
  const { controlState, carIndex, dispatchControl } = useRaceControl()
  const [selectedCar, setSelectedCar] = useState('')
  const [protestTeam, setProtestTeam] = useState('')
  const [protestIssue, setProtestIssue] = useState('')
  const [errors, setErrors] = useState({})

  const carOptions = useMemo(() => (
    carIndex.map((carId) => ({
      value: String(carId),
      label: `Car ${carId + 1}`
    }))
  ), [carIndex])

  const lastProtest = controlState.protests[controlState.protests.length - 1]
  const lastPenalty = controlState.lastPenalty
  const lastPenaltyCarLabel = Number.isFinite(Number(lastPenalty?.carId))
    ? `Car ${Number(lastPenalty.carId) + 1}`
    : null
  const activeFlag = controlState.flag || 'green'
  const isRunning = controlState.sessionState === 'running'

  const validateProtest = () => {
    const nextErrors = {}
    if (!protestTeam.trim()) {
      nextErrors.team = 'Team is required'
    }
    if (!protestIssue.trim()) {
      nextErrors.issue = 'Provide details for the protest'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSessionCommand = (command) => {
    dispatchControl({
      type: 'SESSION_CMD',
      payload: { command },
      meta: {
        toast: command === 'start' ? 'Session live' : command === 'pause' ? 'Session paused' : 'Session aborted',
        tone: command === 'abort' ? 'danger' : command === 'pause' ? 'warning' : 'success'
      }
    })
  }

  const handleFlagChange = (flag) => {
    dispatchControl({
      type: 'SET_FLAG',
      payload: { flag },
      meta: {
        toast: `${flag.toUpperCase()} flag displayed`,
        tone: flagTone[flag] || 'info'
      }
    })
  }

  const handleSafetyCar = (mode) => {
    dispatchControl({
      type: 'SAFETY_CAR',
      payload: { mode },
      meta: {
        toast: mode === 'release' ? 'Race control: track clear' : mode === 'vsc' ? 'Virtual Safety Car Deployed' : 'Safety Car Deployed',
        tone: mode === 'release' ? 'success' : 'warning'
      }
    })
  }

  const handlePenalty = (penalty) => {
    if (!selectedCar) return
    const carId = Number(selectedCar)
    dispatchControl({
      type: 'ISSUE_PENALTY',
      payload: { carId, penalty },
      meta: {
        toast: `${penaltyLabels[penalty]} for Car ${carId + 1}`,
        tone: 'danger'
      }
    })
  }

  const handleProtestSubmit = (event) => {
    event.preventDefault()
    if (!validateProtest()) {
      return
    }
    dispatchControl({
      type: 'FILE_PROTEST',
      payload: {
        team: protestTeam.trim(),
        issue: protestIssue.trim()
      },
      meta: {
        toast: `Protest filed by ${protestTeam.trim()}`,
        tone: 'info'
      }
    })
    setProtestTeam('')
    setProtestIssue('')
    setErrors({})
  }

  const dismissToast = (toastId) => {
    dispatchControl({ type: 'DISMISS_TOAST', payload: { id: toastId } })
  }

  return (
    <aside className="fia-panel">
      <div className="fia-panel__header">
        <div>
          <p className="panel-label">FIA Operator Console</p>
          <h2>Race Control</h2>
        </div>
        <div className={`status-pill ${sessionTone[controlState.sessionState]}`}>
          {sessionLabel[controlState.sessionState] || 'Idle'}
        </div>
      </div>

      <section className="panel-block">
        <div className="panel-block__title">
          <h3>Session Commands</h3>
          <span className="panel-meta">State: {controlState.sessionState}</span>
        </div>
        <div className="button-grid triple">
          <button
            type="button"
            onClick={() => handleSessionCommand('start')}
            disabled={isRunning}
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => handleSessionCommand('pause')}
            disabled={!isRunning}
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => handleSessionCommand('abort')}
            disabled={controlState.sessionState === 'aborted'}
          >
            Abort
          </button>
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block__title">
          <h3>Flag Control</h3>
          <span className={`flag-indicator ${activeFlag}`}>
            {activeFlag.toUpperCase()} FLAG
          </span>
        </div>
        <div className="button-grid quad">
          {flagOptions.map(flag => (
            <button
              key={flag.value}
              type="button"
              className={activeFlag === flag.value ? 'active' : ''}
              onClick={() => handleFlagChange(flag.value)}
            >
              {flag.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block__title">
          <h3>Safety Car</h3>
          {controlState.safetyCarMode !== 'off' && (
            <span className="badge warning">
              {controlState.safetyCarMode === 'sc' ? 'SC Deployed' : 'VSC Active'}
            </span>
          )}
        </div>
        <div className="button-grid triple">
          <button
            type="button"
            onClick={() => handleSafetyCar('sc')}
            disabled={controlState.safetyCarMode === 'sc'}
          >
            Deploy SC
          </button>
          <button
            type="button"
            onClick={() => handleSafetyCar('vsc')}
            disabled={controlState.safetyCarMode === 'vsc'}
          >
            Deploy VSC
          </button>
          <button
            type="button"
            onClick={() => handleSafetyCar('release')}
            disabled={controlState.safetyCarMode === 'off'}
          >
            Release
          </button>
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block__title">
          <h3>Penalties</h3>
          {lastPenalty && (
            <span className="panel-meta">
              Last: {lastPenaltyCarLabel || 'Car ?'} · {penaltyLabels[lastPenalty.penalty] || lastPenalty.penalty}
            </span>
          )}
        </div>
        <label className="field-label" htmlFor="penalty-car">
          Target Car
        </label>
        <select
          id="penalty-car"
          value={selectedCar}
          onChange={(event) => setSelectedCar(event.target.value)}
          disabled={carOptions.length === 0}
        >
          <option value="">Select a car</option>
          {carOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="button-grid quad">
          {penaltyOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePenalty(option.value)}
              disabled={!selectedCar}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-block__title">
          <h3>Protest Desk</h3>
          {lastProtest && (
            <span className="panel-meta">
              Last: {lastProtest.team} ({new Date(lastProtest.timestamp).toLocaleTimeString()})
            </span>
          )}
        </div>
        <form className="protest-form" onSubmit={handleProtestSubmit}>
          <label className="field-label" htmlFor="protest-team">Team</label>
          <input
            id="protest-team"
            type="text"
            value={protestTeam}
            onChange={(event) => setProtestTeam(event.target.value)}
            placeholder="Team name"
          />
          {errors.team && <p className="field-error">{errors.team}</p>}

          <label className="field-label" htmlFor="protest-issue">Issue</label>
          <textarea
            id="protest-issue"
            value={protestIssue}
            onChange={(event) => setProtestIssue(event.target.value)}
            rows={3}
            placeholder="Describe the incident"
          />
          {errors.issue && <p className="field-error">{errors.issue}</p>}

          <button type="submit" className="primary">Submit Protest</button>
        </form>
      </section>

      {controlState.toasts.length > 0 && (
        <div className="toast-stack">
          {controlState.toasts.map(toast => (
            <div key={toast.id} className={`toast ${toast.tone}`}>
              <span>{toast.message}</span>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">×</button>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

export default FIAControlPanel
