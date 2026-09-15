// Date / string helpers. All dates are handled as local calendar dates.

const DAY_MS = 24 * 60 * 60 * 1000

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// "Saturday, 12 September"
export function formatLongDate(iso) {
  const d = parseDate(iso)
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  return `${weekday}, ${formatShortDate(iso)}`
}

// "12 September"
export function formatShortDate(iso) {
  return parseDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatTimeRange(session) {
  return `${formatTime(session.start)} – ${formatTime(session.end)}`
}

export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function isWithinDays(iso, days) {
  const diff = parseDate(iso) - startOfToday()
  return diff >= 0 && diff < days * DAY_MS
}

export function isSameMonth(iso) {
  const today = new Date()
  const date = parseDate(iso)
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth()
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}
