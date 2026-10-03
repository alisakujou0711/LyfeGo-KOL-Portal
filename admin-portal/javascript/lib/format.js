import { formatLongDate, formatTimeRange } from '../../../creator-portal/javascript/lib/format'

// "Saturday, 27 September · 8:00 PM – 9:00 PM"
export function formatSessionLine(session) {
  return `${formatLongDate(session.date)} · ${formatTimeRange(session)}`
}

// Handles are stored without their @.
export function formatHandle(handle) {
  return `@${handle}`
}
