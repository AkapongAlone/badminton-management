// Generated initials avatar — color derived from the seed, no image storage.
const COLORS = [
  'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-purple-500', 'bg-violet-500',
  'bg-indigo-500', 'bg-blue-500', 'bg-sky-500', 'bg-cyan-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-green-500', 'bg-lime-600', 'bg-yellow-600', 'bg-amber-600',
  'bg-orange-500', 'bg-red-500',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export default function Avatar({ name, seed, size = 8 }: { name: string; seed: string; size?: number }) {
  const color = COLORS[hash(seed || name) % COLORS.length]
  const initials = name.trim().slice(0, 2)
  const px = size * 4
  return (
    <span
      className={`${color} inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0`}
      style={{ width: px, height: px, fontSize: px * 0.38 }}
    >
      {initials}
    </span>
  )
}
