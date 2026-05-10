# KOMPONENTEN.md – Komponenten-Bibliothek

*Zuletzt aktualisiert: 2026-05-06*

Hier sind alle wiederkehrenden visuellen Bausteine der Website beschrieben. Diese Datei wird bei jeder Änderung an Komponenten aktualisiert.

---

## KATEGORIE: PANELS (Inhaltsbereiche)

---

### Panel
**Zweck:** Weißer Rahmen-Kasten, der Inhalte gruppiert und vom Hintergrund abhebt.

**Aussehen:** Weißer Hintergrund, dünner grauer Rand, leichter Schatten, leicht abgerundete Ecken.

**Mobile vs. Desktop:** Gleich – nimmt die volle verfügbare Breite ein.

**Wann verwenden:** Überall, wo ein Inhaltsbereich klar abgegrenzt werden soll (z.B. Formular, Tabelle, Info-Block).

---

### Panel-Header
**Zweck:** Dunkle Titelzeile am oberen Rand eines Panels.

**Aussehen:** Dunkelblauer Hintergrund, hellblauer Text in Großbuchstaben, kleiner Abstand.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Als Überschrift direkt am oberen Rand eines Panels (z.B. "STORAGE – GEBÄUDE", "CITY").

---

### Panel-Label
**Zweck:** Kleines, dezentes Etikett über einem Panel, das den Bereich benennt.

**Aussehen:** Sehr kleine graue Großbuchstaben, etwas Abstand nach oben, kein Hintergrund.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Als Abschnittsüberschrift vor einem Panel (z.B. "BEITRÄGE", "SPIN VERLAUF").

---

## KATEGORIE: BUTTONS (Schaltflächen)

---

### Primär-Button
**Zweck:** Hauptaktion auslösen – die wichtigste Schaltfläche in einem Bereich.

**Aussehen:** Blauer Hintergrund, weißer Text in Großbuchstaben, leicht abgerundete Ecken. Wird bei Berührung etwas heller. Bei Deaktivierung grau und ausgegraut.

**Mobile vs. Desktop:** Gleich, aber auf Mobile sollte er mindestens 44px hoch sein für gute Bedienbarkeit. TODO: aktuell uneinheitlich – manche Buttons sind zu klein für Mobile.

**Wann verwenden:** Für die wichtigste Aktion (z.B. "VERÖFFENTLICHEN", "SPIN", "EINSAMMELN").

---

### Sekundär-Button
**Zweck:** Alternative oder weniger wichtige Aktion neben dem Primär-Button.

**Aussehen:** Dunkelgrauer Hintergrund, weißer Text. Sonst identisch mit Primär-Button.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Für Zweit-Aktionen (z.B. "ABBRECHEN", "REGENERATE").

---

### Quick-Register-Button
**Zweck:** Schnell-Registrierung ohne Formular auslösen.

**Aussehen:** Lila Hintergrund, weißer Text mit Blitz-Symbol, volle Breite.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur auf der Anmeldeseite.

---

### Abstimmungs-Button (Vote-Button)
**Zweck:** Einen Beitrag mit Daumen hoch oder Daumen runter bewerten.

**Aussehen:** Heller Hintergrund, grauer Rand und Text, Daumen-Symbol + Zahl. Bei aktivem "Daumen hoch" grün eingefärbt, bei "Daumen runter" rot. Rand passt sich der Farbe an.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur bei Beiträgen auf dem Board und im Profil.

---

### Ansicht-Umschalter (Toggle-Button)
**Zweck:** Zwischen zwei Darstellungsarten umschalten (z.B. Karten / Tabelle).

**Aussehen:** Zwei Buttons nebeneinander, der aktive ist blau ausgefüllt, der inaktive hat nur einen Rand. 

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur auf dem Board zum Wechseln zwischen Karten- und Tabellenansicht.

---

### Währungsanzeige (Currency Display)
**Zweck:** Mehrere Währungen nebeneinander anzeigen, z.B. im Tab-Knopf oder Wallet-Übersicht.

