# Changelog

Wszystkie istotne zmiany w Afisza Time Tracker. Najnowsza wersja na górze.

## [2.3.0] - 2026-11-10

### Wybór kwot: netto i/lub brutto
- W Ustawieniach → Stawka godzinowa są dwa pola: „Pokaż kwotę netto” i „Pokaż kwotę brutto”. Zaznaczone kwoty widać w kalendarzu (podsumowanie miesiąca, wiersz „Razem”) i w raporcie PDF.
- Obie zaznaczone: netto, VAT i brutto jak dotąd. Jedna: tylko ona (w PDF jako kwota do zapłaty). Żadna: kwoty są ukryte.

### Kwota bez VAT
- Gdy pole „Stawka VAT” jest puste albo ma 0, netto = brutto, więc pokazujemy jedną kwotę.

## [2.2.0] - 2026-11-09

### Kwoty netto i brutto
- Podsumowanie miesiąca pokazuje jednocześnie kwotę netto i brutto.
- Raport PDF rozbija kwotę na netto, VAT i „Do zapłaty brutto”.
- W ustawieniach stawki doszła stawka VAT (domyślnie 23%) z podglądem stawki netto i brutto za godzinę.

## [2.1.0] - 2026-11-09

### Wpisy już nie znikają

- Każda zmiana trafia najpierw do pamięci przeglądarki i znika z niej dopiero, gdy serwer potwierdzi
  zapis. Odświeżenie strony, utrata internetu czy wygaśnięcie sesji nie kasują już wpisów.
- Sesja odnawia się sama. Gdy mimo to wygaśnie, nad aplikacją pojawia się okno logowania — bez utraty
  tego, co było na ekranie.
- Otwarte formularze zapisują się jako szkic i wracają po odświeżeniu.
- W nagłówku widać prawdziwy stan zapisu, a przy błędzie przycisk „Ponów teraz”.

### Nowy wygląd i widoki

- Nowa kolorystyka, czcionki oraz ciemny i jasny motyw.
- Nowe widoki: tydzień, siatka miesiąca i Kanban (przeciągnięcie karty zmienia status); klawisze 1–4.
- Panel dnia z boku, przenoszenie zadań między dniami, cofanie usunięcia.
- Przebudowane ustawienia i wygodniejszy widok na telefonie.

### Nowy raport PDF

- Jasny, czytelny raport do druku i wysłania klientowi: podsumowanie (godziny, dni pracy, zadania,
  kwota), statusy zadań, godziny według osób zlecających i szczegóły pogrupowane po dniach.
- Ostre czcionki aplikacji (Figtree i Bricolage Grotesque), pełne opisy zadań, numery stron, bez pustych dni.
- Stawka godzinowa i kwota za miesiąc z oznaczeniem netto lub brutto.

### Stawka netto / brutto

- Domyślna stawka to 80 zł brutto za godzinę. W Ustawieniach → Stawka godzinowa można ją zmienić
  i wskazać, czy jest netto (bez VAT), czy brutto (z VAT).
  Informacja pojawia się w podsumowaniu miesiąca i w raporcie PDF.

### Aktualizacje

- Po wdrożeniu nowej wersji aplikacja sama to wykrywa i proponuje odświeżenie, a „Co nowego” pokazuje
  listę zmian.
- Kod QR do weryfikacji dwuetapowej generuje się w przeglądarce — klucz nie trafia do zewnętrznego serwisu.
