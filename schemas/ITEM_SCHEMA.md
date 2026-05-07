# Item-Schema

Beschreibt die Struktur eines Eintrags in `data/items.json`.

## Felder

| Feld | Typ   | Pflicht | Beschreibung                        |
|------|-------|---------|-------------------------------------|
| icon | string | ja     | Emoji oder Unicode-Zeichen          |

Der angezeigte Name kommt **nicht** aus dieser Datei, sondern aus der Locale-Datei:
- Englisch: `data/locales/en.json` → Schlüssel `items.<id>.name`
- Deutsch:  `data/locales/de.json` → Schlüssel `items.<id>.name`

## ID-Konvention

IDs sind generische Platzhalter in der Form `material_001`, `material_002` usw.
Keine semantischen Namen wie `gold_bar` — das erlaubt spätere Umbenennung ohne DB-Migration.

## Beispiel

```json
{
  "material_001": {
    "icon": "🥇"
  },
  "material_002": {
    "icon": "🪵"
  }
}
```
