import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Holds the user's in-progress registration (chosen session per opportunity,
// form draft) and the last submitted registration for the confirmation page.
// Persisted to sessionStorage so a refresh mid-flow doesn't lose progress.

const STORAGE_KEY = 'lyfego.registration'
const RegistrationContext = createContext(null)

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function RegistrationProvider({ children }) {
  const [state, setState] = useState(() => ({
    sessions: {}, // { [opportunityId]: sessionId }
    drafts: {}, // { [opportunityId]: formValues }
    submitted: null, // { opportunityId, sessionId, values, id }
    ...load(),
  }))

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable — keep state in memory only */
    }
  }, [state])

  const selectSession = useCallback((opportunityId, sessionId) => {
    setState((s) => ({ ...s, sessions: { ...s.sessions, [opportunityId]: sessionId } }))
  }, [])

  const saveDraft = useCallback((opportunityId, values) => {
    setState((s) => ({ ...s, drafts: { ...s.drafts, [opportunityId]: values } }))
  }, [])

  const setSubmitted = useCallback((submitted) => {
    setState((s) => {
      const drafts = { ...s.drafts }
      const sessions = { ...s.sessions }
      delete drafts[submitted.opportunityId]
      delete sessions[submitted.opportunityId]
      return { ...s, drafts, sessions, submitted }
    })
  }, [])

  const value = useMemo(
    () => ({
      selectedSessionId: (id) => state.sessions[id] ?? null,
      draft: (id) => state.drafts[id] ?? null,
      submitted: state.submitted,
      selectSession,
      saveDraft,
      setSubmitted,
    }),
    [state, selectSession, saveDraft, setSubmitted],
  )

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>
}

export function useRegistration() {
  const ctx = useContext(RegistrationContext)
  if (!ctx) throw new Error('useRegistration must be used inside RegistrationProvider')
  return ctx
}