**Aussehen:** Währungs-Icons mit Beträgen nebeneinander, durch kleine Abstände getrennt. Beispiel: `🪙 1000 💎 50 ✨ 0`. Icons sind 16px hoch, Beträge in normaler Schriftgröße.

**Mobile vs. Desktop:** Gleich, aber auf sehr kleinen Bildschirmen können Beträge abgekürzt werden (z.B. "1K" statt "1000").

**Wann verwenden:** Im Tab-Knopf für Finance-Tab, in Wallet-Anzeigen, oder überall wo mehrere Währungen kompakt dargestellt werden sollen.

---

### Icon-Lösch-Button
**Zweck:** Einen eigenen Beitrag löschen.

**Aussehen:** Nur ein Mülleimer-Symbol, kein Hintergrund, grauer Text. Bei Berührung roter Text mit rotem Hintergrund.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur bei eigenen Beiträgen im Profil.

---

### Abmelden-Button
**Zweck:** Aus dem Konto ausloggen.

**Aussehen:** Leicht transparenter dunkler Hintergrund, weißer Text, wirkt wie ein Nav-Link.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur in der aufklappbaren Unterzeile der Kopfzeile.

---

### Deaktivierter Button (Zustand)
**Zweck:** Zeigt an, dass eine Aktion gerade nicht möglich ist.

**Aussehen:** Grauer Hintergrund, ausgegraut, Mauszeiger zeigt "nicht erlaubt". TODO: aktuell uneinheitlich – manche deaktivierten Buttons nutzen `.btn-disabled` (Klasse), andere das HTML-Attribut `disabled`. Sollte vereinheitlicht werden.

**Wann verwenden:** Wenn eine Aktion erst nach einer Bedingung möglich ist (z.B. "Veröffentlichen" ohne Text, "Spin" ohne Guthaben).

---

## KATEGORIE: NAVIGATION

---

### Haupt-Navigations-Link
**Zweck:** Zwischen den Hauptbereichen der App wechseln.

**Aussehen:** Transparenter Hintergrund, weißer Schrift-Text, wird bei Berührung leicht heller. Aktiver Bereich: blauer Hintergrund.

**Mobile vs. Desktop:** TODO: aktuell uneinheitlich – auf kleinen Bildschirmen passen alle Links möglicherweise nicht in eine Zeile.

**Wann verwenden:** Nur in der Kopfzeile für die Hauptbereiche (Board, Leaderboard, Wheel, Factory, Daily).

---

### Benutzername-Badge
**Zweck:** Den eigenen Benutzernamen anzeigen und das Benutzermenü öffnen.

**Aussehen:** Wie ein Nav-Link, aber mit leichtem Rahmen und Großbuchstaben-Name. Wirkt wie eine Schaltfläche.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur einmal oben rechts in der Kopfzeile.

---

### Autoren-Link
**Zweck:** Zum Profil eines Benutzers verlinken.

**Aussehen:** Blauer Text, halbfett, kein Unterstrich. Bei Berührung mit Unterstrich.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Überall, wo ein Benutzername klickbar sein soll (Beiträge, Tabellen, Leaderboard).

---

## KATEGORIE: FORMULARE

---

### Texteingabe mit Zeichenzähler
**Zweck:** Einzeilige Text-Eingabe mit sichtbarer Zeichenbegrenzung.

**Aussehen:** Weißes Eingabefeld mit grauem Rand. Rechts oben steht die Anzahl (z.B. "12/100"). Darunter ein schmaler Fortschrittsbalken, der sich bei mehr Text füllt und bei Annäherung an das Limit orange, dann rot wird.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Bei allen Texteingaben mit Zeichenbegrenzung (Beitragstitel, Benutzername bei Registrierung).

---

### Mehrzeiliges Textfeld mit Zeichenzähler
**Zweck:** Mehrzeilige Texteingabe (z.B. für Beitragstexte) mit sichtbarer Zeichenbegrenzung.

