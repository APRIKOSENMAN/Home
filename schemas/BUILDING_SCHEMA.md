# Building-Schema

Beschreibt die Struktur eines Eintrags in `data/buildings.json`.

## Felder

| Feld        | Typ    | Pflicht | Beschreibung                                      |
|-------------|--------|---------|---------------------------------------------------|
| width       | number | ja      | Breite in Gitterfeldern                           |
| height      | number | ja      | Höhe in Gitterfeldern                             |
| color       | string | ja      | CSS-Hintergrundfarbe (Hex-Wert)                   |
| borderColor | string | ja      | CSS-Randfarbe (Hex-Wert)                          |
| icon        | string | ja      | Emoji oder Unicode-Zeichen                        |
| recipe      | string | ja      | ID des zugehörigen Rezepts aus `recipes.json`     |

Der angezeigte Name kommt aus der Locale-Datei:
- Schlüssel: `buildings.<id>.name`

## ID-Konvention

IDs sind generische Platzhalter: `building_001`, `building_002` usw.

## Beispiel

```json
{
  "building_001": {
    "width": 2,
    "height": 3,
    "color": "#b8860b",
    "borderColor": "#8b6914",
    "icon": "🏭",
    "recipe": "recipe_001"
  }
}
```
