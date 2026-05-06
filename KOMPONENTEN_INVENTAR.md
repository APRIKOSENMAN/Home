# KOMPONENTEN_INVENTAR.md – Verwendungsorte

*Zuletzt aktualisiert: 2026-05-06*

Diese Tabelle zeigt, welche Komponente wo auf der Website eingesetzt wird. Jede Komponente verweist auf die ausführliche Beschreibung in [KOMPONENTEN.md](KOMPONENTEN.md).

---

## PANELS

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Panel | Beitrag verfassen | Board | Enthält das Schreib-Formular |
| Panel | Beiträge (Tabelle) | Board | Nur sichtbar im Tabellen-Modus |
| Panel | Leaderboard | Leaderboard | Enthält die gesamte Ranglisten-Tabelle |
| Panel | Wheel of Fortune | Wheel | Enthält Rad und Steuerung |
| Panel | Profil-Kopfzeile | Profil | Enthält Avatar + Statistiken |
| Panel | Gebäude-Lager | Factory | Seitenleiste links |
| Panel | Item-Lager | Factory | Seitenleiste links, unter Gebäude-Lager |
| Panel | Stadtgitter | Factory | Hauptbereich |
| Panel | Gebäude-Menü | Factory | Aktuell: schwebendes Panel unten rechts |
| Panel | Daily Reward | Daily | Zentrierter Bereich |
| Panel | Style Guide | /style-guide.html | Pro Komponenten-Kategorie ein Panel |
| Panel-Header | "NEUEN BEITRAG VERFASSEN" | Board | |
| Panel-Header | "ALLE BEITRÄGE" (Tabelle) | Board | Im Tabellen-Panel |
| Panel-Header | "WHEEL OF FORTUNE" | Wheel | |
| Panel-Header | "STORAGE – GEBÄUDE" | Factory | |
| Panel-Header | "STORAGE – ITEMS" | Factory | |
| Panel-Header | "CITY" | Factory | |
| Panel-Header | "BEITRAG VERFASSEN" | Modal (Wheel → Post) | Im Modal-Dialog |
| Panel-Header | "DAILY REWARD" | Daily | |
| Panel-Header | Kategoriename | Style Guide | Pro Abschnitt |
| Panel-Label | "ALLE BEITRÄGE" | Board | Über der Beitrags-Liste im Karten-Modus |
| Panel-Label | "BEITRÄGE" | Profil | Über den eigenen Beiträgen |
| Panel-Label | "SPIN VERLAUF" | Wheel | Über der Spin-Log-Tabelle |

---

## BUTTONS

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Primär-Button | "EINLOGGEN" | Anmeldung | |
| Primär-Button | "REGISTRIEREN & EINLOGGEN" | Registrierung | |
| Primär-Button | "VERÖFFENTLICHEN" | Board | Deaktiviert bis Formular ausgefüllt |
| Primär-Button | "▶ GENERATE" | Wheel | Wird nach Spin zu "▶ SPIN" |
| Primär-Button | "▶ SPIN" | Wheel | |
| Primär-Button | "▶ STARTEN (−10 Gold)" | Factory – Gebäude-Menü | |
| Primär-Button | "📦 EINSAMMELN" | Factory – Gebäude-Menü | |
| Primär-Button | "🎁 100 GOLD EINSAMMELN" | Daily | Deaktiviert bis claimbar |
| Primär-Button | "VERÖFFENTLICHEN" | Modal (Spin → Post) | |
| Sekundär-Button | "REGISTRIEREN" | Registrierung | Neben Primär-Button |
| Sekundär-Button | "⟳ REGENERATE" | Wheel | Neben SPIN-Button |
| Sekundär-Button | "ABBRECHEN" | Modal | Schließt Modal |
| Quick-Register-Button | "⚡ QUICK REGISTER" | Registrierung | |
| Abstimmungs-Button | "👍 N" | Board, Profil | N = Anzahl Likes |
| Abstimmungs-Button | "👎 N" | Board, Profil | N = Anzahl Dislikes |
| Ansicht-Umschalter | "❙❙ KARTEN / ☰ TABELLE" | Board | |
| Icon-Lösch-Button | Mülleimer-Symbol | Profil | Nur bei eigenen Beiträgen |
| Abmelden-Button | "ABMELDEN" | Unterzeile (nach Klick auf Username) | |
| Deaktivierter Button | "⏳ NOCH NICHT VERFÜGBAR" | Daily | Wenn Cooldown aktiv |
| Deaktivierter Button | "⏳ N min Ns" | Factory – Gebäude-Menü | Wenn Rezept läuft |
| Deaktivierter Button | "✓ Gepostet" | Wheel – Spin-Verlauf | Wenn Spin bereits gepostet |

---

## NAVIGATION

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Haupt-Nav-Link | "BOARD" | Kopfzeile | |
| Haupt-Nav-Link | "LEADERBOARD" | Kopfzeile | |
| Haupt-Nav-Link | "WHEEL" | Kopfzeile | |
| Haupt-Nav-Link | "FACTORY" | Kopfzeile | |
| Haupt-Nav-Link | "DAILY" | Kopfzeile | |
| Benutzername-Badge | Eigener Username | Kopfzeile rechts | Öffnet Unterzeile bei Klick |
| Autoren-Link | Beitrags-Autor | Board (Karte + Tabelle), Profil | |
| Autoren-Link | Username | Leaderboard | |
| Autoren-Link | Abstimmer-Name | Board (Voter-Chip) | Innerhalb des Chips |

