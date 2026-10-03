import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDays, parseDate, toIsoDate, todayIso } from '../lib/format'

// Filters live in the URL (?category=Sport&compensation=Paid…) so the back
// button and page refresh keep the user's selection. The date is a preset
// (date=week | 2weeks | month) or a custom range (date=range&from=…&to=…).
export const DEFAULT_FILTERS = {
  category: '',
  compensation: '',
  area: '',
  date: '',
  from: '',
  to: '',
  collaboration: '',
  deliverables: '',
}

const DATE_PRESETS = ['week', '2weeks', 'month']
// "2026-09-24" names a real calendar date (not "2026-13-45").
function isCalendarDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toIsoDate(parseDate(iso)) === iso
}

// Drops an unknown date value. A range needs a valid start; a missing end
// means a single day, and a reversed range is put in order.
function normaliseDate(filters) {
  if (DATE_PRESETS.includes(filters.date)) return { ...filters, from: '', to: '' }
  if (filters.date !== 'range') return { ...filters, date: '', from: '', to: '' }
  const [from, to] = [filters.from, filters.to || filters.from].sort()
  if (!isCalendarDate(from) || !isCalendarDate(to)) return { ...filters, date: '', from: '', to: '' }
  return { ...filters, from, to }
}

export function useFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => {
    const next = { ...DEFAULT_FILTERS }
    for (const key of Object.keys(DEFAULT_FILTERS)) next[key] = params.get(key) ?? ''
    return normaliseDate(next)
  }, [params])

  // Merges `patch` ({ key: value }) into the URL; an empty value removes the key.
  const setFilters = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clearFilters = useCallback(() => setParams({}, { replace: true }), [setParams])

  const isActive = Object.values(filters).some(Boolean)

  return { filters, setFilters, clearFilters, isActive }
}

// "tanjong" matches "Tanjong Pagar".
function matchesArea(opportunity, area) {
  const query = area.trim().toLowerCase()
  return !query || opportunity.area.toLowerCase().includes(query)
}

// The inclusive [from, to] ISO dates a date filter covers: "This week" is
// today and the next six days, "Next 2 weeks" today and the next thirteen,
// "This month" the current calendar month.
function dateRange({ date, from, to }) {
  const today = todayIso()
  if (date === 'week') return [today, addDays(today, 6)]
  if (date === '2weeks') return [today, addDays(today, 13)]
  if (date === 'month') {
    const start = parseDate(today)
    start.setDate(1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return [toIsoDate(start), toIsoDate(end)]
  }
  if (date === 'range') return [from, to]
  return null
}

// Matches when any Available Session falls in the range; each Opportunity is
// one card, so it is still listed once.
function matchesDate(opportunity, filters) {
  const range = dateRange(filters)
  if (!range) return true
  const [from, to] = range
  return opportunity.availableDates.some((iso) => iso >= from && iso <= to)
}

export function applyFilters(list, filters) {
  return list.filter(
    (o) =>
      (!filters.category || o.category === filters.category) &&
      (!filters.compensation || o.compensationType === filters.compensation) &&
      (!filters.collaboration || o.collaborationType === filters.collaboration) &&
      (!filters.deliverables || o.deliverableType === filters.deliverables) &&
      matchesArea(o, filters.area) &&
      matchesDate(o, filters),
  )
}
