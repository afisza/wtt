# Usunięcie CyberPanel i instalacja Webmin + Virtualmin

Przewodnik: całkowite usunięcie CyberPanel (i powiązanych usług) z VPS oraz instalacja Webmin i Virtualmin. Po zakończeniu aplikacja WTT (app.afisza.com/wtt) będzie znów obsługiwana przez Nginx zarządzany z panelu Virtualmin.

---

## Wymagania

- Dostęp SSH do VPS jako użytkownik z sudo (np. `deploy` lub `root`)
- Backup bazy i aplikacji (patrz niżej) **przed** usunięciem CyberPanel
- Ok. 1 GB RAM (minimalny Virtualmin); 4 GB+ przy pełnym stosie z pocztą

---

## Część 1: Backup (obowiązkowo przed usunięciem)

### 1.1 Backup bazy MariaDB/MySQL

```bash
# Wszystkie bazy (w tym ewentualna baza aplikacji po jej utworzeniu)
sudo mysqldump -u root --all-databases > ~/backup_mysql_przed_webmin_$(date +%Y%m%d).sql
```

Jeśli masz już użytkownika `wtt_app_user` i bazę `wtt`:

```bash
mysqldump -u wtt_app_user -p wtt > ~/backup_wtt_$(date +%Y%m%d).sql
```

### 1.2 Backup aplikacji i konfiguracji

```bash
# Katalog aplikacji
tar czf ~/backup_wtt_app_$(date +%Y%m%d).tar.gz -C /home/deploy wtt

# Konfiguracja Nginx (jeśli istnieje – po usunięciu LiteSpeed)
sudo tar czf ~/backup_nginx_$(date +%Y%m%d).tar.gz /etc/nginx/ 2>/dev/null || true
```

### 1.3 Pobranie backupów na swój komputer (opcjonalnie)

Na swoim komputerze (nie na VPS):

```bash
scp deploy@161.97.137.59:~/backup_*.sql ./
scp deploy@161.97.137.59:~/backup_*.tar.gz ./
```

---

## Część 2: Zatrzymanie usług CyberPanel i zwolnienie portu 80

(Uwaga: `lscpd` i `lsws` to **nazwy usług systemd** – zatrzymujesz je przez `systemctl stop`, a nie wpisując `lscpd`/`lsws` w terminalu.)

```bash
sudo systemctl stop lscpd
sudo systemctl stop lsws
# Opcjonalnie – jeśli chcesz usunąć też usługi poczty/DNS od CyberPanel:
# sudo systemctl stop postfix
# sudo systemctl stop pdns
```

Sprawdź, że port 80 jest wolny:

```bash
sudo ss -tlnp | grep :80
```

(Powinno być puste.)

---

## Część 3: Usunięcie CyberPanel i LiteSpeed

### 3.1 Usunięcie pakietów

```bash
sudo apt-get purge -y cyberpanel 2>/dev/null || true
sudo apt-get autoremove -y
```

(Ubuntu może nie mieć pakietu `cyberpanel` – wtedy ten krok nic nie zrobi; i tak przejdź do 3.2.)

### 3.2 Usunięcie katalogów CyberPanel i LiteSpeed

```bash
sudo rm -rf /usr/local/CyberPanel
sudo rm -rf /usr/local/lsws
```

### 3.3 Wyłączenie i usunięcie jednostek systemd (żeby nie wracały po restarcie)

```bash
sudo systemctl disable lscpd 2>/dev/null || true
sudo systemctl disable lsws 2>/dev/null || true
sudo systemctl daemon-reload
```

### 3.4 Baza danych CyberPanel (opcjonalnie)

Jeśli nie potrzebujesz bazy `cyberpanel` w MariaDB:

```bash
sudo mysql -e "DROP DATABASE IF EXISTS cyberpanel;"
```

### 3.5 Firewall – port panelu CyberPanel (8090)

