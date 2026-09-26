import { useState } from 'react'
import { CheckIcon, ChevronDownIcon } from './Icons'
import { formatCardDate, formatLongDate, formatTimeRange } from '../lib/format'

// A weekly class shows this many dates before "+N more".
const VISIBLE_DATES = 5

// Listed Sessions are Available or Filled.
function isFilled(session) {
  return session.status !== 'available'
}

function GroupHeading({ children }) {
  return <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{children}</h3>
}

// Weekly classes, then one-off Sessions; the group headings appear only when
// both exist. Filled Sessions stay visible but cannot be chosen.
export default function SessionPicker({
  weeklyClasses,
  sessions,
  selectedId,
  onSelect,
  showHint,
  hintKey,
}) {
  const showGroupHeadings = weeklyClasses.length > 0 && sessions.length > 0
  const choose = (session) => onSelect(session.id === selectedId ? null : session.id)

  return (
    <div id="choose-session" className="flex flex-col gap-2.5 scroll-mt-40">
      {showHint && (
        <div
          key={hintKey}
          role="alert"
          className="flex items-center gap-2 text-sm font-medium text-brand bg-brand-50 border border-brand/20 rounded-lg px-3 py-2.5 animate-shake"
        >
          <span className="text-base" aria-hidden="true">
            👇
          </span>
          Please select an available session before registering.
        </div>
      )}

      {weeklyClasses.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {showGroupHeadings && <GroupHeading>Weekly classes</GroupHeading>}
          {weeklyClasses.map((weekly) => (
            <WeeklyClass key={weekly.id} weekly={weekly} selectedId={selectedId} onChoose={choose} />
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className={`flex flex-col gap-2.5 ${showGroupHeadings ? 'mt-3' : ''}`}>
          {showGroupHeadings && <GroupHeading>One-off sessions</GroupHeading>}
          <div role="radiogroup" aria-label="Available sessions" className="flex flex-col gap-2.5">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={session.id === selectedId}
                onChoose={choose}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SessionRow({ session, selected, onChoose }) {
  const filled = isFilled(session)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={filled}
      onClick={() => onChoose(session)}
      className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        filled
          ? 'border-line bg-[#F8F8F7] opacity-60 cursor-not-allowed'
          : selected
            ? 'border-brand bg-brand-50 shadow-sm'
            : 'border-line bg-white hover:border-brand/40 hover:shadow-sm active:scale-[0.995]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span
            className={`font-display text-sm font-semibold transition-colors ${
              filled ? 'text-gray-400' : selected ? 'text-brand' : 'text-gray-900'
            }`}
          >
            {formatLongDate(session.date)}
          </span>
          <span className={`text-sm ${filled ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatTimeRange(session)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filled && (
            <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              Filled
            </span>
          )}
          {selected && (
            <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center animate-pop-in">
              <CheckIcon />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// A card per weekly class that expands into its date chips: five, then "+N more".
// It starts open (showing every date if needed) when it holds the chosen Session.
function WeeklyClass({ weekly, selectedId, onChoose }) {
  const selectedIndex = weekly.sessions.findIndex((s) => s.id === selectedId)
  const holdsSelection = selectedIndex >= 0
  const [expanded, setExpanded] = useState(holdsSelection)
  const [showAll, setShowAll] = useState(selectedIndex >= VISIBLE_DATES)
  const shown = showAll ? weekly.sessions : weekly.sessions.slice(0, VISIBLE_DATES)
  const hidden = weekly.sessions.length - shown.length
  const label = `Every ${weekly.day}`

  return (
    <div
      className={`rounded-xl border bg-white transition-all duration-150 ${
        holdsSelection ? 'border-brand shadow-sm' : 'border-line'
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-sm font-semibold text-gray-900">{label}</span>
          <span className="text-sm text-gray-500">{formatTimeRange(weekly)}</span>
        </div>
        <ChevronDownIcon
          className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-wrap gap-2 animate-fade-up">
          <div role="radiogroup" aria-label={`${label} dates`} className="contents">
            {shown.map((session) => {
              const filled = isFilled(session)
              const selected = session.id === selectedId
              return (
                <button
                  key={session.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={filled}
                  title={filled ? 'Filled' : undefined}
                  onClick={() => onChoose(session)}
                  className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    filled
                      ? 'border-line bg-[#F8F8F7] text-gray-300 line-through cursor-not-allowed'
                      : selected
                        ? 'border-brand bg-brand text-white shadow-sm'
                        : 'border-line bg-white text-gray-700 hover:border-brand/40 active:scale-95'
                  }`}
                >
                  {formatCardDate(session.date)}
                </button>
              )
            })}
          </div>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="px-3 py-1.5 rounded-full text-sm font-semibold text-brand hover:bg-brand-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              +{hidden} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
