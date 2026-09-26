import { useCallback, useEffect, useState } from 'react'
import { listOpportunities } from '../lib/api'

// Loads the Discover list. `status` is 'loading' | 'ready' | 'error';
// `retry` refetches after an error.
export function useDiscoverList() {
  const [state, setState] = useState({ status: 'loading', opportunities: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    setState({ status: 'loading', opportunities: [] })
    listOpportunities().then(
      (opportunities) => current && setState({ status: 'ready', opportunities }),
      () => current && setState({ status: 'error', opportunities: [] }),
    )
    return () => {
      current = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, retry }
}
