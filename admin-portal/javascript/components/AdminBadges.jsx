// The Admin Figma's badges, which differ from the Creator Portal's image-overlay ones.

const TAG_STYLES = {
  Sport: 'bg-blue-50 text-blue-700',
  Lifestyle: 'bg-purple-50 text-purple-700',
  Paid: 'bg-amber-50 text-amber-700',
  Barter: 'bg-teal-50 text-teal-700',
}

// A Category or Compensation Type tag.
export function TagBadge({ label }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${TAG_STYLES[label] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

// Publishing Statuses, then Application Statuses.
export const STATUS_STYLES = {
  Live: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  Draft: { pill: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  Closed: { pill: 'bg-red-50 text-red-600', dot: 'bg-red-400' },
  New: { pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-400' },
  Reviewing: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  Accepted: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  Declined: { pill: 'bg-red-50 text-red-600', dot: 'bg-red-400' },
}

// A Publishing Status or Application Status pill with its coloured dot.
export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Draft
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {status}
    </span>
  )
}
