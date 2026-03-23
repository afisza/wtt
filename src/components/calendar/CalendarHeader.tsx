import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CalendarHeaderProps {
  monthDisplayName: string
  onPrevMonth: () => void
  onNextMonth: () => void
}

export default function CalendarHeader({ monthDisplayName, onPrevMonth, onNextMonth }: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-2 gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={onPrevMonth}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        <span className="hidden sm:inline">Poprzedni</span>
      </Button>
      <h2 className="text-sm font-semibold text-foreground text-center flex-1 min-w-[160px]">
        {monthDisplayName}
      </h2>
      <Button variant="outline" size="sm" onClick={onNextMonth}>
        <span className="hidden sm:inline">Następny</span>
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}