**Aussehen:** Wie die Texteingabe, aber höher und vertikal vergrößerbar. Zeichenzähler steht unten rechts.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Für längere Texte (Beitragstext, Modal-Inhalt).

---

### Lautstärke-Regler
**Zweck:** Die Lautstärke der Spielsounds einstellen.

**Aussehen:** Lautsprecher-Symbol links, daneben ein schmaler horizontaler Schieberegler. Dezent, passt zur Kopfzeile.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur einmal in der Kopfzeile.

---

## KATEGORIE: TABELLEN

---

### Sortierbare Tabelle mit Filter-Kopfzeile
**Zweck:** Viele Datensätze übersichtlich anzeigen, sortierbar und filterbar nach Spalten.

**Aussehen:** Dunkelblaue Kopfzeile mit weißem Text. Pro Spalte: klickbarer Spaltentitel mit kleinem Pfeil-Symbol (zeigt Sortierrichtung an), Lupen-Symbol zum Filtern, rotes X-Symbol zum Zurücksetzen (erscheint nur wenn aktiv).

**Mobile vs. Desktop:** TODO: aktuell nicht mobile-optimiert – Tabellen scrollen horizontal, was auf Smartphones unpraktisch ist.

**Wann verwenden:** Für Leaderboard, Beitragsübersicht (Tabellenansicht), Spin-Verlauf.

---

### Spalten-Filter-Dropdown
**Zweck:** Daten einer Tabellenspalte nach Text oder Zahlenbereich filtern.

**Aussehen:** Kleines weißes Fenster, das über der Tabelle aufklappt. Enthält ein Textfeld und/oder Zahlenbereichs-Felder sowie einen "Filter löschen"-Button.

**Mobile vs. Desktop:** Gleich, öffnet sich immer nach oben.

**Wann verwenden:** Nur für sortierbare Tabellen, wird durch Klick auf das Lupen-Symbol geöffnet.

---

## KATEGORIE: INHALTS-KARTEN

---

### Beitragskarte (Post-Card)
**Zweck:** Einen einzelnen Beitrag mit Titel, Text, Autor, Datum und Abstimmungs-Buttons anzeigen.

**Aussehen:** Weißer Hintergrund mit dünnem Rand. Oben Titel (halbfett) und Metadaten (klein, grau). Darunter der Beitragstext. Unten Abstimmungs-Buttons und bei Berührung eine Liste der abstimmenden Benutzer.

**Mobile vs. Desktop:** Gleich, aber auf Mobile wird der Titel- und Metadaten-Bereich möglicherweise zu eng. TODO: aktuell nicht getestet.

**Wann verwenden:** Auf dem Board und in Profilen für die Beitragsanzeige.

---

### Abstimmer-Chip (Voter-Chip)
**Zweck:** Zeigt an, wer für oder gegen einen Beitrag abgestimmt hat.

**Aussehen:** Kleine Pille (abgerundetes Rechteck), grüner Hintergrund für Daumen hoch, roter für Daumen runter. Kein Unterstrich, aber klickbar zum Profil.

**Mobile vs. Desktop:** Gleich, bricht in neue Zeile um bei Platzmangel.

**Wann verwenden:** Nur unterhalb von Beitragskarten, erscheint beim Berühren des Abstimmungs-Bereichs.

---

## KATEGORIE: RÜCKMELDUNGEN

---

### Fehlertext
**Zweck:** Kurze Fehlermeldung unter einem Formularfeld oder einer Aktion anzeigen.

**Aussehen:** Kleiner roter Text, mindestens eine Zeile Platz auch wenn leer (kein Springen des Layouts).

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Unter Formularen, Buttons und Aktionen bei Fehlern.

---

### Erfolgs-/Fehler-Banner
**Zweck:** Rückmeldung nach einer abgeschlossenen Aktion (z.B. Beitrag veröffentlicht).

