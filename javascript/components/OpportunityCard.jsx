import { Link } from 'react-router-dom'
import { BadgeRow } from './Badge'
import { CalendarIcon, DollarIcon, GiftIcon, MapPinIcon } from './Icons'
import { formatShortDate } from '../lib/format'
import { isFull } from '../data/opportunities'

function SpotsLine({ opportunity }) {
  if (opportunity.collab === 'Paid') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
        Applications close {formatShortDate(opportunity.deadline)}
      </div>
    )
  }
  const n = opportunity.spotsLeft
  if (n === 0) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-red-500">
        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
        All spots taken
      </div>
    )
  }
  const low = n <= 2
  return (
    <div
      className={`flex items-center gap-2 text-sm font-medium ${
        low ? 'text-amber-600' : 'text-gray-500'
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${low ? 'bg-amber-400' : 'bg-emerald-400'}`}
      />
      {n} creator {n === 1 ? 'spot' : 'spots'} left
    </div>
  )
}

function PerkLine({ opportunity }) {
  if (opportunity.collab === 'Paid') {
    return (
      <div className="flex items-center gap-2 text-[13px] font-medium text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
        <DollarIcon className="text-amber-500" />
        <span>{opportunity.perk}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-[13px] text-gray-600 bg-surface rounded-xl px-3 py-2.5">
      <GiftIcon className="text-gray-400" />
      <span>{opportunity.perk}</span>
    </div>
  )
}

export default function OpportunityCard({ opportunity, index = 0 }) {
  const full = isFull(opportunity)

  return (
    <Link
      to={`/opportunity/${opportunity.id}`}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
      aria-label={`${opportunity.title} — view opportunity`}
    >
      <article
        className={`h-full bg-white rounded-2xl overflow-hidden border border-line shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col group ${
          full ? 'opacity-60 hover:opacity-80' : ''
        }`}
      >
        <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: '16 / 10' }}>
          <img
            src={opportunity.image}
            alt={opportunity.title}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform duration-500 ${
              full ? '' : 'group-hover:scale-[1.03]'
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          {full && (
            <div className="absolute inset-0 bg-white/25 flex items-start justify-end p-3">
              <span className="bg-white text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm uppercase tracking-wide">
                Full
              </span>
            </div>
          )}
          <BadgeRow opportunity={opportunity} className="absolute bottom-3 left-3" />
        </div>

        <div className="p-4 flex flex-col gap-2.5 flex-1">
          <div>
            <h3 className="font-display text-[17px] font-semibold text-gray-900 leading-snug mb-0.5 group-hover:text-brand transition-colors duration-150">
              {opportunity.title}
            </h3>
            <p className="text-sm text-gray-400">{opportunity.partner}</p>
          </div>

          <div className="flex flex-col gap-1">
            {opportunity.dateLabel && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <CalendarIcon className="text-gray-400" />
                <span>{opportunity.dateLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPinIcon className="text-gray-400" />
              <span>{opportunity.location}</span>
            </div>
          </div>

          <PerkLine opportunity={opportunity} />

          <div className="mt-auto flex flex-col gap-2.5 pt-1">
            <SpotsLine opportunity={opportunity} />
            <span
              className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all duration-150 ${
                full
                  ? 'bg-gray-100 text-gray-400'
                  : 'bg-brand text-white group-hover:bg-brand-dark group-active:scale-[0.985]'
              }`}
            >
              {full ? 'Opportunity Full' : 'View Opportunity →'}
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
