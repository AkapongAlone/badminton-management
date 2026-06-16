import { skillClass, skillLabel } from '../types'

// Coloured 1-4 skill chip. Each level has its own saturated colour (see
// skillClass) so it stands out on any background.
export default function SkillBadge({ skill, size = 'sm' }: { skill: number; size?: 'xs' | 'sm' }) {
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-block rounded font-bold ${pad} ${skillClass(skill)}`}>
      {skillLabel(skill)}
    </span>
  )
}