---

## FORMULARE

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Texteingabe + Zeichenzähler | Benutzername (max 20) | Registrierung | |
| Texteingabe + Zeichenzähler | Beitragstitel (max 100) | Board – Schreib-Formular | |
| Texteingabe + Zeichenzähler | Beitragstitel (max 100) | Modal (Spin → Post) | |
| Texteingabe + Zeichenzähler | Username suchen | Kopfzeile – Unterzeile | Kein Zeichenzähler hier |
| Mehrzeiliges Textfeld + Zeichenzähler | Beitragstext (max 1000) | Board – Schreib-Formular | |
| Mehrzeiliges Textfeld + Zeichenzähler | Beitragstext (max 1000) | Modal (Spin → Post) | |
| Lautstärke-Regler | Spielsound-Lautstärke | Kopfzeile rechts | |

---

## TABELLEN

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Sortierbare Tabelle | Leaderboard (8 Spalten) | Leaderboard | Rang, Username, Beiträge, Likes, Dislikes, Gold, Spins, Bester Spin |
| Sortierbare Tabelle | Beitrags-Liste (5 Spalten) | Board – Tabellenansicht | Titel, Autor, Datum, Likes, Dislikes |
| Sortierbare Tabelle | Spin-Verlauf (4 Spalten) | Wheel | Datum, Seed, Reward, Post-Button |
| Spalten-Filter-Dropdown | (gemeinsam für alle Tabellen) | Leaderboard, Board (Tabelle), Wheel | Eine einzige Instanz, für alle Tabellen wiederverwendet |

---

## INHALTS-KARTEN

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Beitragskarte | Normaler Beitrag | Board – Kartenansicht | |
| Beitragskarte | Eigener Beitrag | Profil | Mit Lösch-Button |
| Beitragskarte | Fremder Beitrag | Profil (anderer User) | Ohne Lösch-Button |
| Abstimmer-Chip | Daumen-hoch-Chip | Board, Profil | Grün, erscheint bei Hover auf Abstimmungsbereich |
| Abstimmer-Chip | Daumen-runter-Chip | Board, Profil | Rot, erscheint bei Hover auf Abstimmungsbereich |

---

## RÜCKMELDUNGEN

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Fehlertext | Anmelde-Fehler | Anmeldung | |
| Fehlertext | Registrierungs-Fehler | Registrierung | |
| Fehlertext | Wheel-Fehler | Wheel | |
| Fehlertext | Gebäude-Menü-Fehler | Factory | |
| Fehlertext | Modal-Fehler | Modal (Spin → Post) | |
| Fehlertext | Daily-Fehler | Daily | |
| Erfolgs-/Fehler-Banner | "Beitrag veröffentlicht" / Fehler | Board | Verschwindet nach 3 Sekunden |

---

## PROFIL

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Profil-Kopfzeile | Eigenes Profil | Profil | |
| Profil-Kopfzeile | Fremdes Profil | Profil (anderer User) | Gleiche Darstellung |
| Statistik-Zelle | # Rang | Profil-Kopfzeile | Blau |
| Statistik-Zelle | Beiträge | Profil-Kopfzeile | |
| Statistik-Zelle | Likes | Profil-Kopfzeile | Grün |
| Statistik-Zelle | Dislikes | Profil-Kopfzeile | Rot |
| Statistik-Zelle | Gold | Profil-Kopfzeile | Goldfarben |
| Statistik-Zelle | Spins | Profil-Kopfzeile | |
| Statistik-Zelle | Bester Spin | Profil-Kopfzeile | Goldfarben |

---

## FABRIK

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Lager-Gebäude | Goldbarrengießerei | Factory – Gebäude-Lager | Draggable |
| Lager-Item-Zeile | Goldbarren | Factory – Item-Lager | |
| Platziertes Gebäude | Goldbarrengießerei | Factory – Stadtgitter | |
| Status-Punkt | Läuft (gelb) | Factory – Stadtgitter | Animiert blinkend |
| Status-Punkt | Fertig (grün) | Factory – Stadtgitter | |
| Rezept-Anzeige | Goldbarren-Rezept (idle) | Factory – Gebäude-Menü | Mit Start-Button |
| Rezept-Anzeige | Goldbarren-Rezept (läuft) | Factory – Gebäude-Menü | Mit Fortschrittsbalken |
| Rezept-Anzeige | Goldbarren-Rezept (fertig) | Factory – Gebäude-Menü | Mit Einsammeln-Button |

---

## SPEZIAL

| Komponenten-Typ | Inhaltsversion | Verwendungsorte | Notizen |
|---|---|---|---|
| Modal-Dialog | Spin als Beitrag posten | Wheel – Spin-Verlauf | Enthält Mini-Wheel-Canvas + Formular |
| Vorschau-Tooltip | Wheel-Vorschau (Hover auf Seed) | Wheel – Spin-Verlauf | Canvas mit Mini-Rad |
