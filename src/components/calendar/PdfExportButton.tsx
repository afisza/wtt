import { FileText } from 'lucide-react'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '@/components/ui/button'
import { robotoFontBase64, robotoFontName } from '@/lib/roboto-font'
import type { Task } from '@/components/tasks/types'
import type { DayData } from '@/hooks/useCalendarData'

interface PdfExportButtonProps {
  currentMonth: Date
  daysData: Record<string, DayData>
  clientName?: string
  clientLogo?: string
  monthTotal: string
  totalAmount: string
  getDayName: (date: Date) => string
  calculateTotalHours: (tasks: Task[]) => string
  getDaysInMonth: () => Date[]
}

export default function PdfExportButton({
  currentMonth,
  daysData,
  clientName,
  clientLogo,
  monthTotal,
  totalAmount,
  getDayName,
  getDaysInMonth,
}: PdfExportButtonProps) {
  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    })

    const getPageWidth = () => (typeof (doc as any).getPageWidth === 'function' ? (doc as any).getPageWidth() : (doc as any).internal?.pageSize?.width)
    const getPageHeight = () => (typeof (doc as any).getPageHeight === 'function' ? (doc as any).getPageHeight() : (doc as any).internal?.pageSize?.height)

    let useRobotoFont = false
    try {
      doc.addFileToVFS(robotoFontName, robotoFontBase64)
      doc.addFont(robotoFontName, 'Roboto', 'normal')
      doc.addFont(robotoFontName, 'Roboto', 'bold')
      doc.setFont('Roboto', 'normal')
      useRobotoFont = true
    } catch (error) {
      console.warn('Nie udało się załadować czcionki Roboto:', error)
    }

    const pdfFont = useRobotoFont ? 'Roboto' : 'helvetica'

    let appLogoImg: HTMLImageElement | null = null
    try {
      const logoImg = new Image()
      logoImg.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('App logo load timeout')) }, 3000)
        logoImg.onload = () => { clearTimeout(timeout); appLogoImg = logoImg; resolve() }
        logoImg.onerror = () => { clearTimeout(timeout); resolve() }
        logoImg.src = `/logo.png`
      })
    } catch (err) {
      console.warn('Nie udało się załadować logotypu:', err)
    }

    const monthNameRaw = format(currentMonth, 'MMMM yyyy', { locale: pl })
    const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1).replace(/(\w+)a\s/, '$1 ')
    const monthYear = format(currentMonth, 'yyyy-MM')

    doc.setFillColor(20, 20, 20)
    doc.rect(0, 0, getPageWidth(), getPageHeight(), 'F')

    let startY = 18

    if (clientLogo) {
      try {
        const isSvg = clientLogo.toLowerCase().endsWith('.svg') || clientLogo.toLowerCase().includes('data:image/svg+xml')

        if (!isSvg) {
          const img = new Image()
          img.crossOrigin = 'anonymous'

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { reject(new Error('Image load timeout')) }, 5000)
            img.onload = () => {
              clearTimeout(timeout)
              try {
                const logoSize = 20
                doc.addImage(img, 'PNG', 14, startY, logoSize, logoSize)
                startY += logoSize + 10
                resolve()
              } catch (err) { reject(err) }
            }
            img.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load image')) }
            img.src = clientLogo
          })
        }
      } catch (err) {
        console.error('Error loading client logo:', err)
      }
    }

    if (clientName) {
      doc.setFontSize(16)
      doc.setTextColor(255, 255, 255)
      doc.setFont(pdfFont, 'bold')
      doc.text(clientName, 14, startY)
      startY += 8
    }

    doc.setFontSize(12)
    doc.setTextColor(210, 47, 39)
    doc.setFont(pdfFont, 'bold')
    doc.text('Afisza Time Tracker', 14, startY)
    startY += 6

    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.setFont(pdfFont, 'normal')
    doc.text(monthName, 14, startY)
    startY += 8

    const tableData: any[] = []
    const days = getDaysInMonth()
    const sortedDays = days.sort((a, b) => a.getTime() - b.getTime())

    sortedDays.forEach((day) => {
      const dateKey = format(day, 'yyyy-MM-dd')
      const dayData = daysData[dateKey] || { date: dateKey, tasks: [], totalHours: '00:00' }

      const dayName = getDayName(day)
      const dateStr = format(day, 'dd.MM.yyyy')
      const dateWithDay = `${dateStr}\n${dayName}`

      const dayAssigners = Array.from(new Set(dayData.tasks.flatMap(t => Array.isArray(t.assignedBy) ? t.assignedBy : (t.assignedBy ? [t.assignedBy] : [])).filter(Boolean)))
      const assignersText = dayAssigners.length > 0 ? dayAssigners.join('\n') : '-'

      if (dayData.tasks.length === 0) {
        tableData.push([dateWithDay, dayData.totalHours, assignersText, '-', '-'])
      } else {
        dayData.tasks.forEach((task, index) => {
          const taskNumber = index + 1
          const taskText = task.text.length > 40 ? task.text.substring(0, 37) + '...' : task.text
          const timeRange = `${task.startTime}-${task.endTime}`
          const taskInfo = `${taskNumber}. ${taskText}\n${timeRange}`
          const statusWithNumber = `${taskNumber}. ${task.status}`

          if (index === 0) {
            tableData.push([dateWithDay, dayData.totalHours, assignersText, taskInfo, statusWithNumber])
          } else {
            tableData.push(['', '', '', taskInfo, statusWithNumber])
          }
        })
      }
    })

    tableData.push(['RAZEM', monthTotal, '', '', totalAmount ? `${totalAmount} zł` : ''])

    if (useRobotoFont) {
      doc.setFont('Roboto', 'normal')
    }

    autoTable(doc, {
      head: [['Dzień', 'Godziny', 'Kto zlecił', 'Zadania', 'Status']],
      body: tableData,
      startY: startY,
      theme: 'plain',
      styles: {
        fontSize: 7, cellPadding: 2, textColor: [255, 255, 255], fillColor: [20, 20, 20],
        lineColor: [50, 50, 50], lineWidth: 0.1, font: pdfFont, fontStyle: 'normal',
        overflow: 'linebreak', halign: 'left',
      },
      headStyles: {
        fillColor: [210, 47, 39], textColor: [255, 255, 255], fontStyle: 'bold',
        fontSize: 8, cellPadding: 3, font: pdfFont,
      },
      bodyStyles: { font: pdfFont },
      columnStyles: {
        0: { cellWidth: 30, halign: 'left' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 30, halign: 'left' },
        3: { cellWidth: 'auto', halign: 'left' },
        4: { cellWidth: 30, halign: 'left' },
      },
      alternateRowStyles: { fillColor: [25, 25, 25] },
      margin: { top: 32, right: 14, bottom: 20, left: 14 },
      didDrawPage: (data: any) => {
        const pageHeight = getPageHeight()
        const pageWidth = getPageWidth()

        const footerLogoSize = 8
        const footerY = pageHeight - 15
        const footerX = 14

        try {
          if (appLogoImg) {
            doc.addImage(appLogoImg, 'PNG', footerX, footerY, footerLogoSize, footerLogoSize)
            doc.setFontSize(8)
            doc.setTextColor(210, 47, 39)
            doc.setFont(pdfFont, 'bold')
            doc.text('Afisza', footerX + footerLogoSize + 4, footerY + footerLogoSize / 2 + 2)
          } else {
            doc.setFontSize(8)
            doc.setTextColor(210, 47, 39)
            doc.setFont(pdfFont, 'bold')
            doc.text('Afisza', footerX, footerY + 4)
          }

          doc.setFontSize(7)
          doc.setTextColor(200, 200, 200)
          doc.setFont(pdfFont, 'normal')
          const footerText = 'wygenerowano automatycznie z aplikacji.'
          const textWidth = doc.getTextWidth(footerText)
          doc.text(footerText, pageWidth - textWidth - 14, footerY + (appLogoImg ? footerLogoSize / 2 + 2 : 4))
        } catch (err) {
          console.error('Error adding footer:', err)
        }

        if (totalAmount && data.pageNumber === data.pageCount) {
          doc.setFontSize(10)
          doc.setTextColor(210, 47, 39)
          doc.setFont(pdfFont, 'bold')
          doc.text(`Kwota do opłaty: ${totalAmount} zł`, 14, data.cursor.y + 8)
        }
      },
    })

    const safeClientName = clientName
      ? clientName.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, '').replace(/\s+/g, '-').toLowerCase().substring(0, 50)
      : 'default'
    doc.save(`work-time-${safeClientName}-${monthYear}.pdf`)
  }

  return (
    <Button onClick={generatePDF} size="sm">
      <FileText className="h-4 w-4 mr-2" />
      Generuj PDF
    </Button>
  )
}
