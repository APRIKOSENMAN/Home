# push.md – Anleitung: Änderungen manuell auf den Server laden

Diese Anleitung gilt wenn du Dateien direkt bearbeitet hast und die
Änderungen auf Railway (die echte Website) übertragen möchtest.

---

## Schritt 1 – Terminal öffnen

1. Drücke die Tasten **Windows + R**
2. Tippe `powershell` ein und drücke **Enter**
3. Ein schwarzes oder blaues Fenster öffnet sich – das ist das Terminal

---

## Schritt 2 – In den richtigen Ordner wechseln

Tippe diesen Befehl ins Terminal und drücke **Enter**:

```
cd C:\Users\amasc\website
```

Du bist jetzt im richtigen Projektordner.

---

## Schritt 3 – Prüfen was geändert wurde

```
git status
```

Das zeigt dir eine Liste der Dateien die du verändert hast.
Dateien unter "Changes not staged" oder "Untracked files" sind noch nicht gespeichert.

---

## Schritt 4 – Alle Änderungen vormerken

```
git add -A
```

Das markiert alle geänderten Dateien für den nächsten Speicherpunkt.

Wenn du nur eine bestimmte Datei hinzufügen willst (z.B. nur `data/items.json`):

```
git add data/items.json
```

---

## Schritt 5 – Einen Speicherpunkt anlegen (Commit)

```
git commit -m "kurze Beschreibung was du gemacht hast"
```

Beispiel:

```
git commit -m "neues Item hinzugefuegt"
```

Der Text in den Anführungszeichen ist nur eine Notiz für dich –
er erscheint in der Versionshistorie.

---

## Schritt 6 – Auf GitHub hochladen (Push)

```
git push origin main
```

Danach lädt Railway die Änderungen automatisch und startet die Website neu.
Das dauert ca. 1–3 Minuten.

---

## Alles auf einmal (Kurzversion)

Wenn du schnell machen willst und sicher bist dass alles stimmt:

```
cd C:\Users\amasc\website
git add -A
git commit -m "meine Aenderung"
git push origin main
```

---

## Was tun wenn etwas schief geht?

### „nothing to commit"
Es gibt keine Änderungen. Du musst zuerst eine Datei bearbeiten und speichern.

### „rejected" beim Push
Jemand anderes hat zuerst gepusht. Hol dir die neueste Version:
```
git pull origin main
```
Dann erneut:
```
git push origin main
```

### „not a git repository"
Du bist im falschen Ordner. Führe nochmal Schritt 2 aus.

### Du weißt nicht mehr was du geändert hast
```
git diff
```
Zeigt dir Zeile für Zeile was sich verändert hat (mit + für neu, - für entfernt).

---

## Wichtig

- **Niemals** `git push --force` eingeben – das kann Daten überschreiben
- Wenn du unsicher bist: Claude fragen bevor du etwas tust
- Railway-Logs zum Überprüfen: im Railway-Dashboard unter "Deployments"