```bash
sudo ufw delete allow 8090/tcp 2>/dev/null || true
sudo ufw status
```

### 3.6 Katalogi wirtualnych hostów utworzonych przez CyberPanel (opcjonalnie)

CyberPanel często tworzy katalogi w `/home/` dla domen (np. `/home/app.afisza.com`). Jeśli chcesz zostawić tylko swoją aplikację w `/home/deploy/wtt`, możesz po instalacji Virtualmin przenieść domenę do Virtualmina i ewentualnie usunąć stare katalogi. Na razie możesz je zostawić.

---

## Część 4: Instalacja Webmin

Webmin to panel administracji systemem (użytkownicy, pakiety, usługi, cron itd.). Virtualmin go wykorzystuje.

```bash
sudo apt update
sudo curl -o /tmp/setup-repos.sh https://raw.githubusercontent.com/webmin/webmin/master/setup-repos.sh
sudo bash /tmp/setup-repos.sh
sudo apt install --install-recommends -y webmin
```

Sprawdzenie:

```bash
sudo systemctl status webmin
```

Webmin nasłuchuje na porcie **10000**. W przeglądarce (po otwarciu portu w firewall – patrz niżej):

- **https://161.97.137.59:10000**

Logowanie: użytkownik systemowy z sudo (np. `deploy`) i jego hasło.

---

## Część 5: Instalacja Virtualmin

Virtualmin to panel hostingu (domeny, bazy, poczta, Nginx/Apache). Instalator może doinstalować Nginx (LEMP) lub Apache (LAMP).

### 5.1 Ustawienie hostname (zalecane)

Virtualmin działa lepiej z ustawioną domeną hosta (np. `host.afisza.com` wskazującą na IP serwera):

```bash
sudo hostnamectl set-hostname host.afisza.com
```

(Zamień na swoją subdomenę lub zostaw domyślny hostname.)

### 5.2 Pobranie i uruchomienie skryptu instalacyjnego Virtualmin (GPL)

**Opcja A – LEMP (Nginx)** – jeśli chcesz, żeby Virtualmin zarządzał Nginxem (spójne z Twoją wcześniejszą konfiguracją):

```bash
sudo wget -O /tmp/virtualmin-install.sh https://software.virtualmin.com/gpl/scripts/virtualmin-install.sh
sudo sh /tmp/virtualmin-install.sh --bundle LEMP
```

**Opcja B – LAMP (Apache):**

```bash
sudo sh /tmp/virtualmin-install.sh --bundle LAMP
```

**Opcja C – minimalny instalator (bez pełnej poczty/DNS, mniej RAM):**

```bash
sudo sh /tmp/virtualmin-install.sh --bundle LEMP --type mini
```

Instalator zada kilka pytań (m.in. FQDN). Instalacja trwa zwykle 5–15 minut.

### 5.3 Dostęp do Virtualmin

- **URL:** **https://161.97.137.59:10000** (ten sam port co Webmin – Virtualmin działa w ramach Webmina)
- **Login:** użytkownik z sudo (np. `deploy`) lub `root` (jeśli ustawiłeś hasło: `sudo passwd root`)

Po pierwszym logowaniu Virtualmin może pokazać kreator konfiguracji. Wykonaj go. Na stronie „List Virtual Servers” użyj opcji **Check Configuration**, żeby zweryfikować stan.

---

## Część 6: Firewall – porty Webmin/Virtualmin

```bash
sudo ufw allow 10000/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

---

## Część 7: Przywrócenie działania aplikacji WTT (app.afisza.com/wtt)

### 7.1 Baza danych

Jeśli baza `wtt` nie istnieje w MariaDB (np. po czystej MariaDB od Virtualmin):

```bash
sudo mysql
```

W konsoli MariaDB:

```sql
CREATE DATABASE IF NOT EXISTS wtt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'wtt_app_user'@'localhost' IDENTIFIED BY 'TWOJE_HASLO';
CREATE USER IF NOT EXISTS 'wtt_app_user'@'127.0.0.1' IDENTIFIED BY 'TWOJE_HASLO';
GRANT ALL PRIVILEGES ON wtt.* TO 'wtt_app_user'@'localhost';
GRANT ALL PRIVILEGES ON wtt.* TO 'wtt_app_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

