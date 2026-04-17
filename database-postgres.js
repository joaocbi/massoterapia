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

function isRetryablePgError(error) {
  const code = error && error.code;
  const msg = String((error && error.message) || error || "");
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "ECONNREFUSED" ||
    code === "57P01" ||
    code === "08006" ||
    code === "08003" ||
    msg.includes("Connection terminated") ||
    msg.includes("timeout") ||
    msg.includes("the database system is starting up")
  );
}

async function queryWithRetry(pool, text, params, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;
      if (!isRetryablePgError(error) || attempt === attempts - 1) {
        throw error;
      }
      const delayMs = 200 * (attempt + 1);
      console.warn("[Flow API PG] query retry after transient error:", error.code || error.message, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function getPool() {
  if (!global[GLOBAL_POOL_KEY]) {
    const connectionString = process.env.DATABASE_URL;
    const isLocal = /localhost|127\.0\.0\.1/.test(String(connectionString || ""));
    const isVercel = Boolean(process.env.VERCEL);
    global[GLOBAL_POOL_KEY] = new Pool({
      connectionString,
      max: isLocal ? 5 : isVercel ? 1 : 10,
      idleTimeoutMillis: isVercel ? 8000 : 20000,
      connectionTimeoutMillis: isVercel ? 25000 : 15000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      allowExitOnIdle: isVercel,
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
    const dead = global[GLOBAL_POOL_KEY];
    if (dead) {
      delete global[GLOBAL_POOL_KEY];
      dead.end().catch(() => {});
    }
    throw error;
  }

  return initPromise;
}

async function run(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const text = toPgSql(sql);
  const result = await queryWithRetry(pool, text, params);
  return {
    lastID: 0,
    changes: result.rowCount ?? 0,
  };
}

async function get(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const result = await queryWithRetry(pool, toPgSql(sql), params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  await initializeDatabase();
  const pool = getPool();
  const result = await queryWithRetry(pool, toPgSql(sql), params);
  return result.rows;
}

module.exports = {
  all,
  get,
  initializeDatabase,
  run,
};
