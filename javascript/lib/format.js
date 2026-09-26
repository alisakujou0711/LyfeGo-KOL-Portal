// Date / string helpers. All dates are handled as local calendar dates.

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

// A local calendar date as "2026-09-24".
export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Today's date in Singapore, where every Session takes place, as "2026-09-24"
// ("en-CA" formats dates as YYYY-MM-DD).
export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
}

// "2026-09-24" plus `days` calendar days.
export function addDays(iso, days) {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

// "25 Sep", or "25 Sep – 27 Sep" for a range of more than one day.
export function formatDayRange(from, to) {
  const short = (iso) => {
    const d = parseDate(iso)
    return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
  }
  return from === to ? short(from) : `${short(from)} – ${short(to)}`
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Thu, 24 Sep" (fixed names: browsers disagree on "Sep" vs "Sept")
export function formatCardDate(iso) {
  const d = parseDate(iso)
  return `${SHORT_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// "8pm", "8:30am"
function compactTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}

// "8–9pm", "11am–12pm": the start drops am/pm when the end shares it.
function compactTimeRange({ start, end }) {
  const from = compactTime(start)
  const to = compactTime(end)
  return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`
}

// A Discover card's schedule line: the first weekly class, e.g.
// "Weekly · Sat 8–9pm"; "Saturdays from 26 Sep" when every available date
// falls on one weekday, "Multiple dates available" when they don't, else the
// next Session, e.g. "Thu, 24 Sep · 10:00 AM".
export function formatSchedule({ nextSession, availableDates, weeklyClasses }) {
  if (weeklyClasses.length > 0) {
    const [weekly] = weeklyClasses
    return `Weekly · ${weekly.day.slice(0, 3)} ${compactTimeRange(weekly)}`
  }
  if (availableDates.length < 2) return `${formatCardDate(nextSession.date)} · ${formatTime(nextSession.start)}`
  const weekdays = new Set(availableDates.map((iso) => parseDate(iso).getDay()))
  if (weekdays.size > 1) return 'Multiple dates available'
  const first = parseDate(availableDates[0])
  return `${WEEKDAYS[first.getDay()]}s from ${first.getDate()} ${SHORT_MONTHS[first.getMonth()]}`
}

const CURRENCY_SYMBOLS = { SGD: 'S$' }

// "S$150", "S$200.50", "USD 80"
export function formatAmount({ currency, amount }) {
  const figure = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol ? `${symbol}${figure}` : `${currency} ${figure}`
}

// "per completed collaboration", "per post", "flat fee"
export function formatBasis({ basis }) {
  return basis.toLowerCase()
}

// Barter, Paid, or Paid + Perk when a Paid Opportunity has a compensation note
// (shown uppercase).
export function compensationLabel(opportunity) {
  if (opportunity.compensationType !== 'Paid') return 'Barter'
  return opportunity.payment.note ? 'Paid + Perk' : 'Paid'
}

// Experience / Skill Level is informational; Not Applicable isn't shown.
export function visibleExperienceLevels(opportunity) {
  return opportunity.experienceLevels.filter((level) => level !== 'Not Applicable')
}

// Cuts `text` at a word boundary so it fits in `max` characters, ending in "…".
export function shorten(text, max = 60) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}
