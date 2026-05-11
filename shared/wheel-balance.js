// Wheel balance config — single ESM source of truth (server + client).
//
// Jackpot-Runden: reward = Multiplikator (z.B. 2.5 → Produkt × 2.5)
// Auszahlung bei ENDE: Math.round(spin_cost × Produkt aller Multiplikatoren)
// Probs pro Runde müssen sich zu 1.0 summieren; Rest fällt auf ENDE zurück.
//
// Lineare Reward-Formel (abgeleitet aus Runden 1 & 2):
//   Pos 1: 1.1 + (n-1) × 0.1
//   Pos 2: 1.4 + (n-1) × 0.2
//   Pos 3: 1.7 + (n-1) × 0.4
//   Pos 4: 2.0 + (n-1) × 1.0

const WHEEL_BALANCE = {
  // Kosten pro Spin und pro Generate (in Gold)
  spin_cost: 5,

  jackpot: {
    prob:  0.5,      // fixes 5%-Kuchenstück, immer vorhanden
    color: '#e3f307', // client-only

    // Jackpot-Wheel: Runden bis "ENDE" gewürfelt wird.
    // Jede Runde hat genau 5 Felder (gleich groß visuell, prob steuert Auswahl).
    // Nach der letzten Runde wird die letzte Runde wiederholt.
    // Felder: { reward, color, prob }  — ENDE: { end: true, color, prob }
    rounds: [
      { fields: [                                    // n=1
        { reward: 1.1,  color: '#64b5f6', prob: 0.45 },
        { reward: 1.4,  color: '#9c27b0', prob: 0.25 },
        { reward: 1.7,  color: '#ef5350', prob: 0.20 },
        { reward: 2.0,  color: '#ffd700', prob: 0.10 },
        { end: true,    color: '#616161', prob: 0.00 },
      ]},
      { fields: [                                    // n=2
        { reward: 1.2,  color: '#64b5f6', prob: 0.40 },
        { reward: 1.6,  color: '#9c27b0', prob: 0.20 },
        { reward: 2.1,  color: '#ef5350', prob: 0.15 },
        { reward: 3.0,  color: '#ffd700', prob: 0.09 },
        { end: true,    color: '#616161', prob: 0.10 },
      ]},
      { fields: [                                    // n=3
        { reward: 1.3,  color: '#64b5f6', prob: 0.35 },
        { reward: 1.8,  color: '#9c27b0', prob: 0.16 },
        { reward: 2.5,  color: '#ef5350', prob: 0.10 },
        { reward: 4.0,  color: '#ffd700', prob: 0.07 },
        { end: true,    color: '#616161', prob: 0.20 },
      ]},
      { fields: [                                    // n=4
        { reward: 1.4,  color: '#64b5f6', prob: 0.20 },
        { reward: 2.0,  color: '#9c27b0', prob: 0.13 },
        { reward: 2.9,  color: '#ef5350', prob: 0.08 },
        { reward: 5.0,  color: '#ffd700', prob: 0.05 },
        { end: true,    color: '#616161', prob: 0.40 },
      ]},
      { fields: [                                    // n=5
        { reward: 1.5,  color: '#64b5f6', prob: 0.16 },
        { reward: 2.2,  color: '#9c27b0', prob: 0.10 },
        { reward: 3.3,  color: '#ef5350', prob: 0.06 },
        { reward: 6.0,  color: '#ffd700', prob: 0.03 },
        { end: true,    color: '#616161', prob: 0.50 },
      ]},
      { fields: [                                    // n=6
        { reward: 1.6,  color: '#64b5f6', prob: 0.13 },
        { reward: 2.4,  color: '#9c27b0', prob: 0.08 },
        { reward: 3.7,  color: '#ef5350', prob: 0.05 },
        { reward: 7.0,  color: '#ffd700', prob: 0.02 },
        { end: true,    color: '#616161', prob: 0.60 },
      ]},
      { fields: [                                    // n=7
        { reward: 1.7,  color: '#64b5f6', prob: 0.10 },
        { reward: 2.6,  color: '#9c27b0', prob: 0.06 },
        { reward: 4.1,  color: '#ef5350', prob: 0.03 },
        { reward: 8.0,  color: '#ffd700', prob: 0.01 },
        { end: true,    color: '#616161', prob: 0.70 },
      ]},
      { fields: [                                    // n=8
        { reward: 1.8,  color: '#64b5f6', prob: 0.07 },
        { reward: 2.8,  color: '#9c27b0', prob: 0.04 },
        { reward: 4.5,  color: '#ef5350', prob: 0.02 },
        { reward: 9.0,  color: '#ffd700', prob: 0.01 },
        { end: true,    color: '#616161', prob: 0.79 },
      ]},
      { fields: [                                    // n=9
        { reward: 1.9,  color: '#64b5f6', prob: 0.05 },
        { reward: 3.0,  color: '#9c27b0', prob: 0.03 },
        { reward: 4.9,  color: '#ef5350', prob: 0.01 },
        { reward: 10.0, color: '#ffd700', prob: 0.01 },
        { end: true,    color: '#616161', prob: 0.87 },
      ]},
      { fields: [                                    // n=10
        { reward: 2.0,  color: '#64b5f6', prob: 0.03 },
        { reward: 3.2,  color: '#9c27b0', prob: 0.02 },
        { reward: 5.3,  color: '#ef5350', prob: 0.01 },
        { reward: 11.0, color: '#ffd700', prob: 0.01 },
        { end: true,    color: '#616161', prob: 0.93 },
      ]},
    ],
  },

  segments: {
    count_min:    2,   // Mindestanzahl regulärer Segmente
    count_range:  20,  // n = floor(rng * count_range) + count_min → 2..21
    weight_min:   0.15,
    weight_range: 0.85,
  },

  // Gewinnkategorien für reguläre Segmente.
  // prob: Wahrscheinlichkeit, dass ein Segment in diese Kategorie fällt (Summe = 1.0)
  // min/max: Multiplikator des spin_cost (z.B. 1.0 = 1× Einsatz = 5 Gold)
  // Wenn min === max: kein zweiter RNG-Aufruf (Seed-Sequenz bleibt erhalten)
  categories: [
    { prob: 0.70, min: 0,   max: 0,   color: '#9e9e9e' }, // leer
    { prob: 0.20, min: 0.5, max: 1,   color: '#64b5f6' }, // klein
    { prob: 0.09, min: 3,   max: 5,   color: '#ed69ff' }, // groß
    { prob: 0.01, min: 10,  max: 100, color: '#ffee00' }, // riesig
  ],
};

export default WHEEL_BALANCE;
