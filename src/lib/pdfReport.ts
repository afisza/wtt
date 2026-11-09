/**
 * Raport miesięczny PDF — jasny, do druku i wysłania klientowi.
 *
 * Układ: nagłówek (klient, miesiąc) → podsumowanie (godziny, dni, zadania, kwota, statusy,
 * zlecający) → szczegóły pogrupowane po dniach → stopka „Strona X z Y” na każdej stronie.
 * Puste dni są pomijane, opisy zadań nie są ucinane (zawijają się).
 *
 * Ładowane dynamicznie (jsPDF + czcionka ~1 MB) dopiero po kliknięciu „Generuj PDF”.
 */
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { Task, TaskStatus } from '@/components/tasks/types';
import { assetUrl } from '@/lib/apiBase';
import { DAY_NAMES, MONTH_NAMES, toMinutes } from '@/lib/tasks';
import {
  STATUS_ORDER,
  buildReportSummary,
  formatHours,
  formatMoney,
  taskMinutes,
  type ReportSummary,
} from '@/lib/reportSummary';
import { DEFAULT_VAT_RATE, splitAmount, type RateBasis } from '@/lib/rate';

import figtreeRegularUrl from '@/assets/fonts/Figtree-Regular.ttf?url';
import figtreeSemiBoldUrl from '@/assets/fonts/Figtree-SemiBold.ttf?url';
import bricolageBoldUrl from '@/assets/fonts/BricolageGrotesque-Bold.ttf?url';

type RGB = [number, number, number];

