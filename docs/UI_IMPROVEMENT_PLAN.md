# Afisza Time Tracker — Plan ulepszeń UI/UX

> Ostatnia aktualizacja: 2026-03-14

## Obecny stan

**Fazy 1–6 UKOŃCZONE.** shadcn/ui (17 komponentów) + Tailwind. Rozbite monolity. UX: Skeleton, AlertDialog, Cmd+K, breadcrumbs, animacje, drag & drop, undo, "Zapisano". Mobile: responsywny kalendarz (card layout), bottom nav, hamburger Sheet, touch targets 44px, skip-to-content, aria-labels, focus-visible, prefers-reduced-motion. Polish: mikro-animacje, manifest.json (PWA), OG meta, custom 404/error, splash screen, onboarding tour, progress bary z %.

---

## Faza 1 — Design system & spójność

### 1.1 Instalacja komponentów shadcn/ui
- [x] `Input` — pola formularzy (login, settings, task edit)
- [x] `Card` — karty zadań, panele ustawień, login form
- [x] `Badge` — statusy zadań, etykiety
- [x] `Dialog` / `AlertDialog` — potwierdzenia usuwania, edycja zadań
- [x] `Tabs` — zakładki klientów, zakładki ustawień
- [x] `Tooltip` — podpowiedzi na ikonach
- [x] `Select` — wybór statusu, wybór miesiąca
- [x] `Checkbox` — "Zapamiętaj mnie", filtry
- [x] `Skeleton` — loading placeholders
- [x] `Sheet` — mobile menu / panel boczny
- [x] `DropdownMenu` — menu kontekstowe zadań
- [x] `Label` — etykiety formularzy
- [x] `Separator` — rozdzielanie sekcji

### 1.2 Migracja stylów inline → Tailwind + shadcn
- [x] `LoginForm.tsx` — wzorcowy komponent (Card, Input, Label, Checkbox, Tabs, Button)
- [x] `app/page.tsx` (header sticky + backdrop-blur, Skeleton loading, Button z ikonami)
- [x] `ClientTabs.tsx` (Input search, Badge statusy, Skeleton, Button, cn() utility)
- [x] `CalendarTable.tsx` (Button nav, Skeleton loading, Badge statusy, cn(), hover:bg-muted, rounded-lg border)
- [x] `TaskList.tsx` (Button ghost/icon, Input, Label, Badge, cn(), usunięte 5 style constants, zero inline styles)
- [x] `TimeEntry.tsx` (Button, Input, Tailwind classes)
- [x] `app/settings/page.tsx` (Card, Tabs, Input, Label, Button, Separator — shadcn tabs zamiast manual)
- [x] `ToastContext.tsx` (Tailwind classes, cn(), hover: classes, zero inline styles)

### 1.3 Skala typografii
- Minimum: 12px (opisy, etykiety drugorzędne)
- Body: 14px (tekst główny, inputy)
- Heading mały: 16px (nazwy sekcji)
- Heading duży: 20-24px (tytuły stron)
- Wyeliminować wszystkie font-size < 12px

### 1.4 Cienie i hierarchia wizualna
- Karty: `shadow-sm` + `border`
- Dialogi: `shadow-lg`
- Hover na wierszach tabeli
- Zebra-striping w tabeli kalendarza
- Wyraźne oddzielenie sekcji (gap, border, background)

---

## Faza 2 — Rozbicie komponentów

### 2.1 TaskList.tsx (1487→439 linii) → moduły
- [x] `components/tasks/types.tsx` — TaskStatus, Task, statusOptions, attachmentSrc(), renderTextWithLinks()
- [x] `components/tasks/TaskForm.tsx` — formularz dodawania/edycji (add/edit mode via discriminated union)
- [x] `components/tasks/AttachmentGallery.tsx` — galeria załączników (view + editable mode z upload/delete)
- [x] `components/tasks/AssignerPicker.tsx` — searchable dropdown + chips z avatarami
- [x] `components/tasks/Lightbox.tsx` — pełnoekranowy lightbox z nawigacją klawiaturą

### 2.2 CalendarTable.tsx (933→200 linii) → moduły
- [x] `hooks/useCalendarData.ts` — hook: state, loadData, saveData, calculateTotalHours, moveTask, changeMonth
- [x] `components/calendar/CalendarHeader.tsx` — nawigacja miesiąca (prev/next)
- [x] `components/calendar/DayRow.tsx` — wiersz dnia w tabeli (data, godziny, assigners, tasks, statusy)
- [x] `components/calendar/PdfExportButton.tsx` — generacja PDF z jsPDF + autoTable

### 2.3 Settings page (1609→151 linii) → moduły
- [x] `components/settings/ConfigTab.tsx` — konfiguracja bazy (host/port/user/pass/db), test połączenia, storage mode
- [x] `components/settings/InfoTab.tsx` — info o bazie, migracja JSON→MySQL, inicjalizacja tabel
- [x] `components/settings/RateTab.tsx` — stawka godzinowa (localStorage)
- [x] `components/settings/AssignersTab.tsx` — CRUD osób zlecających z avatarami
- [x] `components/settings/ClientsTab.tsx` — CRUD klientów z logotypami

