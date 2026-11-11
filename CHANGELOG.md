# Changelog

Wszystkie istotne zmiany w Afisza Time Tracker. Najnowsza wersja na górze.

## [2.7.0] - 2026-11-11

### Numery zadań
- Każde zadanie ma widoczny numer, np. `WTT-323525` (lista dnia, panel dnia, Kanban). Kliknięcie kopiuje numer. W raportach PDF numeru nie ma.
- Zadania bez numeru albo z powtórzonym numerem dostają jednorazowo nowy, unikalny numer.
- Wyszukiwarka znajduje zadanie po numerze („WTT-323525” albo „323525”).

### Bot Telegram
- Usuwanie zadań głosówką lub wiadomością: „Usuń zadanie WTT-323525”. Przed usunięciem bot pokazuje zadanie i prosi o potwierdzenie.
- Potwierdzenie zapisu i lista /dzis pokazują numery zadań.

### Prywatność bota Telegram
- Po rozpoznaniu głosówki bot od razu usuwa transkrypcję z konta ElevenLabs. Tekst zostaje tylko w aplikacji, a wpis powstaje tak jak wcześniej.

## [2.6.0] - 2026-11-10

### Bot Telegram — osoba zlecająca

- Bot rozpoznaje, kto zlecił zadanie („zadanie od Aliny”, „zlecił Kiril”), i przypisuje osobę z listy Osób. Pasuje pełna nazwa, samo imię lub inna odmiana.
- W Ustawieniach → Telegram można wybrać domyślną osobę zlecającą. Dostaje ją wpis, w którym nikogo nie wskazano.
- `POST /api/v1/entries` przyjmuje pole `assignedBy` (imię lub lista imion).

### Poprawka

- Gdy Claude zwróci błąd, bot pokazuje jego przyczynę, np. odrzucony klucz, brak środków lub brak połączenia, zamiast ogólnego komunikatu.

## [2.5.0] - 2026-11-10

### Bot Telegram — wpisy głosówką

- Nowa sekcja Ustawienia → Telegram: podłączasz własnego bota (token z @BotFather), klucz ElevenLabs i klucz Anthropic, a potem łączysz swoje konto Telegram jednorazowym linkiem.
- Głosówkę rozpoznaje ElevenLabs Scribe v2 (polski, ukraiński, rosyjski, angielski). Claude zamienia ją na wpis: klient, data, godziny lub czas trwania i opis po polsku. Przed zapisem bot pokazuje podsumowanie z przyciskami „Zapisz” / „Anuluj”, a poprawkę wystarczy wysłać kolejną wiadomością.
- Bot odpowiada tylko na połączone konto. Webhook jest chroniony sekretem, a klucze są zaszyfrowane w bazie. Komenda /dzis pokazuje wpisy z dzisiaj.

## [2.4.0] - 2026-11-10

### Dostęp API — wpisy z Claude Code i skryptów

- Nowa sekcja Ustawienia → Dostęp API: tworzenie i odwoływanie osobistych tokenów API. Token jest pokazywany tylko raz, a utworzenie go wymaga hasła (i kodu 2FA, jeśli jest włączona).
- Endpoint `POST /api/v1/entries` dodaje wpis: klient po nazwie lub domenie, czas trwania („3h 27min”), opis, opcjonalnie data i godziny. Bez godzin wpis trafia zaraz po ostatnim wpisie z danego dnia. Do tego `GET /api/v1/entries` (wpisy z dnia) i `GET /api/v1/clients`.
- Token może tylko dodawać i czytać wpisy. Nie edytuje ani nie usuwa zadań i nie loguje do aplikacji. Ma termin ważności, limit żądań i blokadę po nieudanych próbach. W bazie zapisany jest tylko jego skrót.

### Poprawka

- Router API wycinał „/api” z każdego miejsca w adresie, nie tylko z początku.

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
