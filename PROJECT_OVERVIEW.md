# PROJECT_OVERVIEW.md – Projektübersicht

*Zuletzt aktualisiert: 2026-05-07*

---

## 1. PROJEKT-ZIEL

Ein browser-basiertes Soziales Spiel mit mehreren Spielmechaniken. Spieler können:
- Beiträge schreiben und abstimmen (Board)
- Ein Glücksrad drehen und Gold gewinnen (Wheel)
- Eine Mini-Fabrikstadt bauen und betreiben (Factory)
- Items beim Händler kaufen und verkaufen (Handel)
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
- **Handel** – Items beim Händler kaufen und verkaufen; Gold und Inventar werden nach jedem Trade live aktualisiert
- **Localization** – `data/locales/en.json` + `de.json`; alle Spieltexte per `t(key)` aus `src/i18n.js`
- **Data-driven Infrastruktur** – Items, Gebäude, Rezepte als JSON (`data/items.json`, `buildings.json`, `recipes.json`); Server und Client nutzen dieselbe Quelle
- **Frontend-Modulsplit** – `src/main.js` ist reiner Koordinator; Logik in `board.js`, `wheel.js`, `factory.js`, `daily.js`, `leaderboard.js`, `profile.js`, `trade.js`, `i18n.js`, `game-data.js`, `state.js`, `table-filter.js`, `utils.js`, `api.js`

### Fehlend / Geplant
- Factory: optimistische Benutzeroberfläche (Aktionen ohne Wartezeit)
- Factory: Gebäude verschieben per Drag & Drop
- Factory: Gebäude-Menü unterhalb des Gitters statt als schwebendes Fenster
- Handel: mehrere Händler / Händler-Auswahl
- Handel: Kauf/Verkauf in beliebiger Menge (aktuell immer 1)
- Profil: Verlinkung zur eigenen Fabrik

### Unfertig / Problematisch
- Das Gebäude-Menü öffnet sich mit einer spürbaren Verzögerung (Server-Anfrage vor dem Anzeigen)
- Mobile-Layout wurde bisher nicht getestet oder optimiert

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
├── index.html             – HTML-Struktur der App
├── server.js              – Gesamter Server-Code (API + Datenbanklogik)
├── package.json           – Abhängigkeiten + Scripts
├── CLAUDE.md              – Zusammenarbeitsregeln
├── KOMPONENTEN.md         – Beschreibung aller UI-Bausteine
├── KOMPONENTEN_INVENTAR.md – Wo welche Komponente verwendet wird
├── PROJECT_OVERVIEW.md    – Diese Datei
├── schemas/               – JSON-Schema-Dokumentation (ITEM_SCHEMA.md usw.)
├── data/
│   ├── items.json         – Item-Definitionen (Preise, Icon, tradable)
│   ├── buildings.json     – Gebäude-Definitionen (Größe, Farbe, Rezept-ID)
│   ├── recipes.json       – Rezept-Definitionen (Inputs, Outputs, Dauer)
│   └── locales/
│       ├── en.json        – Englische Spieltexte
│       └── de.json        – Deutsche Spieltexte
└── src/
    ├── main.js            – Koordinator: Router, Auth, Event-Listener, window-Exposure
    ├── style.css          – Gesamte Gestaltung (~960 Zeilen)
    ├── api.js             – fetch-Wrapper
    ├── state.js           – Globaler currentUser-Zustand
    ├── utils.js           – Zeichenzähler, Hilfsfunktionen
    ├── i18n.js            – Localization (loadLocale, t)
    ├── game-data.js       – Lädt items/buildings/recipes JSON (gecacht)
    ├── table-filter.js    – Tabellen-Filter/Sortier-Logik (registerRenderer)
    ├── board.js           – Board-Logik
    ├── leaderboard.js     – Leaderboard-Logik
    ├── wheel.js           – Wheel-Logik + Audio
    ├── factory.js         – Factory-Logik
    ├── daily.js           – Daily-Reward-Logik
    ├── profile.js         – Profil-Logik
    └── trade.js           – Handel-Logik (loadTrade, tradeBuy, tradeSell)
```

**Entwicklung starten:** `npm run dev` → öffne http://localhost:5173
**Production-Build (lokal):** `npm run build:local` → erzeugt `dist/`
**Server (Production):** `npm start` → Express serviert statische Dateien direkt aus Projektverzeichnis

---

## 5. KRITISCHE STELLEN

### Sicherheit
- **Kein CSRF-Schutz**: Sitzungs-Cookies sind anfällig für Cross-Site-Request-Forgery-Angriffe (eine fremde Webseite könnte im Namen des Spielers Aktionen auslösen). Für ein Hobby-Projekt tolerierbar, aber bekannt.
- **Session-Secret im Code**: Das Passwort für Sitzungen (`'geheim-schluessel-hier-aendern'`) ist ein Platzhalter und sollte als Umgebungsvariable gesetzt werden.
- **Fehlende Rate-Limits**: Endpunkte wie `/api/register` oder `/api/wheel/spin` können unbegrenzt oft aufgerufen werden.
- **Gold-Manipulation**: Alle gold-relevanten Berechnungen passieren serverseitig – das ist gut. Aber fehlende Rate-Limits könnten durch schnelle Wiederholung ausgenutzt werden.

### Architektur
- **server.js wächst**: Alle API-Endpunkte (Auth, Board, Wheel, Factory, Daily, Trade) stehen in einer Datei (~800 Zeilen). Bei weiteren Features wird das schwer wartbar.
- **Mobile nicht berücksichtigt**: Das Factory-Gitter (20×20 Felder à 24px = 480px breit) passt nicht auf ein Smartphone. Auch der Rest des Layouts wurde nicht für kleine Bildschirme optimiert.
- **PRNG-Synchronisation ist fragil**: Der Zufallszahlengenerator für das Glücksrad muss Client und Server exakt gleich aufrufen. Jede kleine Änderung an der Logik kann dazu führen, dass das Rad-Ergebnis nicht mehr stimmt. Es gibt keine Tests dafür.

### Skalierung
- Das Projekt ist für wenige Spieler ausgelegt. PostgreSQL-Abfragen sind nicht optimiert (keine Indizes für häufige Abfragen wie `spin_log` nach `username`).

---

## 6. NÄCHSTE EMPFOHLENE SCHRITTE

**Kurzfristig (aktuelle Features fertigstellen):**
1. Factory-Optimierungen umsetzen (optimistische UI, Gebäude verschieben)
2. Handel: Kauf/Verkauf in beliebiger Menge
3. Session-Secret als Umgebungsvariable absichern

**Mittelfristig (Stabilität verbessern):**
4. Mobile-Layout testen und korrigieren (mindestens 375px)
5. `server.js` in logische Bereiche aufteilen (Auth, Posts, Wheel, Factory, Daily, Trade)

**Langfristig (falls das Projekt wächst):**
6. Datenbank-Indizes ergänzen
7. Rate-Limits für kritische Endpunkte einbauen