**Aussehen:** Grüner Hintergrund (Erfolg) oder roter Hintergrund (Fehler), passend gefärbter Text, leicht abgerundete Ecken. Verschwindet nach kurzer Zeit automatisch.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nach dem Absenden von Formularen (z.B. "Beitrag veröffentlicht").

---

## KATEGORIE: PROFIL

---

### Profil-Kopfzeile
**Zweck:** Zeigt Avatar, Benutzernamen, Beitrittsdatum und Statistiken eines Benutzers an.

**Aussehen:** Links dunkles Feld mit rundem Avatar-Kreis (erster Buchstabe), Name und Datum. Rechts helle Statistik-Zellen nebeneinander.

**Mobile vs. Desktop:** TODO: aktuell nicht mobile-optimiert – die Statistiken könnten in zwei Zeilen umbrechen.

**Wann verwenden:** Nur auf der Profilseite.

---

### Statistik-Zelle
**Zweck:** Einen einzelnen Zahlenwert mit Bezeichnung prominent anzeigen.

**Aussehen:** Zentrierter großer Zahlenwert (je nach Typ: normal, grün, rot, goldfarben, blau), darunter kleine Beschriftung in Großbuchstaben. Dünner rechter Rand als Trenner.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur in der Profil-Kopfzeile für Rangs, Beiträge, Likes, Gold, Spins.

---

## KATEGORIE: FABRIK

---

### Lager-Gebäude (draggbar)
**Zweck:** Ein Gebäude aus dem Lager ins Stadtgitter ziehen.

**Aussehen:** Zeile mit großem Icon links, Name und Größenangabe in der Mitte, Anzahl rechts. Greif-Cursor. Bei Berührung leicht blauer Hintergrund.

**Mobile vs. Desktop:** TODO: Drag & Drop funktioniert auf Touchscreens grundsätzlich nicht – hier fehlt eine Mobile-Lösung komplett.

**Wann verwenden:** Nur in der Fabrik-Seitenleiste unter "STORAGE – GEBÄUDE".

---

### Lager-Item-Zeile
**Zweck:** Zeigt ein Item im Lager mit Icon, Name und Menge an.

**Aussehen:** Zeile mit Item-Name links und Menge rechts, dünner unterer Rand als Trenner.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur in der Fabrik-Seitenleiste unter "STORAGE – ITEMS".

---

### Platziertes Gebäude (im Stadtgitter)
**Zweck:** Ein im Stadtgitter platzietes Gebäude darstellen.

**Aussehen:** Absolut positioniertes farbiges Rechteck auf dem Gitter. Enthält ein großes Icon. In der Ecke oben rechts ein Status-Punkt (gelb blinkend = läuft, grün = fertig). Bei Berührung heller.

**Mobile vs. Desktop:** Gleich, aber das gesamte Gitter ist 480px breit und scrollt horizontal auf kleinen Bildschirmen.

**Wann verwenden:** Nur im Stadtgitter der Fabrik.

---

### Status-Punkt (Job-Dot)
**Zweck:** Den Produktionsstatus eines Gebäudes auf einen Blick zeigen.

**Aussehen:** Kleiner runder Punkt oben rechts am Gebäude. Gelb und blinkend = Rezept läuft. Grün und still = Rezept fertig, Ergebnis warten.

**Mobile vs. Desktop:** Gleich.

**Wann verwenden:** Nur bei platzierten Gebäuden in der Fabrik.

---

### Rezept-Anzeige
**Zweck:** Den Ablauf eines Produktionsrezepts zeigen (Eingabe → Zeit → Ausgabe).

**Aussehen:** Drei Bereiche nebeneinander: Eingabe-Box, Pfeil-Text ("→ 10 min →"), Ausgabe-Box. Eingabe-Box wird grün wenn bezahlt, Ausgabe-Box goldfarben wenn bereit.

**Mobile vs. Desktop:** TODO: auf schmalen Bildschirmen bricht das Layout möglicherweise.

