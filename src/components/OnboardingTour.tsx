import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TourStep {
  target: string // CSS selector
  title: string
  description: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="client-tabs"]',
    title: 'Klienci',
    description: 'Przełączaj się między klientami klikając na zakładki. Każdy klient ma osobny kalendarz zadań.',
    position: 'bottom',
  },
  {
    target: '[data-tour="search"]',
    title: 'Wyszukiwanie (⌘K)',
    description: 'Szukaj zadań po tekście. Użyj skrótu ⌘K, aby otworzyć paletę komend.',
    position: 'bottom',
  },
  {
    target: '[data-tour="calendar"]',
    title: 'Kalendarz zadań',
    description: 'Dodawaj zadania, przeciągaj je między dniami, zmieniaj statusy. Nawiguj strzałkami ← →.',
    position: 'top',
  },
  {
    target: '[data-tour="pdf-export"]',
    title: 'Eksport PDF',
    description: 'Generuj raport miesięczny w formacie PDF z podsumowaniem godzin.',
    position: 'top',
  },
]

const STORAGE_KEY = 'wttOnboardingDone'

export default function OnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) {
      // Delay to let the page render
      const timer = setTimeout(() => setIsVisible(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const positionTooltip = useCallback(() => {
    if (!isVisible) return
    const step = TOUR_STEPS[currentStep]
    const el = document.querySelector(step.target)
    if (!el) return

    const rect = el.getBoundingClientRect()
    const pos = step.position || 'bottom'
    const style: React.CSSProperties = { position: 'fixed', zIndex: 99999 }

    switch (pos) {
      case 'bottom':
        style.top = rect.bottom + 12
        style.left = Math.max(16, rect.left + rect.width / 2 - 150)
        break
      case 'top':
        style.bottom = window.innerHeight - rect.top + 12
        style.left = Math.max(16, rect.left + rect.width / 2 - 150)
        break
      case 'left':
        style.top = rect.top + rect.height / 2 - 40
        style.right = window.innerWidth - rect.left + 12
        break
      case 'right':
        style.top = rect.top + rect.height / 2 - 40
        style.left = rect.right + 12
        break
    }

    // Keep within viewport
    if (typeof style.left === 'number') {
      style.left = Math.min(style.left, window.innerWidth - 320)
    }

    setTooltipStyle(style)
  }, [currentStep, isVisible])

  useEffect(() => {
    positionTooltip()
    window.addEventListener('resize', positionTooltip)
    window.addEventListener('scroll', positionTooltip, true)
    return () => {
      window.removeEventListener('resize', positionTooltip)
      window.removeEventListener('scroll', positionTooltip, true)
    }
  }, [positionTooltip])

  const dismiss = () => {
    setIsVisible(false)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      dismiss()
    }
  }

  const prev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  if (!isVisible) return null

  const step = TOUR_STEPS[currentStep]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[99998] transition-opacity"
        onClick={dismiss}
      />
      {/* Tooltip */}
      <div
        style={tooltipStyle}
        className={cn(
          'w-[300px] rounded-xl border bg-card shadow-lg p-4 z-[99999] animate-fade-in onboarding-pulse'
        )}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1"
            aria-label="Zamknij poradnik"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {step.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {currentStep + 1} / {TOUR_STEPS.length}
          </span>
          <div className="flex gap-1.5">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={prev} className="h-7 px-2 text-xs">
                <ChevronLeft className="h-3 w-3 mr-0.5" />
                Wstecz
              </Button>
            )}
            <Button size="sm" onClick={next} className="h-7 px-3 text-xs">
              {currentStep < TOUR_STEPS.length - 1 ? (
                <>
                  Dalej
                  <ChevronRight className="h-3 w-3 ml-0.5" />
                </>
              ) : (
                'Gotowe'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
