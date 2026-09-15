import { BadgeRow } from './Badge'
import { CalendarIcon, DollarIcon, GiftIcon, MapPinIcon } from './Icons'
import { formatLongDate, formatShortDate, formatTimeRange } from '../lib/format'

// Compact card summarising an opportunity + chosen session. Used on the
// registration form and the confirmation page.
export default function OpportunitySummary({ opportunity, session, action }) {
  const paid = opportunity.collab === 'Paid'

  return (
    <div className="bg-white rounded-2xl border border-line p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <BadgeRow opportunity={opportunity} />
          <h2 className="font-display text-base font-semibold text-gray-900 leading-snug">
            {opportunity.title}
          </h2>
          <p className="text-sm text-gray-400">{opportunity.partner}</p>
        </div>
        <img
          src={opportunity.image}
          alt=""
          className="w-16 h-16 rounded-xl object-cover shrink-0 hidden sm:block"
        />
      </div>

      <div className="border-t border-line-soft pt-2.5 flex flex-col gap-2">
        {session ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarIcon className="text-gray-400" />
            <span>
              {formatLongDate(session.date)}
              <span className="text-gray-400 mx-1">·</span>
              {formatTimeRange(session)}
            </span>
          </div>
        ) : paid ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarIcon className="text-gray-400" />
            <span>Applications close {formatShortDate(opportunity.deadline)}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPinIcon className="text-gray-400" />
          <span>{opportunity.location}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {paid ? (
            <DollarIcon className="text-amber-500" />
          ) : (
            <GiftIcon className="text-gray-400" />
          )}
          <span>{opportunity.perk}</span>
        </div>
      </div>

      {action}
    </div>
  )
}
