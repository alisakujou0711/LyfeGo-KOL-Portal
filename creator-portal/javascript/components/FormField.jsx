import { useId } from 'react'

const INPUT_BASE =
  'w-full py-3 rounded-xl border text-sm text-gray-900 placeholder-gray-400 bg-white transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand'
const INPUT_OK = 'border-line-strong hover:border-[#ccc]'
const INPUT_ERR = 'border-red-400 bg-red-50/30'

export default function FormField({
  label,
  required = false,
  optional = false,
  error,
  prefix,
  multiline = false,
  className = '',
  ...inputProps
}) {
  const id = useId()
  const errorId = `${id}-error`
  const stateClass = error ? INPUT_ERR : INPUT_OK
  const padding = prefix ? 'pl-8 pr-4' : 'px-4'

  const control = multiline ? (
    <textarea
      id={id}
      rows={3}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? errorId : undefined}
      className={`${INPUT_BASE} ${stateClass} ${padding} resize-none`}
      {...inputProps}
    />
  ) : (
    <input
      id={id}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? errorId : undefined}
      className={`${INPUT_BASE} ${stateClass} ${padding}`}
      {...inputProps}
    />
  )

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="ml-0.5 text-brand" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="ml-1.5 text-xs font-normal text-gray-400">Optional</span>}
      </label>
      {prefix ? (
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none select-none">
            {prefix}
          </span>
          {control}
        </div>
      ) : (
        control
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-500 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  )
}
