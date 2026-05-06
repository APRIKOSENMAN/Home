# CLAUDE.md – Regeln für unsere Zusammenarbeit

## KOMMUNIKATION
- Antworte immer auf Deutsch
- Keine Code-Erklärungen voraussetzen – alles in normaler Sprache erklären
- Fachbegriffe beim ersten Vorkommen kurz erläutern
- Maximal 3 Rückfragen vor einer Aufgabe, danach loslegen

## CODE-STANDARDS
- Variablennamen, Funktionsnamen, Dateinamen: Englisch
- Datenbank-Tabellen und Spalten: Englisch
- Code-Kommentare: Englisch
- Dokumentations-Dateien (.md): Deutsch
- Spieltexte (für Spieler sichtbar): über Localization-System, Standardsprache Englisch

## DESIGN-PRINZIPIEN
- Einfachste Lösung bevorzugen, die das Problem löst
- Kein Over-Engineering, keine unnötigen Abstraktionen
- Optionale Features erst nachfragen, bevor sie gebaut werden
- Mobile-First: Layouts müssen auf 375px Breite ohne horizontales Scrollen funktionieren
- Konsistenz vor Kreativität: Wiederkehrende Elemente sollen gleich aussehen

## ARCHITEKTUR
- Spiel-Logik und Anzeige-Logik klar trennen
- Spiel-Inhalte (Items, Gebäude, Rezepte) als Daten, nicht hart im Code (data-driven design)
- Sicherheitsrelevante Aktionen serverseitig validieren, nie nur im Browser
- Spielstand-Versionen mitdenken – alte Spielstände dürfen nicht durch Updates kaputtgehen

## DOKUMENTATION PFLEGEN
- Bei Änderungen an der Architektur: PROJECT_OVERVIEW.md aktualisieren
- Bei jeder Änderung an einer Komponente (Aussehen, Name, Verhalten): KOMPONENTEN.md und KOMPONENTEN_INVENTAR.md mitaktualisieren
- Die Style-Guide-Seite (public/style-guide.html) nutzt dieselbe CSS-Datei wie die App – CSS-Änderungen sind dort automatisch sichtbar. Nur wenn neue Komponenten hinzukommen muss der HTML-Teil manuell ergänzt werden.
- Bei größeren Code-Änderungen: kurze Zusammenfassung in einfacher Sprache, was passiert ist
