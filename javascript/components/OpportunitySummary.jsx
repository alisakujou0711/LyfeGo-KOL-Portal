import { BadgeRow } from './Badge'
import { CalendarIcon, DollarIcon, GiftIcon, MapPinIcon } from './Icons'
import { formatAmount, formatBasis, formatLongDate, formatTimeRange, shorten } from '../lib/format'

// "S$150 per completed collaboration + Activewear set", or what a Barter
// creator receives.
function compensationLine(opportunity) {
  const { payment } = opportunity
  if (!payment) return shorten(opportunity.whatCreatorReceives)
  const line = `${formatAmount(payment)} ${formatBasis(payment)}`
  return payment.note ? `${line} + ${payment.note}` : line
}

// Compact card summarising an opportunity + chosen session. Used on the
// registration form and the confirmation page.
export default function OpportunitySummary({ opportunity, session, action }) {
  const paid = opportunity.compensationType === 'Paid'

  return (
    <div className="bg-white rounded-2xl border border-line p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <BadgeRow category={opportunity.category} compensationType={opportunity.compensationType} />
        <h2 className="font-display text-base font-semibold text-gray-900 leading-snug">
          {opportunity.title}
        </h2>
        <p className="text-sm text-gray-400">{opportunity.partner}</p>
      </div>

      <div className="border-t border-line-soft pt-2.5 flex flex-col gap-2">
        {session && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarIcon className="text-gray-400" />
            <span>
              {formatLongDate(session.date)}
              <span className="text-gray-400 mx-1">·</span>
              {formatTimeRange(session)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPinIcon className="text-gray-400" />
          <span>{opportunity.area}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {paid ? <DollarIcon className="text-gray-400" /> : <GiftIcon className="text-gray-400" />}
          <span>{compensationLine(opportunity)}</span>
        </div>
      </div>

      {action}
    </div>
  )
}
