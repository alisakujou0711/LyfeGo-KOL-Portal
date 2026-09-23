import { CheckIcon } from './Icons'
import { formatLongDate, formatTimeRange } from '../lib/format'

function Availability({ spots }) {
  if (spots === 0) {
    return (
      <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
        Full
      </span>
    )
  }
  const low = spots === 1
  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-medium ${
        low ? 'text-amber-600' : 'text-emerald-600'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${low ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      {low ? '1 spot left' : `${spots} spots`}
    </span>
  )
}

export default function SessionPicker({ sessions, selectedId, onSelect, showHint, hintKey }) {
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

      <div role="radiogroup" aria-label="Available sessions" className="flex flex-col gap-2.5">
        {sessions.map((session) => {
          const full = session.spots === 0
          const selected = session.id === selectedId
          return (
            <button
              key={session.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={full}
              onClick={() => onSelect(selected ? null : session.id)}
              className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                full
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
                      full ? 'text-gray-400' : selected ? 'text-brand' : 'text-gray-900'
                    }`}
                  >
                    {formatLongDate(session.date)}
                  </span>
                  <span className={`text-sm ${full ? 'text-gray-400' : 'text-gray-500'}`}>
                    {formatTimeRange(session)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Availability spots={session.spots} />
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center animate-pop-in">
                      <CheckIcon />
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
