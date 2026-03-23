import { useEffect, useState } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function RateTab() {
  const { showToast } = useToast()
  const [hourlyRate, setHourlyRate] = useState<string>('')

  useEffect(() => {
    const savedRate = localStorage.getItem('hourlyRate')
    if (savedRate) {
      setHourlyRate(savedRate)
    }
  }, [])

  const handleSaveHourlyRate = () => {
    if (hourlyRate) {
      localStorage.setItem('hourlyRate', hourlyRate)
      window.dispatchEvent(new Event('hourlyRateUpdated'))
      showToast('Stawka godzinowa zapisana pomyślnie!', 'success')
    } else {
      localStorage.removeItem('hourlyRate')
      window.dispatchEvent(new Event('hourlyRateUpdated'))
      showToast('Stawka godzinowa usunięta!', 'info')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Stawka godzinowa</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 max-w-[400px]">
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Stawka za godzinę (zł)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="np. 50.00"
            />
          </div>
          <Button
            onClick={handleSaveHourlyRate}
            className="bg-[#d22f27] hover:bg-[#b0251f] text-white font-semibold self-start transition-all hover:-translate-y-px"
          >
            Zapisz stawkę godzinową
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
