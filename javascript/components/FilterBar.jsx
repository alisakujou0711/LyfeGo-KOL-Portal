import DateFilter from './DateFilter'
import { ChevronDownIcon, MapPinIcon } from './Icons'

const CATEGORIES = ['Sport', 'Lifestyle']
const COMPENSATION_TYPES = ['Barter', 'Paid']
const COLLABORATION_TYPES = [
  { value: 'One-off', label: 'One-off' },
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'One-off or Ongoing', label: 'One-off or ongoing' },
]
const DELIVERABLE_TYPES = [
  { value: 'Fixed', label: 'Fixed' },
  { value: 'Flexible', label: 'Flexible' },
]

function distinct(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

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

function ChipGroup({ name, label, options, value, onChange }) {
  return (
    <div role="group" aria-label={name} className="flex items-center gap-1.5 shrink-0">
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
    </div>
  )
}

// Free-text Area search; suggestions come from the Areas in the loaded list.
function AreaSearch({ value, onChange, areas }) {
  return (
    <div className="relative flex items-center w-full sm:w-auto shrink-0">
      <span className="absolute left-2.5 pointer-events-none text-gray-400">
        <MapPinIcon />
      </span>
      <input
        type="search"
        aria-label="Area"
        list="area-suggestions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="All locations"
        autoComplete="off"
        className={`w-full sm:w-40 pl-7 pr-2 py-1.5 text-base sm:text-sm bg-white border rounded-lg transition-colors placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand hover:border-[#ccc] ${
          value ? 'border-brand/50 text-gray-900 font-medium' : 'border-line-strong text-gray-600'
        }`}
      />
      <datalist id="area-suggestions">
        {areas.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>
    </div>
  )
}

// A native select drawn as a pill: it shows `placeholder` until a value is
// chosen. The first option ("Any") clears it.
function Select({ label, placeholder, value, onChange, options }) {
  const selected = options.find((o) => o.value === value)
  return (
    <div
      className={`relative inline-flex items-center gap-1.5 shrink-0 pl-3 pr-2 py-1.5 text-sm bg-white border rounded-lg transition-colors hover:border-[#ccc] focus-within:ring-2 focus-within:ring-brand/25 focus-within:border-brand ${
        selected ? 'border-brand/50 text-brand font-medium' : 'border-line-strong text-gray-600'
      }`}
    >
      <span aria-hidden="true" className="whitespace-nowrap">
        {selected ? selected.label : placeholder}
      </span>
      <ChevronDownIcon className="text-gray-400" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full opacity-0 cursor-pointer"
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function FilterBar({
  opportunities,
  filters,
  setFilters,
  clearFilters,
  isActive,
  count,
}) {
  const areas = distinct(opportunities.map((o) => o.area))
  const setFilter = (key) => (value) => setFilters({ [key]: value })

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
            name="Category"
            label="Category"
            options={CATEGORIES}
            value={filters.category}
            onChange={setFilter('category')}
          />
          <span className="w-px h-5 bg-gray-200 shrink-0 mx-1.5" />
          <ChipGroup
            name="Compensation"
            label="Compensation"
            options={COMPENSATION_TYPES}
            value={filters.compensation}
            onChange={setFilter('compensation')}
          />
        </div>

        {/* Wraps rather than scrolls, so the Date popover isn't clipped. */}
        <div className="relative flex flex-wrap items-center gap-2 mt-2">
          <AreaSearch value={filters.area} onChange={setFilter('area')} areas={areas} />
          <DateFilter filters={filters} onChange={setFilters} />
          <Select
            label="Collaboration type"
            placeholder="Collaboration type"
            value={filters.collaboration}
            onChange={setFilter('collaboration')}
            options={COLLABORATION_TYPES}
          />
          <Select
            label="Deliverables"
            placeholder="Deliverables"
            value={filters.deliverables}
            onChange={setFilter('deliverables')}
            options={DELIVERABLE_TYPES}
          />
          {isActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 text-sm text-brand font-medium hover:underline ml-0.5 animate-fade-in"
            >
              Clear all
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2 min-h-4" aria-live="polite">
          {count !== null && countLabel}
        </p>
      </div>
    </div>
  )
}
