import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number // 0-100
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

const colorByValue = (value: number) => {
  if (value >= 80) return 'bg-emerald-500'
  if (value >= 50) return 'bg-blue-500'
  if (value >= 25) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ProgressBar({ value, label, size = 'sm', className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  const barHeight = size === 'sm' ? 'h-1.5' : 'h-2.5'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
      )}
      <div className={cn('flex-1 rounded-full bg-muted overflow-hidden', barHeight)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500 progress-bar-animated', colorByValue(clamped))}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className={cn(
        'font-semibold tabular-nums whitespace-nowrap',
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        clamped >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
        clamped >= 50 ? 'text-blue-600 dark:text-blue-400' :
        clamped >= 25 ? 'text-amber-600 dark:text-amber-400' :
        'text-red-600 dark:text-red-400'
      )}>
        {clamped}%
      </span>
    </div>
  )
}