Jeśli masz backup bazy `wtt`:

```bash
mysql -u wtt_app_user -p wtt < ~/backup_wtt_YYYYMMDD.sql
```

### 7.2 Aplikacja Next.js (PM2)

Upewnij się, że aplikacja działa w `/home/deploy/wtt`:

```bash
cd ~/wtt
pm2 list
# Jeśli wtt nie działa:
pm2 start npm --name "wtt" -- start
pm2 save
pm2 startup
```

Sprawdź, że odpowiada lokalnie:

```bash
curl -I http://127.0.0.1:3000/wtt
```

(Oczekiwane: HTTP 200.)

### 7.3 Domena i proxy w Virtualmin (Nginx)

W panelu Virtualmin (https://161.97.137.59:10000):

1. **Create Virtual Server** – domena **app.afisza.com** (lub już istniejący serwer dla tej domeny).
2. Dla tej domeny skonfiguruj **reverse proxy** do Next.js:
   - W Virtualmin: **Services** → **Proxy Website** (lub **Edit Proxy / Reverse Proxy** w ustawieniach serwera).
   - Ustaw proxy dla ścieżki **/wtt** na **http://127.0.0.1:3000** (zachowaj ścieżkę `/wtt` w requestach do backendu, zgodnie z `basePath: '/wtt'` w Next.js).

Dokładna ścieżka w menu zależy od wersji Virtualmin; w razie wątpliwości sprawdź dokumentację: [Virtualmin Proxy](https://www.virtualmin.com/documentation/).

Alternatywa: jeśli Virtualmin nie ustawia proxy wygodnie, możesz dodać ręcznie blok w konfiguracji Nginx dla app.afisza.com (Virtualmin trzyma vhosty w katalogach typu `/etc/nginx/sites-available/` lub w katalogach domen).

### 7.4 Konfiguracja aplikacji (.env.production)

W `/home/deploy/wtt/.env.production` (lub w `data/db-config.json`) upewnij się, że:

- `DB_HOST=127.0.0.1` (lub `localhost`)
- `DB_PORT=3306`
- `DB_USER=wtt_app_user`
- `DB_PASSWORD=TWOJE_HASLO`
- `DB_NAME=wtt`

Potem:

```bash
pm2 restart wtt
```

---

## Podsumowanie – kolejność działań

| Krok | Działanie |
|------|-----------|
| 1 | Backup: baza, aplikacja, Nginx (jeśli był) |
| 2 | Zatrzymanie: `lscpd`, `lsws` |
| 3 | Usunięcie: pakiety CyberPanel, katalogi `/usr/local/CyberPanel`, `/usr/local/lsws` |
| 4 | Instalacja Webmin |
| 5 | Instalacja Virtualmin (np. `--bundle LEMP`) |
| 6 | Firewall: port 10000, 80, 443, SSH |
| 7 | Baza `wtt` + użytkownik `wtt_app_user`, PM2, proxy w Virtualmin/Nginx, .env |

---

## Przydatne linki

- [Webmin](https://webmin.com/)
- [Virtualmin – Automated Installation](https://www.virtualmin.com/docs/installation/automated/)
- [Virtualmin – Download](https://www.virtualmin.com/download/)
- [Virtualmin – LAMP vs LEMP](https://www.virtualmin.com/docs/installation/automated/) (--bundle LAMP | LEMP)

Po zakończeniu panel będzie dostępny pod **https://161.97.137.59:10000** (Webmin + Virtualmin), a aplikacja pod **http://app.afisza.com/wtt** (po skonfigurowaniu proxy i DNS).
