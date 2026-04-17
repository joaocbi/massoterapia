const { Pool } = require("pg");

const GLOBAL_POOL_KEY = "__flowTerapiasPgPool";

let initPromise;

function toPgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function getPool() {
  if (!global[GLOBAL_POOL_KEY]) {
    const connectionString = process.env.DATABASE_URL;
    const isLocal = /localhost|127\.0\.0\.1/.test(String(connectionString || ""));
    global[GLOBAL_POOL_KEY] = new Pool({
      connectionString,
      max: isLocal ? 5 : 10,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    global[GLOBAL_POOL_KEY].on("error", (error) => {
      console.error("[Flow API PG] Pool error:", error);
    });
  }

  return global[GLOBAL_POOL_KEY];
}

async function initializeDatabase() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const pool = getPool();
    console.log("[Flow API] Initializing PostgreSQL schema");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY,
        business_whatsapp TEXT NOT NULL DEFAULT '5511999999999',
        mercado_pago_checkout TEXT NOT NULL DEFAULT 'https://www.mercadopago.com.br/',
        pix_key TEXT NOT NULL DEFAULT '',
        business_address TEXT NOT NULL DEFAULT '',
        services_json TEXT NOT NULL DEFAULT '[]',
        time_slots_json TEXT NOT NULL DEFAULT '[]',
        payment_methods_json TEXT NOT NULL DEFAULT '[]',
        allowed_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
        blocked_dates_json TEXT NOT NULL DEFAULT '[]',
        CONSTRAINT settings_id_singleton CHECK (id = 1)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT DEFAULT '',
        massage_type TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        service_region TEXT DEFAULT '',
        customer_notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'confirmed',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        duration TEXT NOT NULL DEFAULT 'Sob consulta',
        mercado_pago_preference_id TEXT DEFAULT '',
        mercado_pago_payment_id TEXT DEFAULT '',
        payment_url TEXT DEFAULT '',
        created_at TEXT NOT NULL
      )
    `);

    await pool.query(`
      INSERT INTO settings (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);
  })();

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }

  return initPromise;
}

async function run(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const text = toPgSql(sql);
  const result = await pool.query(text, params);
  return {
    lastID: 0,
    changes: result.rowCount ?? 0,
  };
}

async function get(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const result = await pool.query(toPgSql(sql), params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const result = await pool.query(toPgSql(sql), params);
  return result.rows;
}

module.exports = {
  all,
  get,
  initializeDatabase,
  run,
};
