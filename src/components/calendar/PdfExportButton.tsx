import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';
import { storage } from '@/lib/storage';
import { getHourlyRate, getRateBasis, getShowGross, getShowNet, getVatRate } from '@/lib/rate';
import type { DayData } from '@/hooks/useCalendarData';

interface PdfExportButtonProps {
  currentMonth: Date;
  daysData: Record<string, DayData>;
  clientName?: string;
  clientLogo?: string;
  totalAmount: string;
  getDaysInMonth: () => Date[];
}

/** Przycisk raportu PDF — generator (`lib/pdfReport.ts`) ładuje się dopiero po kliknięciu. */
export default function PdfExportButton({
  currentMonth,
  daysData,
  clientName,
  clientLogo,
  totalAmount,
  getDaysInMonth,
}: PdfExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { generateWorkReport } = await import('@/lib/pdfReport');
      await generateWorkReport({
        currentMonth,
        days: getDaysInMonth(),
        daysData,
        clientName,
        clientLogo,
        totalAmount,
        hourlyRate: getHourlyRate(),
        rateBasis: getRateBasis(),
        vatRate: getVatRate(),
        showNet: getShowNet(),
        showGross: getShowGross(),
      });
    } catch (e) {
      console.error('PDF generation failed', e);
      showToast('Nie udało się wygenerować raportu PDF', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={generate} size="sm" disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      {busy ? 'Generowanie…' : 'Generuj PDF'}
    </Button>
  );
}