**Wann verwenden:** Nur im Gebäude-Menü der Fabrik.

---

## KATEGORIE: HANDEL

---

### Trade Table
**Zweck:** Zwei nebeneinander liegende Tabellen in einem gemeinsamen Panel, die zusammen wie eine einzige Trade-Tabelle wirken. Ermöglicht unabhängiges Synchronisieren von Inventar-Daten und Handelsdaten.

**Komponenten:**
- `#trade-inventory-table` – linke Tabelle: Icon, Item-Name, eigener Bestand
- `#trade-prices-table` – rechte Tabelle: Verkaufen-Button, Kaufen-Button, Händler-Lager + Indikator

**Aussehen:** Dunkelblaues Header-Band über beide Tabellen. Trenner zwischen den Tabellen ist eine dünne Linie (`border-left`). Eigene Menge in Primärfarbe (Monospace). Deaktivierte Buttons sind ausgegraut. Zeilenhöhe ist auf 52px fixiert damit beide Tabellen zeilengenau ausgerichtet bleiben.

**Update-Funktionen (JS):**
- `updateInventoryRow(itemType)` – aktualisiert nur Menge + Durchschnittspreis (linke Seite)
- `updateTradeRow(itemType)` – aktualisiert Buttons, Stock, Indikator (rechte Seite)
- `updateRow(itemType)` – ruft beide auf (Kurzform für vollständiges Update)

**Mobile vs. Desktop:** Horizontales Scrollen über das Panel-Wrapper (`overflow-x:auto`).

**HTML-Muster:**
```html
<div class="panel trade-tables-panel">
  <div class="trade-tables-wrapper">
    <table class="trade-table" id="trade-inventory-table">
      <thead><tr><th></th><th>ITEM</th><th>BESITZ</th></tr></thead>
      <tbody>
        <tr>
          <td class="trade-icon">🥇</td>
          <td>Gold Bar</td>
          <td class="trade-amount"><span id="trade-owned-gold_bar">5</span></td>
        </tr>
      </tbody>
    </table>
    <table class="trade-table" id="trade-prices-table">
      <thead><tr><th>VERKAUFEN</th><th>KAUFEN</th><th class="stock-th">LAGER</th></tr></thead>
      <tbody>
        <tr id="trade-row-gold_bar">
          <td><button class="trade-sell-btn" data-item="gold_bar" data-dir="sell">95 💰</button></td>
          <td><button class="trade-buy-btn"  data-item="gold_bar" data-dir="buy">105 💰</button></td>
          <td class="stock-th trade-amount"><div id="trade-stock-gold_bar">42</div></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

---

## KATEGORIE: SPEZIAL

---

### Modal-Dialog
**Zweck:** Ein überlagerndes Fenster für wichtige Aktionen, das den Rest der Seite abdunkelt.

**Aussehen:** Halbtransparenter dunkler Hintergrund über der ganzen Seite. In der Mitte ein weißes Fenster mit Panel-Header, Inhalt und Button-Zeile. Schließt sich beim Klick auf den Hintergrund oder mit Escape-Taste.

**Mobile vs. Desktop:** Gleich, mit seitlichem Abstand.

**Wann verwenden:** Für Aktionen die Bestätigung oder zusätzliche Eingabe erfordern (z.B. Spin-Ergebnis als Beitrag posten).

---

### Vorschau-Tooltip
**Zweck:** Bei Berührung einer Tabellenzeile eine visuelle Vorschau einblenden.

**Aussehen:** Kleines dunkles Fenster das neben dem Cursor erscheint, enthält ein Mini-Bild. Verschwindet wenn der Cursor wegbewegt wird.

**Mobile vs. Desktop:** Auf Mobile gibt es kein "Berühren mit Maus" – TODO: Tooltip ist auf Mobile nicht nutzbar, braucht alternative Lösung.

**Wann verwenden:** Nur in der Spin-Verlauf-Tabelle beim Berühren des Seed-Wertes.
