import { CATEGORIES, COLLAB_TYPES, LOCATIONS, SPORTS } from '../data/opportunities'
import { CalendarIcon, ChevronDownIcon, MapPinIcon, SportIcon } from './Icons'

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        active
          ? 'bg-brand text-white shadow-sm'
          : 'bg-white text-[#555] border border-line-strong hover:border-brand hover:text-brand active:scale-95'
      }`}
    >
      {children}
    </button>
  )
}

function ChipGroup({ label, options, value, onChange }) {
  return (
    <>
      <span className="hidden sm:block text-[11px] font-semibold text-gray-300 uppercase tracking-widest whitespace-nowrap pr-1">
        {label}
      </span>
      <Chip active={!value} onClick={() => onChange('')}>
        All
      </Chip>
      {options.map((opt) => (
        <Chip key={opt} active={value === opt} onClick={() => onChange(value === opt ? '' : opt)}>
          {opt}
        </Chip>
      ))}
    </>
  )
}

function Select({ icon, value, onChange, options, placeholder, label }) {
  return (
    <div className="relative inline-flex items-center shrink-0">
      <span className="absolute left-2.5 pointer-events-none text-gray-400">{icon}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none pl-7 pr-7 py-1.5 text-sm bg-white border rounded-lg cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand hover:border-[#ccc] ${
          value ? 'border-brand/50 text-gray-900 font-medium' : 'border-line-strong text-gray-600'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) =>
          typeof opt === 'string' ? (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ) : (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ),
        )}
      </select>
      <span className="absolute right-2 pointer-events-none text-gray-400">
        <ChevronDownIcon />
      </span>
    </div>
  )
}

export default function FilterBar({ filters, setFilter, clearFilters, isActive, count }) {
  const showSports = filters.category !== 'Lifestyle'

  const countLabel = isActive
    ? count === 0
      ? 'No opportunities match your filters'
      : `${count} ${count === 1 ? 'opportunity' : 'opportunities'} match your filters`
    : `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`

  return (
    <div className="sticky top-14 z-40 bg-white/95 backdrop-blur-md border-b border-line shadow-[0_2px_6px_rgba(0,0,0,0.04)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <ChipGroup
            label="Category"
            options={CATEGORIES}
            value={filters.category}
            onChange={(v) => setFilter('category', v)}
          />
          <span className="w-px h-5 bg-gray-200 shrink-0 mx-1.5" />
          <ChipGroup
            label="Collab"
            options={COLLAB_TYPES}
            value={filters.collab}
            onChange={(v) => setFilter('collab', v)}
          />
        </div>

        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
          <Select
            label="Location"
            icon={<MapPinIcon />}
            value={filters.location}
            onChange={(v) => setFilter('location', v)}
            options={LOCATIONS}
            placeholder="All locations"
          />
          <Select
            label="Date"
            icon={<CalendarIcon />}
            value={filters.date}
            onChange={(v) => setFilter('date', v)}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
            ]}
            placeholder="Any date"
          />
          {showSports && (
            <Select
              label="Sport"
              icon={<SportIcon />}
              value={filters.sport}
              onChange={(v) => setFilter('sport', v)}
              options={SPORTS}
              placeholder="All sports"
            />
          )}
          {isActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 text-sm text-brand font-medium hover:underline ml-0.5 animate-fade-in"
            >
              Clear
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2" aria-live="polite">
          {countLabel}
        </p>
      </div>
    </div>
  )
}
