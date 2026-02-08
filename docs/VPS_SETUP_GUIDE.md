# Przewodnik: Konfiguracja VPS i wdrożenie aplikacji

Od pierwszego logowania do działającej aplikacji na VPS.

---

## Krok 1: Połączenie z VPS przez SSH

Na swoim komputerze (Mac/Linux) otwórz Terminal. Windows: użyj PowerShell lub [PuTTY](https://www.putty.org/).

```bash
ssh root@TWOJ_ADRES_IP
```

Gdy zapyta o hasło – wklej hasło otrzymane od hostingu (wpisywanie hasła nie będzie widoczne – to normalne).

**Jeśli port SSH jest inny niż 22** (hosting może podać np. 2222):
```bash
ssh -p 2222 root@TWOJ_ADRES_IP
```

---

## Krok 2: Aktualizacja systemu

Po zalogowaniu:

```bash
apt update && apt upgrade -y
```

Poczekaj, aż się skończy.

---

## Krok 3: Utworzenie użytkownika (zamiast root)

Bezpieczniej pracować na koncie zwykłego użytkownika z uprawnieniami sudo.

```bash
adduser deploy
```

Podaj hasło i dane (resztę możesz pominąć Enterem).

Dodaj do grupy sudo:

```bash
usermod -aG sudo deploy
```

Przełącz się na tego użytkownika (na stałe dalej możesz logować się jako `deploy`):

```bash
su - deploy
```

Sprawdź sudo:
```bash
sudo whoami
```
Powinno wypisać: `root`.

---

## Krok 4: Instalacja Node.js 22

```bash
# Node.js 22 – działa z Next.js, React i aplikacjami wymagającymi Node 22+ (np. Moltbot)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Sprawdź:
```bash
node -v   # np. v22.x.x
npm -v    # np. 10.x.x
```

---

## Krok 5: Instalacja Git

Potrzebne do klonowania repozytoriów lub wgrywania kodu.

```bash
sudo apt install -y git
git --version
```

---

## Krok 6: Instalacja MySQL (jeśli aplikacja używa bazy)

Dla aplikacji typu Work Time Tracker (Next.js + MySQL):

```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

Zabezpieczenie MySQL (ustaw hasło root, wyłącz logowanie zdalne itd.):

```bash
sudo mysql_secure_installation
```

Utworzenie bazy i użytkownika dla aplikacji (w MySQL):

```bash
sudo mysql
```

W konsoli MySQL:

```sql
CREATE DATABASE wtt_app_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wtt_app_user'@'localhost' IDENTIFIED BY 'WTT_hasloMaslo123';
GRANT ALL PRIVILEGES ON twoja_baza.* TO 'wtt_app_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Nazwę bazy, użytkownika i hasło użyjesz potem w `.env` aplikacji.

---

## Krok 7: Instalacja Nginx (reverse proxy + SSL)

Nginx będzie przyjmował ruch na porcie 80/443 i przekazywał do Twoich aplikacji Node.

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Sprawdź: w przeglądarce wejdź na `http://TWOJ_IP` – powinna być strona „Welcome to nginx”.

---

## Krok 8: Instalacja PM2 (utrzymywanie aplikacji włączonej)

PM2 uruchamia i restartuje Twoje aplikacje Node po restarcie serwera.

```bash
sudo npm install -g pm2
pm2 --version
```

---

## Krok 9: Wgranie aplikacji na VPS

### Opcja A: Przez Git (jeśli masz repo na GitHub/GitLab)

Na VPS:

```bash
cd ~
git clone https://github.com/TWOJ_USER/TWOJ_REPO.git nazwa-aplikacji
cd nazwa-aplikacji
```

### Opcja B: Wgranie z komputera (rsync)

Na **swoim komputerze** (w katalogu z projektem, np. `wtt`):

```bash
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' \
  ./ deploy@TWOJ_IP:/home/deploy/nazwa-aplikacji/
```

Zastąp `TWOJ_IP` i `nazwa-aplikacji` (np. `wtt`). Hasło: to do użytkownika `deploy`.

### Opcja C: Archiwum (zip) + scp

Na komputerze:
```bash
cd /Applications/MAMP/htdocs
zip -r wtt.zip wtt -x "wtt/node_modules/*" -x "wtt/.next/*" -x "wtt/.git/*"
scp wtt.zip deploy@TWOJ_IP:/home/deploy/
```

Na VPS:
```bash
cd ~
unzip wtt.zip
mv wtt nazwa-aplikacji
cd nazwa-aplikacji
```

---

## Krok 10: Uruchomienie aplikacji na VPS

Na VPS, w katalogu projektu (np. `~/wtt`):

```bash
cd ~/nazwa-aplikacji   # lub ~/wtt

# Zależności
npm install --production

# Zmienne środowiskowe (dla Next.js + MySQL)
nano .env.production
```

W pliku `.env.production` (utwórz jeśli nie ma):

```env
NODE_ENV=production
JWT_SECRET=twoj-bardzo-dlugi-losowy-ciag-znakow-min-32
DB_HOST=localhost
DB_PORT=3306
DB_USER=app_user
DB_PASSWORD=silne_haslo
DB_NAME=twoja_baza
```

Zapisz: `Ctrl+O`, Enter, `Ctrl+X`.

Build i start przez PM2:

```bash
npm run build
pm2 start npm --name "wtt" -- start
pm2 save
pm2 startup
```

Ostatnia komenda wyświetli komendę do skopiowania (np. `sudo env PATH=... pm2 startup systemd`). Wykonaj ją, żeby aplikacja startowała po restarcie serwera.

Sprawdź:
```bash
pm2 status
pm2 logs wtt
```

Aplikacja domyślnie słucha na porcie **3000**. Możesz to zmienić przez `PORT=3001` w `ecosystem.config.js` lub w zmiennych dla PM2.

---

## Krok 11: Konfiguracja Nginx (domena lub IP)

Aby wchodzić na aplikację przez `http://TWOJ_IP` (lub później domenę), Nginx musi przekierować ruch na port 3000.

```bash
sudo nano /etc/nginx/sites-available/default
```

Zamień zawartość `location /` na coś w tym stylu (jedna aplikacja na porcie 3000):

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;   # później: twoja-domena.pl

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Zapisz, sprawdź konfigurację i przeładuj Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Wejdź w przeglądarce na `http://TWOJ_IP` – powinna się załadować Twoja aplikacja.

---

## Krok 11b: Aplikacja pod ścieżką (np. app.afisza.com/wtt)

Gdy chcesz serwować aplikację pod podkatalogiem (Next.js z `basePath: '/wtt'` w `next.config.js`):

1. **Utwórz osobny plik vhost** (zamiast edytować `default`):

```bash
sudo nano /etc/nginx/sites-available/app.afisza.com
```

2. **Wklej konfigurację** (zamień `app.afisza.com` na swoją domenę):

```nginx
server {
    listen 80;
    server_name app.afisza.com;

    # Aplikacja WTT pod ścieżką /wtt (wpisujesz ręcznie app.afisza.com/wtt)
    location /wtt {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Włącz vhost i przeładuj Nginx:**

```bash
sudo ln -sf /etc/nginx/sites-available/app.afisza.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

4. **Na serwerze upewnij się, że aplikacja działa:** `pm2 status`, `pm2 logs wtt`. Aplikacja musi być zbudowana z `basePath: '/wtt'` i nasłuchiwać na porcie 3000.

Po konfiguracji aplikacja będzie dostępna pod `http://app.afisza.com/wtt` (bez przekierowania z głównej strony domeny).

---

## Krok 12: Kilka aplikacji na jednym VPS

- Każda aplikacja w osobnym katalogu, np. `~/wtt`, `~/druga-app`.
- Każda na innym porcie: np. 3000, 3001, 3002.

Uruchomienie:

```bash
cd ~/druga-app
npm install --production
npm run build
PORT=3001 pm2 start npm --name "druga-app" -- start
pm2 save
```

W Nginx – osobna „server” blok na subdomenę lub ścieżkę, np.:

```nginx
# /etc/nginx/sites-available/default – dodaj drugi server
server {
    listen 80;
    server_name app2.twoja-domena.pl;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Krok 13: Firewall (opcjonalnie, zalecane)

Zostaw tylko SSH, HTTP i HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Krok 14: SSL (HTTPS) – gdy masz domenę

Gdy domena wskazuje na IP VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d twoja-domena.pl
```

Certbot sam skonfiguruje Nginx pod HTTPS.

---

## Szybka ściągawka – po pierwszej konfiguracji

| Co robisz           | Komenda |
|---------------------|--------|
| Logowanie na VPS    | `ssh deploy@TWOJ_IP` |
| Lista aplikacji PM2 | `pm2 status` |
| Logi aplikacji      | `pm2 logs nazwa-app` |
| Restart aplikacji   | `pm2 restart nazwa-app` |
| Nowy deploy (git)   | `git pull && npm install && npm run build && pm2 restart nazwa-app` |

---

## Wymagania dla Twojej aplikacji (Work Time Tracker)

- Node.js 18+ ✅ (krok 4 – Node 20)
- MySQL ✅ (krok 6)
- Zmienne: `JWT_SECRET`, `DB_*` ✅ (krok 10)
- Po pierwszym wdrożeniu: w aplikacji (Ustawienia) możesz uruchomić migrację JSON → MySQL i ustawić tryb MySQL, jeśli wcześniej używałeś plików JSON.

Masz pytanie na którymś kroku – napisz który numer / który etap.