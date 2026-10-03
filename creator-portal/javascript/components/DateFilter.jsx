import { useEffect, useRef, useState } from 'react'
import { formatDayRange, parseDate, toIsoDate, todayIso } from '../lib/format'
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon } from './Icons'

const PRESETS = [
  { value: 'week', chip: 'This week', label: 'This week' },
  { value: '2weeks', chip: 'Next 2 wks', label: 'Next 2 weeks' },
  { value: 'month', chip: 'This month', label: 'This month' },
]

const WEEKDAY_INITIALS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function buttonLabel({ date, from, to }) {
  if (date === 'range') return formatDayRange(from, to)
  return PRESETS.find((p) => p.value === date)?.label ?? 'Any date'
}

// The 42 days (six Sunday-first weeks) shown for the month starting `first`.
function calendarDays(first) {
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// The tinted band joining a range's two ends, drawn behind the day buttons.
function rangeBand(iso, from, end) {
  if (!from || from === end) return ''
  const half = 'from-transparent from-50% to-brand-50 to-50%'
  if (iso === from) return `bg-gradient-to-r ${half}`
  if (iso === end) return `bg-gradient-to-l ${half}`
  return iso > from && iso < end ? 'bg-brand-50' : ''
}

function Calendar({ from, to, onPick }) {
  const [month, setMonth] = useState(() => {
    const d = parseDate(from || todayIso())
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const today = todayIso()
  const end = to || from

  function shift(months) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + months, 1))
  }

  const navButton =
    'w-7 h-7 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-surface hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className={navButton}>
          <ChevronLeftIcon />
        </button>
        <p className="text-sm font-semibold text-gray-900" aria-live="polite">
          {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className={navButton}>
          <ChevronLeftIcon className="rotate-180" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_INITIALS.map((d) => (
          <span key={d} aria-hidden="true" className="text-[11px] font-medium text-gray-400 py-1">
            {d}
          </span>
        ))}
        {calendarDays(month).map((d) => {
          const iso = toIsoDate(d)
          if (d.getMonth() !== month.getMonth()) {
            return (
              <span key={iso} aria-hidden="true" className="h-8 flex items-center justify-center text-[13px] text-gray-300">
                {d.getDate()}
              </span>
            )
          }
          const isEnd = iso === from || iso === end
          return (
            <span
              key={iso}
              className={`h-8 flex items-center justify-center ${rangeBand(iso, from, end)}`}
            >
              <button
                type="button"
                aria-label={d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                aria-pressed={isEnd}
                onClick={() => onPick(iso)}
                className={`w-8 h-8 rounded-full text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                  isEnd
                    ? 'bg-brand text-white font-semibold'
                    : `text-gray-700 hover:bg-surface ${iso === today ? 'font-bold text-gray-900' : ''}`
                }`}
              >
                {d.getDate()}
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function DatePopover({ filters, onChange, onClose }) {
  // The range being picked; nothing changes until Apply.
  const [pending, setPending] = useState(() =>
    filters.date === 'range' ? { from: filters.from, to: filters.to } : { from: '', to: '' },
  )

  // The first pick starts a range, the second ends it (in either order).
  function pick(iso) {
    setPending(({ from, to }) => {
      if (!from || to) return { from: iso, to: '' }
      const [start, end] = [from, iso].sort()
      return { from: start, to: end }
    })
  }

  function choose(patch) {
    onChange(patch)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-label="Date"
      className="absolute left-0 top-full mt-2 z-50 w-[288px] max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-line shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3 animate-fade-in"
    >
      <div className="grid grid-cols-3 gap-1 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={filters.date === p.value}
            onClick={() => choose({ date: p.value, from: '', to: '' })}
            className={`py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              filters.date === p.value
                ? 'bg-brand text-white'
                : 'bg-surface text-gray-600 hover:text-brand'
            }`}
          >
            {p.chip}
          </button>
        ))}
      </div>

      <Calendar from={pending.from} to={pending.to} onPick={pick} />

      <p className="text-xs text-gray-500 text-center mt-2 min-h-4">
        {pending.from && formatDayRange(pending.from, pending.to || pending.from)}
      </p>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          onClick={() => choose({ date: '', from: '', to: '' })}
          className="py-2 rounded-lg border border-line-strong text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!pending.from}
          onClick={() =>
            choose({ date: 'range', from: pending.from, to: pending.to || pending.from })
          }
          className="py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:bg-brand/40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

// The Date control: presets, or a custom range picked on a calendar.
// `onChange` receives a { date, from, to } patch.
export default function DateFilter({ filters, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e) => {
      if (!ref.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const label = buttonLabel(filters)

  // On phones the popover anchors to the filter row (so it stays on screen);
  // from `sm` up it sits under this control.
  return (
    <div ref={ref} className="sm:relative shrink-0">
      <button
        type="button"
        aria-label={`Date: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 hover:border-[#ccc] ${
          filters.date ? 'border-brand/50 text-brand font-medium' : 'border-line-strong text-gray-600'
        }`}
      >
        <CalendarIcon className="text-gray-400" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDownIcon className="text-gray-400" />
      </button>
      {open && (
        <DatePopover filters={filters} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  )
}
