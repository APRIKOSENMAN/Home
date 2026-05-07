# Item-Schema

Beschreibt die Struktur eines Eintrags in `data/items.json`.

## Felder

| Feld       | Typ     | Pflicht | Beschreibung                                         |
|------------|---------|---------|------------------------------------------------------|
| icon       | string  | ja      | Emoji oder Unicode-Zeichen                           |
| buy_price  | integer | ja      | Preis, den der Spieler beim Händler zahlt (in Gold)  |
| sell_price | integer | ja      | Preis, den der Spieler vom Händler bekommt (in Gold) |
| tradable   | boolean | ja      | Ob das Item im Handel verfügbar ist                  |

Der angezeigte Name kommt **nicht** aus dieser Datei, sondern aus der Locale-Datei:
- Englisch: `data/locales/en.json` → Schlüssel `items.<id>.name`
- Deutsch:  `data/locales/de.json` → Schlüssel `items.<id>.name`

## Preislogik

- `buy_price` > `sell_price` (der Händler verdient immer an der Differenz)
- Beide Preise sind in der Spielwährung Gold angegeben
- Preise können pro Item frei festgelegt werden

## ID-Konvention

IDs sind generische Platzhalter in der Form `material_001`, `material_002` usw.
Keine semantischen Namen wie `gold_bar` — das erlaubt spätere Umbenennung ohne DB-Migration.

## Beispiel

```json
{
  "material_001": {
    "icon": "🥇",
    "buy_price": 100,
    "sell_price": 50,
    "tradable": true
  }
}
```
