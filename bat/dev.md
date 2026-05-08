# dev.md – Anleitung: App lokal starten

Diese Anleitung gilt wenn du die App auf deinem eigenen Rechner
testen willst, ohne auf Railway zu deployen.

---

## Voraussetzung: .env Datei muss vorhanden sein

Im Projektordner (`C:\Users\amasc\website`) muss eine Datei
namens `.env` liegen mit deiner Datenbankverbindung.

Wenn die Datei fehlt oder leer ist:
1. Öffne Railway-Dashboard → dein Projekt → Tab **Variables**
2. Kopiere den Wert von `DATABASE_URL`
3. Öffne (oder erstelle) die Datei `.env` im Projektordner
4. Trage ein:
   ```
   DATABASE_URL=postgresql://... (dein kopierter Wert)
   PORT=3000
   ```

---

## Lokalen Server starten

**Doppelklick auf `dev.bat`**

Das Terminal öffnet sich, der Server startet und der Browser
öffnet automatisch `http://localhost:3000`.

---

## Was du im Terminal siehst

Wenn alles klappt:
```
Server läuft auf http://localhost:3000
```

Wenn nodemon eine Datei bemerkt hat und neu startet:
```
[nodemon] restarting due to changes...
[nodemon] starting `node server.js`
Server läuft auf http://localhost:3000
```

---

## Server stoppen

Klicke ins Terminal-Fenster und drücke **Strg + C**.
Dann `J` bestätigen.

---

## Was tun wenn etwas schief geht?

### Browser öffnet sich aber zeigt nichts
Warte 3–5 Sekunden und lade die Seite neu (F5).
Der Server braucht manchmal kurz zum Starten.

### „DB-Fehler" im Terminal
Die Datenbankverbindung hat nicht funktioniert.
Prüfe ob `DATABASE_URL` korrekt in der `.env` Datei eingetragen ist.

### „Cannot find module" Fehler
Tippe einmal manuell:
```
cd C:\Users\amasc\website
npm install
```
Dann nochmal `dev.bat` starten.

### Port 3000 ist bereits belegt
Ändere in `.env` den Wert auf einen anderen Port, z.B.:
```
PORT=3001
```
Dann im Browser `http://localhost:3001` öffnen.

---

## Wichtig

- Änderungen an `server.js` → Server startet automatisch neu (nodemon)
- Änderungen an HTML/CSS/JS → Seite im Browser manuell neu laden (F5)
- Die `.env` Datei wird **niemals** zu GitHub gepusht
- Lokale Tests beeinflussen die echte Railway-App **nicht**
