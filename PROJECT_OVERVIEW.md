# PROJECT_OVERVIEW.md – Projektübersicht

*Zuletzt aktualisiert: 2026-05-06*

---

## 1. PROJEKT-ZIEL

Ein browser-basiertes Soziales Spiel mit mehreren Spielmechaniken. Spieler können:
- Beiträge schreiben und abstimmen (Board)
- Ein Glücksrad drehen und Gold gewinnen (Wheel)
- Eine Mini-Fabrikstadt bauen und betreiben (Factory)
- Täglich kostenlose Gold-Belohnungen abholen (Daily)
- Andere Spieler auf einem Leaderboard vergleichen

Das Projekt wirkt wie ein persönliches Hobby-Projekt / Lern-Projekt ohne kommerzielles Ziel. TODO: Bestätigung vom Nutzer, ob das stimmt.

---

## 2. AKTUELLER STAND

### Fertig implementiert
- **Anmeldung / Registrierung** – inklusive Quick-Register mit Zufalls-Account
- **Board** – Beiträge schreiben, liken, disliken, löschen; Karten- und Tabellenansicht mit Sortierung und Filter
- **Leaderboard** – alle Spieler mit Gold, Beiträgen, Likes, Dislikes, Spin-Anzahl und bestem Spin; Sortierung und Filter
- **Wheel of Fortune** – Glücksrad mit 2–8 Feldern, generieren, drehen, Sound, Spin-Verlauf-Tabelle, Spins als Beitrag posten
- **Profil** – Statistiken (Rang, Beiträge, Likes, Dislikes, Gold, Spins), eigene Beiträge löschen
- **Factory (Grundversion)** – 20×20 Gitter, Gebäude per Drag & Drop platzieren, Rezepte starten und Ergebnis einsammeln, Lager für Items und Gebäude
- **Daily** – täglich 100 Gold einsammeln mit Countdown-Timer

### Fehlend / Geplant
- Factory: optimistische Benutzeroberfläche (Aktionen ohne Wartezeit)
- Factory: Gebäude verschieben per Drag & Drop
- Factory: Gebäude anklicken/markieren, Mehrfachauswahl
- Factory: Gebäude-Menü unterhalb des Gitters statt als schwebendes Fenster
- Factory: Shop-Gebäude (5×5) – Goldbarren verkaufen, Holzschubkarren kaufen
- Factory: Holzschubkarren-Mechanik (automatischer Folge-Lauf nach Rezeptende)
- Factory: Ausgabe-Slot fasst bis zu 5 Barren (aktuell immer 1)
- Profil: Verlinkung zur eigenen Fabrik

### Unfertig / Problematisch
- Das Gebäude-Menü öffnet sich mit einer spürbaren Verzögerung (Server-Anfrage vor dem Anzeigen)
- Mobile-Layout wurde bisher nicht getestet oder optimiert
- Kein Localization-System für Spieltexte vorhanden (Texte direkt im Code auf Deutsch/Englisch gemischt)

---

## 3. TECH-STACK

| Bereich | Technologie |
|---|---|
| Server | Node.js mit Express (JavaScript) |
| Datenbank | PostgreSQL (gehostet auf Supabase oder Railway) |
| Frontend | Reines HTML, CSS, JavaScript – kein Framework |
| Authentifizierung | express-session (sitzungsbasiert, kein JWT) |
| Audio | Web Audio API (prozedural, kein externe Dateien) |
| Grafik | HTML5 Canvas (für das Glücksrad) |
| Hosting | TODO: Bestätigung vom Nutzer (vermutlich Railway) |

---

## 4. PROJEKT-STRUKTUR

