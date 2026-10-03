import { ChevronDownIcon } from '../../../creator-portal/javascript/components/Icons'

// The Figma's list-page controls: the search box and filter dropdowns above a table.

const CONTROL_CLASSES =
  'rounded-lg border border-line-strong text-sm text-gray-700 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand'

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-gray-400" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10l3.25 3.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// A search box named `label` for screen readers.
export function SearchField({ label, placeholder, value, onChange }) {
  return (
    <div className="relative flex-1 min-w-48">
      <span className="absolute left-3 top-1/2 -translate-y-1/2">
        <SearchIcon />
      </span>
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full pl-9 pr-4 py-2 placeholder-gray-400 ${CONTROL_CLASSES}`}
      />
    </div>
  )
}

// A filter dropdown whose first option, `all`, is the empty value. Each option
// is a value, or [value, text] when they differ.
export function FilterSelect({ label, all, options, value, onChange }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`appearance-none pl-3 pr-8 py-2 cursor-pointer ${CONTROL_CLASSES}`}
      >
        <option value="">{all}</option>
        {options.map((option) => {
          const [optionValue, text] = Array.isArray(option) ? option : [option, option]
          return (
            <option key={optionValue} value={optionValue}>
              {text}
            </option>
          )
        })}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <ChevronDownIcon />
      </span>
    </div>
  )
}

// A table row spanning every column, for loading and empty messages.
export function MessageRow({ columns, children }) {
  return (
    <tr>
      <td colSpan={columns} className="px-5 py-12 text-center text-sm text-gray-400">
        {children}
      </td>
    </tr>
  )
}

// Shown instead of a list, or a panel's content, that couldn't load.
export function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="px-5 py-12 text-center">
      <p className="text-sm text-gray-600">{message}</p>
      <button type="button" onClick={onRetry} className="mt-2 text-sm font-semibold text-brand hover:text-brand-dark">
        Try again
      </button>
    </div>
  )
}

// The line under a list's table: "Showing X of Y <noun>", then any links
// (`children`) after it, and "Clear all filters" on the right while `onClear` is given.
export function ListFooter({ shown, total, noun, children, onClear }) {
  return (
    <div className="px-5 py-3 border-t border-line flex items-center justify-between text-xs text-gray-400">
      <span>
        Showing {shown} of {total} {noun}
        {children}
      </span>
      {onClear && (
        <button type="button" onClick={onClear} className="text-brand hover:underline">
          Clear all filters
        </button>
      )}
    </div>
  )
}
