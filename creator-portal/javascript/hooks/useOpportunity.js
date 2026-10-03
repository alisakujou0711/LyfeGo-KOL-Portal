import { useCallback, useEffect, useState } from 'react'
import { getOpportunity } from '../lib/api'

// Loads one Opportunity. `status` is 'loading' | 'ready' | 'notFound' | 'error';
// `retry` refetches after an error.
export function useOpportunity(id) {
  const [state, setState] = useState({ status: 'loading', opportunity: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    setState({ status: 'loading', opportunity: null })
    getOpportunity(id).then(
      (opportunity) =>
        current && setState({ status: opportunity ? 'ready' : 'notFound', opportunity }),
      () => current && setState({ status: 'error', opportunity: null }),
    )
    return () => {
      current = false
    }
  }, [id, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, retry }
}

// The chosen Session, one-off or in a weekly class, only while it can still be
// applied for.
export function availableSession(opportunity, sessionId) {
  const sessions = [...opportunity.sessions, ...opportunity.weeklyClasses.flatMap((weekly) => weekly.sessions)]
  return sessions.find((s) => s.id === sessionId && s.status === 'available') ?? null
}