interface PdfFont {
  file: string;
  family: string;
  style: 'normal' | 'bold';
  base64: string;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * Prawdziwe pliki TTF (statyczne — jsPDF nie obsługuje czcionek zmiennych), Google Fonts, licencja OFL.
 * Pogrubienie to osobny krój, a nie „malowanie” obrysem — stąd ostre litery w każdym powiększeniu.
 * Gdy pobranie się nie uda, zapasowo Roboto Regular (ma polskie znaki).
 */
async function loadFonts(): Promise<PdfFont[]> {
  const fetchFont = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font ${res.status}`);
    return toBase64(await res.arrayBuffer());
  };
  try {
    const [regular, semibold, bricolage] = await Promise.all([
      fetchFont(figtreeRegularUrl),
      fetchFont(figtreeSemiBoldUrl),
      fetchFont(bricolageBoldUrl).catch(() => null),
    ]);
    const list: PdfFont[] = [
      { file: 'Figtree-Regular.ttf', family: 'Figtree', style: 'normal', base64: regular },
      { file: 'Figtree-SemiBold.ttf', family: 'Figtree', style: 'bold', base64: semibold },
    ];
    if (bricolage)
      list.push({
        file: 'Bricolage-Bold.ttf',
        family: 'Bricolage',
        style: 'bold',
        base64: bricolage,
      });
    return list;
  } catch {
    const { robotoFontBase64, robotoFontName } = await import('@/lib/roboto-font');
    return [
      { file: robotoFontName, family: 'Figtree', style: 'normal', base64: robotoFontBase64 },
      { file: robotoFontName, family: 'Figtree', style: 'bold', base64: robotoFontBase64 },
    ];
  }
}

// Paleta aplikacji przełożona na druk (jasne tło, ciemny tekst, peach jako akcent).
const C = {
  ink: [24, 26, 47] as RGB,
  navy: [36, 46, 73] as RGB,
  muted: [96, 102, 124] as RGB,
  faint: [150, 155, 172] as RGB,
  line: [226, 222, 218] as RGB,
  paper: [248, 245, 242] as RGB,
  peach: [253, 164, 129] as RGB,
  peachTint: [255, 239, 231] as RGB,
  accent: [184, 90, 44] as RGB,
  white: [255, 255, 255] as RGB,
};

const STATUS_COLOR: Record<TaskStatus, RGB> = {
  wykonano: [34, 128, 88],
  'w trakcie': [196, 102, 40],
  'do zrobienia': [96, 102, 124],
  zaplanowano: [52, 92, 170],
  anulowane: [180, 24, 45],
};

const MONTH_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

export interface WorkReportInput {
  currentMonth: Date;
  days: Date[];
  daysData: Record<string, { tasks: Task[] } | undefined>;
  clientName?: string;
  clientLogo?: string;
  /** Kwota (string liczbowy z aplikacji) — pusta, gdy nie ustawiono stawki. */
  totalAmount?: string;
  hourlyRate?: string | null;
  /** Czy stawka i kwota są netto czy brutto (Ustawienia → Stawka godzinowa). */
  rateBasis?: RateBasis;
  /** VAT w % — do rozbicia kwoty na netto / VAT / brutto. */
  vatRate?: number;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16; // margines
const CONTENT_W = PAGE_W - 2 * M;

async function loadImage(src: string, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

/** Obraz → PNG przez canvas (działa dla JPG/PNG/WebP/SVG) + proporcje do dopasowania. */
function toPng(img: HTMLImageElement): { data: string; ratio: number } | null {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, 512 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), ratio: w / h };
  } catch {
    return null; // „tainted canvas” przy obcej domenie bez CORS
  }
}

export async function generateWorkReport(input: WorkReportInput): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, fonts] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadFonts(),
  ]);

  const summary = buildReportSummary(input.days, input.daysData, (d) => format(d, 'yyyy-MM-dd'));
  const monthLabel = `${MONTH_NAMES[input.currentMonth.getMonth()]} ${input.currentMonth.getFullYear()}`;
  const client = input.clientName?.trim() || 'Raport';
  const amount = Number(input.totalAmount);
  const hasAmount = !!input.totalAmount && Number.isFinite(amount) && amount > 0;
  const rate = Number(String(input.hourlyRate ?? '').replace(',', '.'));
  const basis: RateBasis = input.rateBasis ?? 'netto';
  const vatRate = input.vatRate ?? DEFAULT_VAT_RATE;
  const vatLabel = `${String(vatRate).replace('.', ',')}%`;
  const money = splitAmount(hasAmount ? amount : 0, basis, vatRate);
  const rateSplit = rate > 0 ? splitAmount(rate, basis, vatRate) : null;

  // Czcionki aplikacji: Figtree (tekst, regular + semibold jako „bold”), Bricolage Grotesque (tytuły).
  let font = 'helvetica';
  let display = 'helvetica';
  /** Nowy dokument A4 z czcionkami (używany też do przebiegu próbnego tabeli). */
  const makeDoc = () => {
    const d = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    try {
      for (const f of fonts) {
        d.addFileToVFS(f.file, f.base64);
        d.addFont(f.file, f.family, f.style);
      }
      font = 'Figtree';
      display = fonts.some((f) => f.family === 'Bricolage') ? 'Bricolage' : 'Figtree';
    } catch {
      /* zostaje helvetica (bez polskich znaków diakrytycznych) */
    }
    d.setFont(font, 'normal');
    return d;
  };
  const doc = makeDoc();
  doc.setFont(font, 'normal');
  doc.setProperties({
    title: `${client} — raport czasu pracy, ${monthLabel}`,
    subject: 'Raport czasu pracy',
    creator: 'Afisza Time Tracker',
  });

  // ── Pomocnicze ──────────────────────────────────────────────────────────────
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  /** Tekst; `bold` = Figtree SemiBold, `display` = Bricolage Grotesque Bold (tytuły, duże liczby). */
  const text = (
    s: string,
    x: number,
    y: number,
    o: {
      size?: number;
      c?: RGB;
      bold?: boolean;
      display?: boolean;
      align?: 'left' | 'right' | 'center';
      maxWidth?: number;
    } = {},
  ) => {
    doc.setFont(o.display ? display : font, o.display || o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    color(o.c ?? C.ink);
    doc.text(s, x, y, { align: o.align ?? 'left', maxWidth: o.maxWidth });
    doc.setFont(font, 'normal');
  };

  const [appLogo, clientLogoImg] = await Promise.all([
    loadImage('/logo.png'),
    input.clientLogo ? loadImage(assetUrl(input.clientLogo)) : Promise.resolve(null),
  ]);
  const appLogoPng = appLogo ? toPng(appLogo) : null;
  const clientLogoPng = clientLogoImg ? toPng(clientLogoImg) : null;

  // ── Nagłówek (strona 1) ────────────────────────────────────────────────────
  fill(C.ink);
  doc.rect(0, 0, PAGE_W, 3, 'F');
  fill(C.peach);
  doc.rect(0, 3, PAGE_W, 0.8, 'F');

  let x = M;
  const headTop = 16;
  if (clientLogoPng) {
    const h = 16;
    const w = Math.min(32, h * clientLogoPng.ratio);
    doc.addImage(clientLogoPng.data, 'PNG', M, headTop, w, w / clientLogoPng.ratio);
    x = M + w + 5;
  }
  text('RAPORT CZASU PRACY', x, headTop + 3, { size: 7.5, c: C.accent, bold: true });
  text(client, x, headTop + 10.5, { size: 20, display: true, maxWidth: 120 });
  const last = new Date(input.currentMonth.getFullYear(), input.currentMonth.getMonth() + 1, 0);
  text(`${monthLabel}  ·  01–${format(last, 'dd.MM.yyyy')}`, x, headTop + 16.5, {
    size: 9.5,
    c: C.muted,
  });

  const rightX = PAGE_W - M;
  if (appLogoPng) {
    const s = 5.5;
    const tw = (doc.setFontSize(9), doc.getTextWidth('Afisza Time Tracker'));
    doc.addImage(
      appLogoPng.data,
      'PNG',
      rightX - tw - s - 2,
      headTop - 0.8,
      s,
      s / appLogoPng.ratio,
    );
  }
  text('Afisza Time Tracker', rightX, headTop + 3.2, { size: 9, bold: true, align: 'right' });
  text(
    `Wygenerowano ${format(new Date(), 'd MMMM yyyy, HH:mm', { locale: pl })}`,
    rightX,
    headTop + 8.5,
    {
      size: 7.5,
      c: C.muted,
      align: 'right',
    },
  );

  let y = headTop + 25;
  stroke(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 7;

  // ── Podsumowanie: karty ────────────────────────────────────────────────────
  const cards: { label: string; value: string; sub: string; highlight?: boolean }[] = [
    { label: 'SUMA GODZIN', value: formatHours(summary.totalMinutes), sub: 'łącznie w miesiącu' },
    {
      label: 'DNI PRACY',
      value: String(summary.days.length),
      sub: summary.days.length === 1 ? 'dzień z wpisami' : 'dni z wpisami',
    },
    {
      label: 'ZADANIA',
      value: String(summary.taskCount),
      sub: `wykonane: ${summary.byStatus.wykonano}`,
    },
  ];
  if (hasAmount)
    cards.push({
      label: 'DO ZAPŁATY · BRUTTO',
      value: formatMoney(money.gross),
      sub: `netto ${formatMoney(money.net)} + VAT ${vatLabel}`,
      highlight: true,
    });

  const gap = 4;
  const cardW = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const cardH = 23;
  cards.forEach((card, i) => {
    const cx = M + i * (cardW + gap);
    fill(card.highlight ? C.peachTint : C.paper);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'F');
    text(card.label, cx + 4, y + 6, { size: 6.8, c: C.muted, bold: true });
    text(card.value, cx + 4, y + 14.5, { size: card.value.length > 11 ? 14 : 17, display: true });
    text(card.sub, cx + 4, y + 19.5, { size: 7, c: C.muted });
  });
  y += cardH + 9;

  // ── Podsumowanie: statusy + zlecający ─────────────────────────────────────
  const colW = (CONTENT_W - 10) / 2;
  const blockTop = y;

  text('Statusy zadań', M, y, { size: 10.5, display: true });
  let by = y + 4;
  if (summary.taskCount > 0) {
    let bx = M;
    for (const s of STATUS_ORDER) {
      const n = summary.byStatus[s];
      if (!n) continue;
      const w = (n / summary.taskCount) * colW;
      fill(STATUS_COLOR[s]);
      doc.rect(bx, by, w, 2.6, 'F');
      bx += w;
    }
  }
  by += 8;
  STATUS_ORDER.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const lx = M + col * (colW / 2);
    const ly = by + row * 5.5;
    fill(STATUS_COLOR[s]);
    doc.circle(lx + 1.2, ly - 1.1, 1.1, 'F');
    text(s.charAt(0).toUpperCase() + s.slice(1), lx + 4, ly, { size: 8.5, c: C.navy });
    text(String(summary.byStatus[s]), lx + colW / 2 - 6, ly, {
      size: 8.5,
      bold: true,
      align: 'right',
    });
  });
  const statusBottom = by + Math.ceil(STATUS_ORDER.length / 2) * 5.5;

  const ax = M + colW + 10;
  text('Zlecający', ax, blockTop, { size: 10.5, display: true });
  let ay = blockTop + 7;
  const top = summary.byAssigner.slice(0, 5);
  if (top.length === 0) {
    text('Brak przypisanych osób.', ax, ay, { size: 8.5, c: C.muted });
    ay += 5.5;
  }
  const maxMin = Math.max(1, ...top.map((a) => a.minutes));
  for (const a of top) {
    text(a.name, ax, ay, { size: 8.5, c: C.navy, maxWidth: colW - 34 });
    text(`${formatHours(a.minutes)}  ·  ${a.tasks} zad.`, ax + colW, ay, {
      size: 8.5,
      align: 'right',
    });
    fill(C.paper);
    doc.rect(ax, ay + 1.3, colW, 1, 'F');
    fill(C.peach);
    doc.rect(ax, ay + 1.3, (a.minutes / maxMin) * colW, 1, 'F');
    ay += 6.5;
  }
  if (summary.byAssigner.length > top.length) {
    text(`+ ${summary.byAssigner.length - top.length} kolejnych osób`, ax, ay, {
      size: 7.5,
      c: C.muted,
    });
    ay += 5;
  }

  y = Math.max(statusBottom, ay) + 6;

  // ── Szczegóły ─────────────────────────────────────────────────────────────
  text('Szczegóły', M, y, { size: 13, display: true });
  y += 3;

  if (summary.days.length === 0) {
    text('Brak wpisów w tym miesiącu.', M, y + 8, { size: 10, c: C.muted });
  } else {
    type Cell = {
      content: string;
      colSpan?: number;
      styles?: Record<string, unknown>;
      bold?: boolean;
      /** Wiersz nie może zostać sam na dole strony (nagłówek dnia, „Razem” przed kwotą). */
      keepWithNext?: boolean;
    };
    const body: Cell[][] = [];
    for (const day of summary.days) {
      const d = day.date;
      const dayName = DAY_NAMES[d.getDay()];
      body.push([
        {
          content: `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)}, ${d.getDate()} ${MONTH_GENITIVE[d.getMonth()]}`,
          colSpan: 4,
          bold: true,
          keepWithNext: true,
          styles: {
            fillColor: C.paper,
            textColor: C.ink,
            fontSize: 8.5,
            cellPadding: { top: 2.6, bottom: 2.2, left: 3, right: 3 },
          },
        },
        {
          content: formatHours(toMinutes(day.total)),
          bold: true,
          styles: {
            fillColor: C.paper,
            textColor: C.ink,
            halign: 'right',
            fontSize: 8.5,
            cellPadding: { top: 2.6, bottom: 2.2, left: 3, right: 3 },
          },
        },
      ]);
      for (const t of day.tasks) {
        const cancelled = t.status === 'anulowane';
        const tone = cancelled ? C.faint : C.ink;
        body.push([
          { content: `${t.startTime}–${t.endTime}`, styles: { textColor: C.muted } },
          { content: t.text.trim(), styles: { textColor: tone } },
          {
            content: (Array.isArray(t.assignedBy) ? t.assignedBy : []).join(', ') || '—',
            styles: { textColor: cancelled ? C.faint : C.navy },
          },
          { content: t.status, styles: { textColor: STATUS_COLOR[t.status] ?? C.muted } },
          {
            content: formatHours(taskMinutes(t)).replace(' h', ''),
            styles: { textColor: cancelled ? C.faint : C.navy, halign: 'right' },
          },
        ]);
      }
    }

    const totalRow: Cell[] = [
      {
        content: 'Razem',
        colSpan: 3,
        bold: true,
        keepWithNext: hasAmount,
        styles: { fillColor: C.ink, textColor: C.white, fontSize: 9.5 },
      },
      {
        content: formatHours(summary.totalMinutes),
        colSpan: 2,
        bold: true,
        styles: { fillColor: C.ink, textColor: C.white, halign: 'right', fontSize: 9.5 },
      },
    ];
    body.push(totalRow);
    if (hasAmount) {
      // Netto → VAT → brutto; brutto wyróżnione jako kwota do zapłaty.
      const moneyRow = (label: string, value: number, strong = false, last = false): Cell[] => [
        {
          content: label,
          colSpan: 3,
          bold: strong,
          keepWithNext: !last,
          styles: { fillColor: C.peachTint, textColor: C.ink, fontSize: strong ? 9.5 : 8.5 },
        },
        {
          content: formatMoney(value),
          colSpan: 2,
          bold: strong,
          styles: {
            fillColor: C.peachTint,
            textColor: C.ink,
            halign: 'right',
            fontSize: strong ? 9.5 : 8.5,
          },
        },
      ];
      // Mnożenie pokazujemy przy kwocie, w której stawka jest wpisana — druga wynika z VAT
      // (stawka po przeliczeniu jest zaokrąglona, więc jej iloczyn różniłby się o grosze).
      const formula = rate > 0 ? `  (${formatHours(summary.totalMinutes)} × ${formatMoney(rate)}/h)` : '';
      body.push(
        moneyRow(`Netto${basis === 'netto' ? formula : ''}`, money.net),
        moneyRow(`VAT ${vatLabel}`, money.vat),
        moneyRow(`Do zapłaty brutto${basis === 'brutto' ? formula : ''}`, money.gross, true, true),
      );
    }

    const BOTTOM = 20;
    const tableOptions = (rows: Cell[][], onCell?: (data: any) => void) => ({
      startY: y + 2,
      head: [['Godziny', 'Zadanie', 'Zlecający', 'Status', 'Czas']],
      body: rows as never,
      theme: 'plain',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      margin: { top: 22, right: M, bottom: BOTTOM, left: M },
      styles: {
        font,
        fontStyle: 'normal',
        fontSize: 8.2,
        textColor: C.ink,
        cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
        lineColor: C.line,
        lineWidth: { bottom: 0.2 },
        overflow: 'linebreak',
        valign: 'top',
      },
      headStyles: {
        font,
        fillColor: C.white,
        textColor: C.muted,
        fontSize: 7,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
        lineColor: C.ink,
        lineWidth: { bottom: 0.4 },
      },
      columnStyles: {
        0: { cellWidth: 25, overflow: 'visible' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35 },
        3: { cellWidth: 23 },
        4: { cellWidth: 15, halign: 'right' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'head') {
          data.cell.text = data.cell.text.map((s: string) => s.toUpperCase());
          if (data.column.index === 4) data.cell.styles.halign = 'right';
        }
        if (data.section === 'body' && data.cell.raw?.bold) data.cell.styles.fontStyle = 'bold';
      },
      didDrawCell: (data: any) => onCell?.(data),
    });

    // „Trzymaj z następnym”: autotable tego nie umie, więc robimy przebieg próbny na pustym
    // dokumencie, szukamy wierszy, które wylądowały na dole strony bez następnika, i wstawiamy
    // przed nie niewidoczny wypełniacz zajmujący resztę strony. Kilka przebiegów, bo przesunięcie
    // może utworzyć nową sierotę dalej.
    const rows = [...body];
    for (let pass = 0; pass < 6; pass++) {
      const dry = makeDoc();
      const pos = new Map<number, { page: number; y: number }>();
      autoTable(
        dry,
        tableOptions(rows, (data) => {
          if (data.section === 'body' && !pos.has(data.row.index))
            pos.set(data.row.index, { page: data.pageNumber, y: data.cell.y });
        }) as never,
      );
      const orphans: { index: number; y: number }[] = [];
      rows.forEach((r, i) => {
        if (!r[0]?.keepWithNext) return;
        const a = pos.get(i);
        const b = pos.get(i + 1);
        if (!a || !b || a.page === b.page) return;
        // Cały łańcuch „trzymaj z następnym” (np. Razem → Netto → VAT → Brutto) idzie razem.
        let start = i;
        while (start > 0 && rows[start - 1][0]?.keepWithNext) start--;
        const s0 = pos.get(start);
        if (s0 && !orphans.some((o) => o.index === start)) orphans.push({ index: start, y: s0.y });
      });
      if (orphans.length === 0) break;
      for (const o of orphans.sort((x, y) => y.index - x.index)) {
        const h = PAGE_H - BOTTOM - o.y - 0.5;
        if (h <= 0) continue;
        rows.splice(o.index, 0, [
          {
            content: '',
            colSpan: 5,
            styles: { minCellHeight: h, cellPadding: 0, lineWidth: 0, fillColor: false },
          },
        ]);
      }
    }

    autoTable(doc, tableOptions(rows) as never);

    if (hasAmount) {
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY;
      if (finalY && finalY + 10 < PAGE_H - BOTTOM) {
        text(
          rateSplit
            ? `Stawka godzinowa: ${formatMoney(rateSplit.net)} netto / ${formatMoney(rateSplit.gross)} brutto (VAT ${vatLabel}).`
            : `Kwoty: netto + VAT ${vatLabel} = brutto.`,
          M,
          finalY + 7,
          { size: 7.5, c: C.muted },
        );
      }
    }
  }

  // ── Stopka i nagłówek kolejnych stron ─────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p > 1) {
      fill(C.ink);
      doc.rect(0, 0, PAGE_W, 1.5, 'F');
      text(client, M, 11, { size: 8.5, bold: true });
      text(`Raport czasu pracy  ·  ${monthLabel}`, PAGE_W - M, 11, {
        size: 8,
        c: C.muted,
        align: 'right',
      });
    }
    stroke(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, PAGE_H - 13, PAGE_W - M, PAGE_H - 13);
    text(`${client}  ·  ${monthLabel}  ·  Afisza Time Tracker`, M, PAGE_H - 8.5, {
      size: 7,
      c: C.faint,
    });
    text(`Strona ${p} z ${pages}`, PAGE_W - M, PAGE_H - 8.5, {
      size: 7,
      c: C.muted,
      align: 'right',
    });
  }

  const safe = client
    .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 50);
  doc.save(`raport-${safe || 'czas-pracy'}-${format(input.currentMonth, 'yyyy-MM')}.pdf`);
}

export type { ReportSummary };
