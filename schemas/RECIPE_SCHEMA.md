# Rezept-Schema

Beschreibt die Struktur eines Eintrags in `data/recipes.json`.

## Felder

| Feld     | Typ    | Pflicht | Beschreibung                                           |
|----------|--------|---------|--------------------------------------------------------|
| building | string | ja      | ID des Gebäudes, das dieses Rezept ausführt            |
| inputs   | array  | ja      | Liste der Eingaben (siehe unten)                       |
| outputs  | array  | ja      | Liste der Ausgaben (siehe unten)                       |
| duration | string | ja      | Dauer als lesbare Zeitangabe (siehe Formate unten)     |

### Input-Objekt

| Feld | Typ    | Beschreibung                                                        |
|------|--------|---------------------------------------------------------------------|
| type | string | `"gold"` für Spielerwährung, oder eine Item-ID aus `items.json`     |
| qty  | number | Menge                                                               |

### Output-Objekt

| Feld | Typ    | Beschreibung                              |
|------|--------|-------------------------------------------|
| item | string | Item-ID aus `items.json`                  |
| qty  | number | Menge                                     |

## Duration-Format

| Schreibweise | Bedeutung    |
|--------------|--------------|
| `"30s"`      | 30 Sekunden  |
| `"10m"`      | 10 Minuten   |
| `"2h"`       | 2 Stunden    |
| `600000`     | direkt in ms (Ausnahme, lieber String verwenden) |

## ID-Konvention

IDs sind generische Platzhalter: `recipe_001`, `recipe_002` usw.

## Hinweise

- Aktuell unterstützt jedes Gebäude genau ein Rezept.
- Mehrere Inputs und Outputs sind im Format vorgesehen, aber noch nicht vollständig implementiert.

## Beispiel

```json
{
  "recipe_001": {
    "building": "building_001",
    "inputs":  [{ "type": "gold", "qty": 10 }],
    "outputs": [{ "item": "material_001", "qty": 1 }],
    "duration": "10m"
  }
}
```
