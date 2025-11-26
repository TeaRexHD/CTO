import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { RaceDirector } from '../engine/RaceDirector'

const RaceControlContext = createContext(null)

const createToastId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const initialState = {
  sessionState: 'idle',
  flag: 'green',
  safetyCarMode: 'off',
  lastPenalty: null,
  protests: [],
  toasts: []
}

const appendToast = (toasts, meta) => {
  if (!meta || !meta.toast) {
    return toasts
  }

  const toast = {
    id: meta.id ?? createToastId(),
    message: meta.toast,
    tone: meta.tone || 'info',
    expiresAt: meta.expiresAt ?? Date.now() + (meta.duration || 4000)
  }

  const filtered = toasts.filter(item => item.id !== toast.id)
  return [...filtered, toast].slice(-4)
}

const controlReducer = (state, action) => {
  switch (action.type) {
    case 'SESSION_CMD': {
      const command = action.payload?.command
      let sessionState = state.sessionState
      if (command === 'start' || command === 'running') {
        sessionState = 'running'
      } else if (command === 'pause' || command === 'paused') {
        sessionState = 'paused'
      } else if (command === 'abort' || command === 'aborted') {
        sessionState = 'aborted'
      } else if (command === 'idle') {
        sessionState = 'idle'
      }
      return {
        ...state,
        sessionState,
        toasts: appendToast(state.toasts, action.meta)
      }
    }
    case 'SET_FLAG':
      return {
        ...state,
        flag: action.payload?.flag ?? state.flag,
        toasts: appendToast(state.toasts, action.meta)
      }
    case 'SAFETY_CAR': {
      const mode = action.payload?.mode
      let safetyCarMode = state.safetyCarMode
      if (mode === 'release') {
        safetyCarMode = 'off'
      } else if (mode === 'vsc') {
        safetyCarMode = 'vsc'
      } else if (mode === 'sc') {
        safetyCarMode = 'sc'
      }
      return {
        ...state,
        safetyCarMode,
        toasts: appendToast(state.toasts, action.meta)
      }
    }
    case 'ISSUE_PENALTY': {
      const penaltyId = action.payload?.id ?? `${action.payload?.carId ?? 'na'}-${action.meta?.timestamp ?? Date.now()}`
      if (state.lastPenalty?.id === penaltyId) {
        return {
          ...state,
          toasts: appendToast(state.toasts, action.meta)
        }
      }
      return {
        ...state,
        lastPenalty: {
          id: penaltyId,
          carId: action.payload?.carId,
          penalty: action.payload?.penalty,
          timestamp: action.meta?.timestamp ?? Date.now()
        },
        toasts: appendToast(state.toasts, action.meta)
      }
    }
    case 'FILE_PROTEST': {
      const protestId = action.payload?.id ?? `${action.payload?.team ?? 'team'}-${action.meta?.timestamp ?? Date.now()}`
      const exists = state.protests.some(protest => protest.id === protestId)
      const nextProtests = exists
        ? state.protests
        : [
            ...state.protests,
            {
              id: protestId,
              team: action.payload?.team,
              issue: action.payload?.issue,
              carId: action.payload?.carId ?? null,
              timestamp: action.meta?.timestamp ?? Date.now()
            }
          ].slice(-5)
      return {
        ...state,
        protests: nextProtests,
        toasts: appendToast(state.toasts, action.meta)
      }
    }
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.id !== action.payload?.id)
      }
    case 'SWEEP_TOASTS':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.expiresAt > (action.payload?.now ?? 0))
      }
    default:
      return state
  }
}

