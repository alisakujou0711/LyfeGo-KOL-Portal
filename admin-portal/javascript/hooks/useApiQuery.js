import { useCallback, useEffect, useState } from 'react'

// Loads `load(params)`, loading again whenever the params change. `status` is
// 'loading' | 'ready' | 'error' (with the rejection as `error`); while a reload
// runs, the previous `data` stays on screen. `reload` loads again, e.g. to retry after an error or to
// pick up a change just saved.
export function useApiQuery(load, params) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify(params)

  useEffect(() => {
    let current = true
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    load(JSON.parse(key)).then(
      (data) => current && setState({ status: 'ready', data, error: null }),
      (error) => current && setState({ status: 'error', data: null, error }),
    )
    return () => {
      current = false
    }
  }, [load, key, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, reload }
}
