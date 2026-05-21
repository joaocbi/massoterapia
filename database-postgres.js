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
    msg.includes("the database system is starting up") ||
    msg.includes("Client has encountered a connection error") ||
    msg.includes("Connection closed") ||
    msg.includes("not queryable")
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
      max: isLocal ? 5 : isVercel ? 2 : 10,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: isVercel ? 25000 : 15000,
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
        professionals_json TEXT NOT NULL DEFAULT '[]',
        CONSTRAINT settings_id_singleton CHECK (id = 1)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        professional_id TEXT NOT NULL DEFAULT 'legacy-professional',
        professional_name TEXT NOT NULL DEFAULT '',
        professional_whatsapp TEXT NOT NULL DEFAULT '',
        professional_address TEXT NOT NULL DEFAULT '',
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
        active_booking BOOLEAN NOT NULL DEFAULT TRUE,
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
      CREATE TABLE IF NOT EXISTS professional_applications (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        email TEXT DEFAULT '',
        city TEXT DEFAULT '',
        instagram TEXT DEFAULT '',
        specialties TEXT DEFAULT '',
        message TEXT DEFAULT '',
        accepted_terms BOOLEAN NOT NULL DEFAULT FALSE,
        accepted_fee BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      )
    `);

    await ensurePostgresSettingsColumns(pool);
    await ensurePostgresAppointmentsColumns(pool);
    await ensurePostgresAppointmentBookingState(pool);
    await ensurePostgresLegacyProfessionalBackfill(pool);
    await ensurePostgresUniqueActiveAppointmentSlots(pool);

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

async function ensurePostgresSettingsColumns(pool) {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings'
  `);
  const existing = new Set(rows.map((row) => String(row.column_name).toLowerCase()));
  const columns = [
    ["services_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["time_slots_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["payment_methods_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["allowed_weekdays_json", "TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]'"],
    ["blocked_dates_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["professionals_json", "TEXT NOT NULL DEFAULT '[]'"],
  ];

  for (const [name, definition] of columns) {
    if (existing.has(name)) {
      continue;
    }

    await pool.query(`ALTER TABLE settings ADD COLUMN ${name} ${definition}`);
    console.log("[Flow API PG] settings: added missing column", name);
  }
}

async function ensurePostgresAppointmentsColumns(pool) {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
  `);
  const existing = new Set(rows.map((row) => String(row.column_name).toLowerCase()));
  const columns = [
    ["professional_id", "TEXT NOT NULL DEFAULT 'legacy-professional'"],
    ["professional_name", "TEXT NOT NULL DEFAULT ''"],
    ["professional_whatsapp", "TEXT NOT NULL DEFAULT ''"],
    ["professional_address", "TEXT NOT NULL DEFAULT ''"],
    ["customer_email", "TEXT DEFAULT ''"],
    ["service_region", "TEXT DEFAULT ''"],
    ["customer_notes", "TEXT DEFAULT ''"],
    ["status", "TEXT NOT NULL DEFAULT 'confirmed'"],
    ["active_booking", "BOOLEAN NOT NULL DEFAULT TRUE"],
    ["payment_status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["amount", "DOUBLE PRECISION NOT NULL DEFAULT 0"],
    ["duration", "TEXT NOT NULL DEFAULT 'Sob consulta'"],
    ["mercado_pago_preference_id", "TEXT DEFAULT ''"],
    ["mercado_pago_payment_id", "TEXT DEFAULT ''"],
    ["payment_url", "TEXT DEFAULT ''"],
    ["created_at", "TEXT NOT NULL DEFAULT ''"],
  ];

  for (const [name, definition] of columns) {
    if (existing.has(name)) {
      continue;
    }

    await pool.query(`ALTER TABLE appointments ADD COLUMN ${name} ${definition}`);
    console.log("[Flow API PG] appointments: added missing column", name);
  }
}

async function ensurePostgresAppointmentBookingState(pool) {
  await pool.query(`
    UPDATE appointments
    SET active_booking = CASE WHEN status = 'cancelled' THEN FALSE ELSE TRUE END
    WHERE active_booking IS DISTINCT FROM CASE WHEN status = 'cancelled' THEN FALSE ELSE TRUE END
  `);
}

async function ensurePostgresLegacyProfessionalBackfill(pool) {
  await pool.query(`
    UPDATE appointments
    SET
      professional_id = CASE
        WHEN professional_id IS NULL OR BTRIM(professional_id) = '' THEN 'legacy-professional'
        ELSE professional_id
      END,
      professional_name = CASE
        WHEN professional_name IS NULL OR BTRIM(professional_name) = '' THEN 'Profissional principal'
        ELSE professional_name
      END,
      professional_whatsapp = CASE
        WHEN professional_whatsapp IS NULL OR BTRIM(professional_whatsapp) = '' THEN customer_phone
        ELSE professional_whatsapp
      END,
      professional_address = CASE
        WHEN professional_address IS NULL OR BTRIM(professional_address) = '' THEN service_region
        ELSE professional_address
      END
  `);
}

async function ensurePostgresUniqueActiveAppointmentSlots(pool) {
  await pool.query(`DROP INDEX IF EXISTS appointments_unique_active_slot`);

  const { rows: duplicatedSlots } = await pool.query(`
    SELECT professional_id, appointment_date, appointment_time
    FROM appointments
    WHERE active_booking = TRUE
    GROUP BY professional_id, appointment_date, appointment_time
    HAVING COUNT(*) > 1
  `);

  for (const slot of duplicatedSlots) {
    const { rows } = await pool.query(
      `
        SELECT id
        FROM appointments
        WHERE professional_id = $1 AND appointment_date = $2 AND appointment_time = $3 AND active_booking = TRUE
        ORDER BY created_at ASC, id ASC
      `,
      [slot.professional_id, slot.appointment_date, slot.appointment_time]
    );

    for (const duplicate of rows.slice(1)) {
      await pool.query(
        `
          UPDATE appointments
          SET status = 'cancelled', active_booking = FALSE
          WHERE id = $1
        `,
        [duplicate.id]
      );
      console.warn("[Flow API PG] duplicate active slot auto-cancelled:", duplicate.id);
    }
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_slot
    ON appointments (professional_id, appointment_date, appointment_time)
    WHERE active_booking = TRUE
  `);
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
