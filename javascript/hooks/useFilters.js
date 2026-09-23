import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isSameMonth, isWithinDays } from '../lib/format'

// Filters live in the URL (?category=Sport&collab=Paid…) so the back button
// and page refresh keep the user's selection.
export const DEFAULT_FILTERS = {
  category: '',
  collab: '',
  location: '',
  date: '',
  sport: '',
}

export function useFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const next = { ...DEFAULT_FILTERS }
    for (const key of Object.keys(DEFAULT_FILTERS)) next[key] = params.get(key) ?? ''
    // The sport filter only applies inside the Sport category.
    if (next.category === 'Lifestyle') next.sport = ''
    return next
  }, [params])

  const setFilter = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          if (key === 'category' && value === 'Lifestyle') next.delete('sport')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clearFilters = useCallback(() => setParams({}, { replace: true }), [setParams])

  const isActive = Object.values(filters).some(Boolean)

  return { filters, setFilter, clearFilters, isActive }
}

function matchesDate(opportunity, date) {
  if (!date) return true
  const dates = opportunity.sessions.map((s) => s.date)
  if (opportunity.deadline) dates.push(opportunity.deadline)
  if (dates.length === 0) return false
  if (date === 'week') return dates.some((d) => isWithinDays(d, 7))
  if (date === 'month') return dates.some(isSameMonth)
  return true
}

export function applyFilters(list, filters) {
  return list.filter(
    (o) =>
      (!filters.category || o.category === filters.category) &&
      (!filters.collab || o.collab === filters.collab) &&
      (!filters.location || o.location === filters.location) &&
      (!filters.sport || o.sport === filters.sport) &&
      matchesDate(o, filters.date),
  )
}
