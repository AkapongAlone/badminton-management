// AekWong brand mark — a shuttle in an emerald disc + the wordmark. Shown
// prominently on every page. `light` flips the wordmark to white for dark
// backgrounds (the public board); the emerald accent reads on both.
export default function Logo({
  size = 'md',
  light = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  light?: boolean
  className?: string
}) {
  const disc = { sm: 'h-7 w-7 text-sm', md: 'h-9 w-9 text-lg', lg: 'h-12 w-12 text-2xl' }[size]
  const word = { sm: 'text-base', md: 'text-xl', lg: 'text-3xl' }[size]
  return (
    <span className={`inline-flex select-none items-center gap-2 ${className}`}>
      <span className={`grid place-items-center rounded-full bg-emerald-500 text-white shadow-sm ${disc}`}>
        🏸
      </span>
      <span className={`font-extrabold tracking-tight ${word} ${light ? 'text-white' : 'text-gray-900'}`}>
        Aek<span className="text-emerald-500">Wong</span>
      </span>
    </span>
  )
}
