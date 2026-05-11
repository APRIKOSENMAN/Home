// Wheel balance config — single ESM source of truth (server + client).
//
// Jackpot-Runden: reward = Multiplikator (z.B. 2.5 → Produkt × 2.5)
// Auszahlung bei ENDE: Math.round(spin_cost × Produkt aller Multiplikatoren)

const WHEEL_BALANCE = {
  // Kosten pro Spin und pro Generate (in Gold)
  spin_cost: 10,

  jackpot: {
    prob:  0.05,      // fixes 5%-Kuchenstück, immer vorhanden
    color: '#e3f307', // client-only

    // Visuelle Größe + Farbe der Felder – gilt für alle Runden.
    // Anteil = Tickets des Feldes / Tickets gesamt.
    // Reihenfolge: [Feld 0, Feld 1, Feld 2, Feld 3, ENDE]
    field_tickets: [30, 25, 20, 15, 30],
    field_colors:  ['#64b5f6', '#2747b0', '#ef5350', '#ffd700', '#616161'],

    round_count: 10,

    // Reward pro Feld: start + (n-1) × step,  n = 1 .. round_count
    // Reihenfolge: [Feld 0, Feld 1, Feld 2, Feld 3]  — ENDE hat kein reward
    reward_start: [1.1, 1.2, 1.5, 2],
    reward_step:  [0.1, 0.1, 0.5, 1],

    // Wahrscheinlichkeits-Tickets pro Feld: start + (n-1) × step,  n = 1 .. round_count
    // Reihenfolge: [Feld 0, Feld 1, Feld 2, Feld 3, ENDE]
    // prob = Tickets des Feldes / Tickets gesamt (pro Runde neu normiert; Minimum 0)
    prob_tickets_start: [50, 20, 20, 10,  0],
    prob_tickets_step:  [-4, -2, -2, -1, 10],
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
    { prob: 0.70, min: 0,    max: 0,  color: '#9e9e9e' }, // leer
    { prob: 0.20, min: 0.25, max: 0.5, color: '#64b5f6' }, // klein
    { prob: 0.09, min: 1.5,  max: 2.5, color: '#ed69ff' }, // groß
    { prob: 0.01, min: 5,    max: 50,  color: '#ffee00' }, // riesig
  ],
};

// Runden aus Parametern ableiten — server.js und wheel.js lesen weiterhin .rounds[]
const jp = WHEEL_BALANCE.jackpot;
jp.rounds = Array.from({ length: jp.round_count }, (_, idx) => {
  const pt    = jp.prob_tickets_start.map((s, i) => Math.max(0, s + idx * jp.prob_tickets_step[i]));
  const total = pt.reduce((a, b) => a + b, 0);
  return {
    fields: [
      ...jp.reward_start.map((s, i) => ({
        reward: Math.round((s + idx * jp.reward_step[i]) * 10) / 10,
        prob:   total > 0 ? pt[i] / total : 0,
      })),
      { end: true, prob: total > 0 ? pt[pt.length - 1] / total : 1 },
    ],
  };
});

export default WHEEL_BALANCE;
