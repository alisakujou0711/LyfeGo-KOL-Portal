import { Link } from 'react-router-dom'
import { BadgeRow } from './Badge'
import { CalendarIcon, MapPinIcon } from './Icons'
import { formatSchedule, visibleExperienceLevels } from '../lib/format'

function Row({ label, value }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-300 font-medium">{label}</span>
      <span className="text-gray-400">·</span>
      <span>{value}</span>
    </div>
  )
}

// A Discover card. Discover only lists open Opportunities, so every card
// links to one the creator can apply for.
export default function OpportunityCard({ opportunity, index = 0 }) {
  const levels = visibleExperienceLevels(opportunity)

  return (
    <Link
      to={`/opportunity/${opportunity.id}`}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
      aria-label={`${opportunity.title} — view opportunity`}
    >
      <article className="h-full bg-white rounded-2xl overflow-hidden border border-line shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col group">
        <div className="relative overflow-hidden bg-gray-100" style={{ aspectRatio: '16 / 10' }}>
          <img
            src={opportunity.heroImage}
            alt={opportunity.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          <BadgeRow
            category={opportunity.category}
            compensationType={opportunity.compensationType}
            className="absolute bottom-3 left-3"
          />
        </div>

        <div className="p-4 flex flex-col gap-2.5 flex-1">
          <div>
            <h3 className="font-display text-[17px] font-semibold text-gray-900 leading-snug mb-0.5 group-hover:text-brand transition-colors duration-150">
              {opportunity.title}
            </h3>
            <p className="text-sm text-gray-400">{opportunity.partner}</p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <CalendarIcon className="text-gray-400 shrink-0" />
              <span>{formatSchedule(opportunity)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPinIcon className="text-gray-400 shrink-0" />
              <span>{opportunity.area}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-[13px] text-gray-500">
            {levels.length > 0 && <Row label="Level" value={levels.join(', ')} />}
            <Row label="Deliverables" value={opportunity.deliverableType} />
            <Row label="Collaboration" value={opportunity.collaborationType} />
          </div>

          <div className="mt-auto pt-1">
            <span className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all duration-150 bg-brand text-white group-hover:bg-brand-dark group-active:scale-[0.985]">
              View Opportunity →
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

// Same footprint as a card, shown while the Discover list loads.
export function OpportunityCardSkeleton() {
  return (
    <div className="h-full bg-white rounded-2xl overflow-hidden border border-line shadow-sm flex flex-col animate-pulse">
      <div className="bg-gray-100" style={{ aspectRatio: '16 / 10' }} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="h-5 w-3/4 rounded bg-gray-100" />
        <div className="h-4 w-1/2 rounded bg-gray-100" />
        <div className="h-4 w-2/3 rounded bg-gray-100" />
        <div className="h-12 w-1/2 rounded bg-gray-100" />
        <div className="h-10 rounded-xl bg-gray-100 mt-auto" />
      </div>
    </div>
  )
}