---

## Faza 3 — UX improvements

- [x] Skeleton loading zamiast tekstu "Ładowanie..." (AssignersTab, ClientsTab, InfoTab, settings page)
- [x] Animowane przejścia między miesiącami (slide left/right) — CSS animations slideInLeft/slideCalRight
- [x] Empty states z ikonami (UserX w AssignersTab, Users w ClientsTab)
- [x] Confirmation dialogs (shadcn AlertDialog) zamiast window.confirm (3 miejsca: AssignersTab, ClientsTab, InfoTab)
- [x] Command palette (Cmd+K) do szybkiego wyszukiwania zadań/klientów — komponenty cmdk + shadcn CommandDialog
- [x] Breadcrumbs na stronie ustawień (Home → Ustawienia)
- [x] Drag & drop z lepszym feedbackiem wizualnym (CSS classes: dragging-task, drag-over-highlight z animacją pulse)
- [x] Undo na usunięcie zadania (toast z przyciskiem "Cofnij" przez 5 sekund)
- [x] Autosave z debounce + wskaźnik "Zapisano" (CheckCircle2 indicator po zapisie, 2s)

---

## Faza 4 — Mobile & dostępność (a11y)

- [x] Responsywna tabela kalendarza (DayCard.tsx — card layout na mobile `md:hidden`, tabela `hidden md:block`)
- [x] Bottom navigation bar na mobile (Kalendarz, Szukaj, Ustawienia, Wyloguj — `sm:hidden`, safe-area)
- [x] Hamburger menu / Sheet z nawigacją (Sheet na mobile w headerze, desktop nav ukryte poniżej `sm:`)
- [x] Touch targets min 44×44px (`min-h-[44px] min-w-[44px]` na wszystkich icon buttonach, selectach, nav itemach)
- [x] `aria-label` na wszystkich przyciskach z ikonami (TaskList 6 przycisków, TimeEntry 3, ClientTabs 1, Lightbox 3, AttachmentGallery thumbnails+delete, DayRow status selects, DayCard status selects)
- [x] `focus-visible` ring na interaktywnych elementach (globalna reguła `*:focus-visible` w globals.css)
- [x] Skip-to-content link (layout.tsx → `#main-content`, sr-only z focus reveal)
- [x] Obsługa klawiatury w lightboxie, dialogach, dropdownach (Lightbox: Escape/Arrow, AlertDialog: Radix a11y, CommandDialog: cmdk keyboard)
- [x] Kontrast kolorów zgodny z WCAG AA (`--muted-foreground` ≥ 4.5:1, `prefers-reduced-motion` media query)

---

## Faza 5 — Polish & detale

- [x] Mikro-animacje (hover scale, button press `active:scale-[0.97]`, page transitions `animate-fade-in`, splash pulse)
- [x] Favicony w różnych rozmiarach + manifest.json (PWA-ready) — `public/manifest.json`, `appleWebApp` w metadata
- [x] OG meta tags — `openGraph` w layout.tsx metadata (title, description, locale, type)
- [x] Custom 404 i error page — `app/not-found.tsx` (FileQuestion icon), `app/error.tsx` (AlertTriangle + reset)
- [x] Splash screen / loading screen z logo — animowany logo `splash-logo` z pulsem na ekranie ładowania
- [x] Onboarding — tooltip tour dla nowych użytkowników (`OnboardingTour.tsx`, 4 kroki, localStorage `wttOnboardingDone`)
- [x] Progress bary z % postępu — `ProgressBar.tsx` (ukończone / aktywne) w CalendarTable, kolorowe progi

---

## Faza 6 — Performance

- [x] `React.memo` na DayRow i DayCard — eliminacja ~30 zbędnych re-renderów na zmianę miesiąca
- [x] `useMemo` na kosztownych obliczeniach: `monthTotal`, `totalAmount`, `days`, progress stats, `sortedTasks`, `dayAssigners`
- [x] `useCallback` na drag handlerach (5 handlerów) + `handleChangeMonth` — stabilne referencje dla memo
- [x] `useMemo` na `dragHandlers` object — zapobiega re-render DayRow przy każdym render rodzica
- [x] Konsolidacja kaskadowych `useEffect` w ClientTabs — redukcja z 3+ do 2 renderów na mount
- [x] `next.config.js`: `compress: true`, `productionBrowserSourceMaps: false`, `images.formats: [avif, webp]`, cache headers (static: 1yr immutable, assets: 1d)
- [x] Finite drag animation zamiast `infinite` — redukcja CPU podczas drag & drop

---

## Decyzje techniczne

| Decyzja | Wybór | Powód |
|---|---|---|
| UI Library | shadcn/ui | Już częściowo zainstalowany, natywny Tailwind, zero bundle bloat |
| Ikony | Lucide React | Już w projekcie, spójne, tree-shakeable |
| Animacje | Tailwind + CSS transitions | Lekkie, wystarczające dla tego typu app |
| Toasty | Sonner lub shadcn Toast | Zamiana ręcznego ToastContext |
| State management | React Context + hooks | Wystarczające przy obecnej skali |
