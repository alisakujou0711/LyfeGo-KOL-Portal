const STYLES = {
  Sport: 'bg-brand/90 text-white',
  Lifestyle: 'bg-white/90 text-brand ring-1 ring-brand/50',
  Barter: 'bg-emerald-50/90 text-emerald-700',
  Paid: 'bg-amber-50/90 text-amber-700',
}

export default function Badge({ label }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
        STYLES[label] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </span>
  )
}

// Category and Compensation Type, as separate badges.
export function BadgeRow({ category, compensationType, className = '' }) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      <Badge label={category} />
      <Badge label={compensationType} />
    </div>
  )
}