export const RaceControlProvider = ({ children }) => {
  const raceDirectorRef = useRef()
  if (!raceDirectorRef.current) {
    raceDirectorRef.current = new RaceDirector()
  }

  const [controlState, dispatch] = useReducer(controlReducer, initialState)
  const [carIndex, setCarIndex] = useState([])

  useEffect(() => {
    const raceDirector = raceDirectorRef.current
    const unsubscribeTelemetry = raceDirector.subscribe('telemetry', ({ carId }) => {
      setCarIndex(prev => {
        if (prev.includes(carId)) {
          return prev
        }
        const next = [...prev, carId].sort((a, b) => a - b)
        return next
      })
    })

    return () => {
      unsubscribeTelemetry()
      raceDirector.destroy()
    }
  }, [])

  useEffect(() => {
    const raceDirector = raceDirectorRef.current
    const unsubscribers = [
      raceDirector.subscribe('flagChange', ({ flag }) => {
        dispatch({ type: 'SET_FLAG', payload: { flag }, meta: { timestamp: Date.now() } })
      }),
      raceDirector.subscribe('safetyCarChange', ({ mode }) => {
        dispatch({ type: 'SAFETY_CAR', payload: { mode }, meta: { timestamp: Date.now() } })
      }),
      raceDirector.subscribe('sessionChange', ({ state }) => {
        dispatch({ type: 'SESSION_CMD', payload: { command: state }, meta: { timestamp: Date.now() } })
      }),
      raceDirector.subscribe('penaltyIssued', (penalty) => {
        if (!penalty) return
        dispatch({
          type: 'ISSUE_PENALTY',
          payload: { id: penalty.id, carId: penalty.carId, penalty: penalty.type },
          meta: { timestamp: Date.now() }
        })
      }),
      raceDirector.subscribe('protestFiled', (protest) => {
        if (!protest) return
        dispatch({
          type: 'FILE_PROTEST',
          payload: {
            id: protest.id,
            team: protest.team,
            issue: protest.issue || protest.reason,
            carId: protest.carId ?? null
          },
          meta: { timestamp: Date.now() }
        })
      })
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub && unsub())
    }
  }, [dispatch])

  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: 'SWEEP_TOASTS', payload: { now: Date.now() } })
    }, 1000)
    return () => clearInterval(timer)
  }, [dispatch])

  const dispatchControl = useCallback((action) => {
    const raceDirector = raceDirectorRef.current
    let nextPayload = action.payload

    switch (action.type) {
      case 'SESSION_CMD': {
        const command = action.payload?.command
        if (command === 'start') {
          raceDirector.startSession()
        } else if (command === 'pause') {
          raceDirector.pauseSession()
        } else if (command === 'abort') {
          raceDirector.abortSession()
        }
        break
      }
      case 'SET_FLAG':
        raceDirector.setFlag(action.payload?.flag)
        break
      case 'SAFETY_CAR': {
        const mode = action.payload?.mode
        if (mode === 'vsc') {
          raceDirector.deployVirtualSafetyCar()
        } else if (mode === 'release') {
          raceDirector.releaseSafetyCar()
        } else if (mode === 'sc') {
          raceDirector.deploySafetyCar()
        }
        break
      }
      case 'ISSUE_PENALTY': {
        const targetId = Number(action.payload?.carId)
        if (Number.isFinite(targetId)) {
          const penalty = raceDirector.issuePenalty(targetId, action.payload?.penalty)
          nextPayload = { ...action.payload, id: penalty?.id }
        }
        break
      }
      case 'FILE_PROTEST': {
        const protest = raceDirector.fileProtest({
          team: action.payload?.team,
          issue: action.payload?.issue
        })
        nextPayload = { ...action.payload, id: protest?.id }
        break
      }
      default:
        break
    }

    const meta = action.meta || {}
    const annotatedMeta = meta.toast
      ? { ...meta, id: meta.id ?? createToastId(), timestamp: meta.timestamp ?? Date.now() }
      : { ...meta, timestamp: meta.timestamp ?? Date.now() }

    dispatch({ ...action, payload: nextPayload, meta: annotatedMeta })
  }, [dispatch])

  const value = useMemo(() => ({
    raceDirector: raceDirectorRef.current,
    controlState,
    carIndex,
    dispatchControl
  }), [controlState, carIndex, dispatchControl])

  return (
    <RaceControlContext.Provider value={value}>
      {children}
    </RaceControlContext.Provider>
  )
}

export const useRaceControl = () => {
  const context = useContext(RaceControlContext)
  if (!context) {
    throw new Error('useRaceControl must be used within RaceControlProvider')
  }
  return context
}
