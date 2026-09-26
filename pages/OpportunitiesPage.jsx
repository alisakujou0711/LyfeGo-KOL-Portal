import { useMemo } from 'react'
import FilterBar from '../javascript/components/FilterBar'
import OpportunityCard, { OpportunityCardSkeleton } from '../javascript/components/OpportunityCard'
import { useDiscoverList } from '../javascript/hooks/useDiscoverList'
import { applyFilters, useFilters } from '../javascript/hooks/useFilters'

const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'

function EmptyState({ onClear }) {
  return (
    <div className="text-center py-20 animate-fade-up">
      <p className="font-display text-gray-500 text-xl font-semibold mb-2">No opportunities found</p>
      <p className="text-gray-400 text-sm mb-5">Try adjusting your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="text-sm font-semibold bg-brand text-white px-5 py-2.5 rounded-full hover:bg-brand-dark active:scale-95 transition-all"
      >
        Clear all filters
      </button>
    </div>
  )
}

function LoadError({ onRetry }) {
  return (
    <div role="alert" className="text-center py-20 animate-fade-up">
      <p className="font-display text-gray-500 text-xl font-semibold mb-2">
        Couldn't load opportunities
      </p>
      <p className="text-gray-400 text-sm mb-5">Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-semibold bg-brand text-white px-5 py-2.5 rounded-full hover:bg-brand-dark active:scale-95 transition-all"
      >
        Retry
      </button>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div role="status" aria-label="Loading opportunities" className={GRID}>
      {Array.from({ length: 6 }, (_, i) => (
        <OpportunityCardSkeleton key={i} />
      ))}
    </div>
  )
}

export default function OpportunitiesPage() {
  const { status, opportunities, retry } = useDiscoverList()
  const { filters, setFilters, clearFilters, isActive } = useFilters()
  const visible = useMemo(() => applyFilters(opportunities, filters), [opportunities, filters])

  // Key the grid on the filter signature so cards re-run their stagger
  // animation whenever the result set changes.
  const gridKey = Object.values(filters).join('|')

  let content
  if (status === 'loading') content = <LoadingGrid />
  else if (status === 'error') content = <LoadError onRetry={retry} />
  else if (visible.length === 0) content = <EmptyState onClear={clearFilters} />
  else
    content = (
      <div key={gridKey} className={GRID}>
        {visible.map((o, i) => (
          <OpportunityCard key={o.id} opportunity={o} index={i} />
        ))}
      </div>
    )

  return (
    <>
      <div className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 mb-1.5 leading-tight">
            Discover Creator Opportunities
          </h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl leading-relaxed">
            Explore Sport and Lifestyle collaborations with LyfeGo partners and register for
            opportunities that interest you.
          </p>
        </div>
      </div>

      <FilterBar
        opportunities={opportunities}
        filters={filters}
        setFilters={setFilters}
        clearFilters={clearFilters}
        isActive={isActive}
        count={status === 'ready' ? visible.length : null}
      />

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8">{content}</main>
    </>
  )
}