```
website/
├── index.html             – HTML-Struktur der App (Vite-Einstiegspunkt)
├── style-guide.html       – Komponenten-Bibliothek (nur für Entwickler, /style-guide.html)
├── vite.config.js         – Vite-Konfiguration (Build-System)
├── server.js              – Gesamter Server-Code (API + Datenbanklogik)
├── package.json           – Abhängigkeiten + Build-Scripts
├── CLAUDE.md              – Zusammenarbeitsregeln
├── KOMPONENTEN.md         – Beschreibung aller UI-Bausteine
├── KOMPONENTEN_INVENTAR.md – Wo welche Komponente verwendet wird
├── PROJECT_OVERVIEW.md    – Diese Datei
├── src/
│   ├── main.js            – Gesamter Frontend-Code (~1500 Zeilen, wird noch aufgeteilt)
│   └── style.css          – Gesamte Gestaltung (~900 Zeilen)
└── dist/                  – Automatisch generierter Production-Build (nicht manuell bearbeiten)
```

**Entwicklung starten:** `npm run dev` → öffne http://localhost:5173
**Production-Build:** `npm run build` → erzeugt `dist/`
**Server allein (Production):** `npm start` → Express serviert aus `dist/`

---

## 5. KRITISCHE STELLEN

### Sicherheit
- **Kein CSRF-Schutz**: Sitzungs-Cookies sind anfällig für Cross-Site-Request-Forgery-Angriffe (eine fremde Webseite könnte im Namen des Spielers Aktionen auslösen). Für ein Hobby-Projekt tolerierbar, aber bekannt.
- **Session-Secret im Code**: Das Passwort für Sitzungen (`'geheim-schluessel-hier-aendern'`) ist ein Platzhalter und sollte als Umgebungsvariable gesetzt werden.
- **Fehlende Rate-Limits**: Endpunkte wie `/api/register` oder `/api/wheel/spin` können unbegrenzt oft aufgerufen werden.
- **Gold-Manipulation**: Alle gold-relevanten Berechnungen passieren serverseitig – das ist gut. Aber fehlende Rate-Limits könnten durch schnelle Wiederholung ausgenutzt werden.

### Architektur
- **Alles in einer Datei**: `server.js` (~570 Zeilen), `app.js` (~1500 Zeilen) und `index.html` (~400 Zeilen) wachsen unkontrolliert. Bei weiteren Features wird das schwer wartbar.
- **Keine Datentrennung**: Spiel-Definitionen (Gebäude, Rezepte) stehen doppelt im Code – einmal in `server.js` und einmal in `app.js`. Bei Änderungen muss man immer an zwei Stellen ändern, was zu Fehlern führt.
- **Kein Localization-System**: Deutsche und englische Texte sind durchgemischt. Eine spätere Übersetzung wäre aufwändig.
- **Mobile nicht berücksichtigt**: Das Factory-Gitter (20×20 Felder à 24px = 480px breit) passt nicht auf ein Smartphone. Auch der Rest des Layouts wurde nicht für kleine Bildschirme optimiert.
- **PRNG-Synchronisation ist fragil**: Der Zufallszahlengenerator für das Glücksrad muss Client und Server exakt gleich aufrufen. Jede kleine Änderung an der Logik kann dazu führen, dass das Rad-Ergebnis nicht mehr stimmt. Es gibt keine Tests dafür.

### Skalierung
- Das Projekt ist für wenige Spieler ausgelegt. PostgreSQL-Abfragen sind nicht optimiert (keine Indizes für häufige Abfragen wie `spin_log` nach `username`).

---

## 6. NÄCHSTE EMPFOHLENE SCHRITTE

**Kurzfristig (aktuelle Features fertigstellen):**
1. Factory-Optimierungen umsetzen (optimistische UI, Gebäude verschieben, Shop, Schubkarren)
2. Profil-Link zur Fabrik hinzufügen
3. Session-Secret als Umgebungsvariable absichern

**Mittelfristig (Stabilität verbessern):**
4. Mobile-Layout testen und korrigieren (mindestens 375px)
5. Spiel-Definitionen in eine gemeinsame Datei auslagern, damit Client und Server dieselbe Quelle nutzen
6. `server.js` in logische Bereiche aufteilen (Auth, Posts, Wheel, Factory, Daily)

**Langfristig (falls das Projekt wächst):**
7. Localization-System einführen
8. Datenbank-Indizes ergänzen
9. Rate-Limits für kritische Endpunkte einbauen
