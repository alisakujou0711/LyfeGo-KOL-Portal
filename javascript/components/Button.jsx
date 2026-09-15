import { SpinnerIcon } from './Icons'

const VARIANTS = {
  primary:
    'bg-brand text-white hover:bg-brand-dark active:scale-[0.985] shadow-sm shadow-brand/10 hover:shadow-md hover:shadow-brand/20',
  disabled: 'bg-gray-100 text-gray-400 cursor-not-allowed',
}

export default function Button({
  children,
  disabled = false,
  loading = false,
  size = 'md',
  className = '',
  ...rest
}) {
  const inactive = disabled || loading
  const padding = size === 'lg' ? 'py-3.5' : size === 'sm' ? 'py-2.5' : 'py-3'

  return (
    <button
      disabled={inactive}
      aria-busy={loading || undefined}
      className={`w-full ${padding} rounded-xl text-sm font-semibold transition-all duration-150 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 ${
        disabled ? VARIANTS.disabled : VARIANTS.primary
      } ${loading ? 'opacity-90 cursor-progress' : ''} ${className}`}
      {...rest}
    >
      {loading && <SpinnerIcon />}
      {children}
    </button>
  )
}
