#!/bin/bash
# Uruchom na VPS (po SSH): bash -c "$(cat VPS_diagnose.sh)" lub skopiuj poniższe komendy.

echo "========== 1. Katalogi w /home/deploy i ~ =========="
ls -la /home/deploy 2>/dev/null || ls -la ~
echo ""
echo "========== 2. Zawartość katalogu aplikacji (jeśli jest ~/wtt) =========="
ls -la /home/deploy/wtt 2>/dev/null || ls -la ~/wtt 2>/dev/null || echo "Katalog ~/wtt nie znaleziony"
echo ""
echo "========== 3. PM2 – lista procesów =========="
pm2 list 2>/dev/null || echo "PM2 nie uruchomione / brak komendy pm2"
echo ""
echo "========== 4. Nginx – sites-enabled (aktywne vhosty) =========="
ls -la /etc/nginx/sites-enabled/
echo ""
echo "========== 5. Zawartość /etc/nginx/sites-available/app.afisza.com =========="
cat /etc/nginx/sites-available/app.afisza.com 2>/dev/null || echo "Plik nie istnieje"
echo ""
echo "========== 6. Czy coś nasłuchuje na porcie 3000? =========="
ss -tlnp | grep 3000 || netstat -tlnp 2>/dev/null | grep 3000 || echo "Port 3000 nie zajęty lub brak uprawnień"
echo ""
echo "========== 7. Test lokalny: curl -I http://127.0.0.1:3000/wtt =========="
curl -sI http://127.0.0.1:3000/wtt 2>/dev/null || echo "curl nie powiódł się"
echo ""
echo "========== 8. Nginx – test konfiguracji =========="
nginx -t 2>&1
