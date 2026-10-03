// Small inline SVG icon set. Every icon inherits `currentColor` so colour is
// controlled by the parent's text colour via Tailwind classes.

const base = { fill: 'none', 'aria-hidden': true }

export function MapPinIcon({ className = '' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...base}>
      <path
        d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6C12.5 3.515 10.485 1.5 8 1.5z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function CalendarIcon({ className = '' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...base}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1.5v2M11 1.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function GiftIcon({ className = '' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...base}>
      <rect x="1" y="6" width="14" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 9.5h14M8 6v9" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 6C4.12 6 3 4.88 3 3.5S4.5 1 6 1C7.5 1 8 3.5 8 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10.5 6C11.88 6 13 4.88 13 3.5S11.5 1 10 1C8.5 1 8 3.5 8 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function DollarIcon({ className = '' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...base}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.5v7M6 6c0-.83.9-1.5 2-1.5S10 5.17 10 6s-.9 1.5-2 1.5S6 8.17 6 9s.9 1.5 2 1.5 2-.67 2-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronDownIcon({ className = '' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className={`shrink-0 ${className}`} {...base}>
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronLeftIcon({ className = '' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={`shrink-0 ${className}`} {...base}>
      <path
        d="M10 3L5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CheckIcon({ className = '', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} {...base}>
      <path
        d="M3 8l3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SpinnerIcon({ className = '' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      className={`animate-spin shrink-0 ${className}`}
      {...base}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
