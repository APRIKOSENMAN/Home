/**
 * Currency Transaction Manager
 * Single source of truth for all currency operations
 * Ensures atomicity, consistency, and auditability
 */

const CURRENCIES = require('../data/currencies.json').currencies;
const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map(c => [c.id, c]));

/**
 * Validates and executes a transaction
 * Returns: { success: bool, error?: string, newState?: object }
 */
async function executeTransaction(pool, username, action, payload) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Fetch current user state
    const userRes = await client.query(
      'SELECT gold, premium_currency, gems FROM users WHERE username = $1',
      [username]
    );
    
    if (!userRes.rows[0]) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Benutzer nicht gefunden' };
    }

    const currentState = userRes.rows[0];
    const delta = {}; // { currencyId: amount }

    // ── ACTION HANDLERS ──────────────────────────────
    
    if (action === 'spin_wheel') {
      const reward = payload.reward;
      if (!Number.isInteger(reward) || reward < 0 || reward > 200) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültiger Reward' };
      }
      delta.gold = reward;
      
      // Log the spin
      await client.query(
        `INSERT INTO spin_log (username, seed, version, segment_idx, reward)
         VALUES ($1, $2, $3, $4, $5)`,
        [username, payload.seed, 1, payload.segmentIdx, reward]
      );
    }

    else if (action === 'daily_bonus') {
      const bonus = payload.bonus || 50;
      const currencyId = payload.currency || 'gold';
      
      if (!CURRENCY_MAP[currencyId]) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültige Währung' };
      }
      
      delta[currencyId] = bonus;
    }

    else if (action === 'purchase_premium') {
      const amount = payload.amount;
      if (!Number.isInteger(amount) || amount <= 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültiger Betrag' };
      }
      delta.premium = amount;
    }

    else if (action === 'buy_item') {
      const { itemType, price } = payload;
      if (!Number.isInteger(price) || price < 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültiger Preis' };
      }
      delta.gold = -price;
    }

    else if (action === 'sell_item') {
      const { itemType, price } = payload;
      if (!Number.isInteger(price) || price <= 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültiger Verkaufspreis' };
      }
      delta.gold = price;
    }

    else if (action === 'admin_grant') {
      const { currencyId, amount } = payload;
      if (!CURRENCY_MAP[currencyId]) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültige Währung' };
      }
      if (!Number.isInteger(amount)) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Ungültiger Betrag' };
      }
      delta[currencyId] = amount;
    }

    else {
      await client.query('ROLLBACK');
      return { success: false, error: `Unbekannte Aktion: ${action}` };
    }

    // ── APPLY DELTAS ────────────────────────────────
    
    const newState = { ...currentState };
    const updates = [];

    for (const [currencyId, amount] of Object.entries(delta)) {
      const currency = CURRENCY_MAP[currencyId];
      if (!currency) {
        await client.query('ROLLBACK');
        return { success: false, error: `Ungültige Währung: ${currencyId}` };
      }

      const field = currency.dbField;
      const newValue = (newState[field] || 0) + amount;

      // Bounds check
      if (newValue < currency.min || newValue > currency.max) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `${currencyId} außerhalb der Grenzen (${currency.min}-${currency.max})`
        };
      }

      newState[field] = newValue;
      updates.push(`${field} = ${field} + ${amount}`);
    }

    // ── UPDATE DATABASE ────────────────────────────
    
    if (updates.length > 0) {
      const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE username = $1`;
      await client.query(sql, [username]);
    }

    // ── AUDIT LOG ──────────────────────────────────
    
    await client.query(
      `INSERT INTO currency_transactions 
       (username, action, delta_json, reason, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [username, action, JSON.stringify(delta), payload.reason || null]
    );

    await client.query('COMMIT');

    return {
      success: true,
      newState: {
        gold: newState.gold,
        premium_currency: newState.premium_currency,
        gems: newState.gems
      }
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    return {
      success: false,
      error: 'Transaktionsfehler'
    };
  } finally {
    client.release();
  }
}

/**
 * Get complete user state (wallet + inventory + buildings)
 */
async function getUserState(pool, username) {
  const { rows } = await pool.query(
    `SELECT username, gold, premium_currency, gems FROM users WHERE username = $1`,
    [username]
  );

  if (!rows[0]) return null;

  return {
    username: rows[0].username,
    wallet: {
      gold: rows[0].gold || 0,
      premium: rows[0].premium_currency || 0,
      gems: rows[0].gems || 0
    }
  };
}

module.exports = {
  executeTransaction,
  getUserState,
  CURRENCY_MAP
};
