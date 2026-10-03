import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Holds the user's in-progress registration (chosen session per opportunity,
// form draft) and the last submitted registration for the confirmation page.
// The in-progress parts are persisted to sessionStorage so a refresh mid-flow
// doesn't lose progress; the submitted registration is kept in memory only, so
// a refreshed confirmation page redirects instead of showing (or resubmitting).

const STORAGE_KEY = 'lyfego.registration'
const RegistrationContext = createContext(null)

function load() {
  try {
    const { sessions = {}, drafts = {} } = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? {}
    return { sessions, drafts }
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
      const { sessions, drafts } = state
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, drafts }))
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
