const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const databasePath = process.env.VERCEL
  ? path.join("/tmp", "database.sqlite")
  : path.join(__dirname, "database.sqlite");

let SQL;
let db;
let initPromise;

async function initializeDatabase() {
  await ensureReady();

  if (process.env.VERCEL) {
    console.warn(
      "[Flow API] SQLite on Vercel uses /tmp (ephemeral). Data may reset between instances. Set DATABASE_URL to use PostgreSQL for durable settings and appointments."
    );
  }

  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_whatsapp TEXT NOT NULL DEFAULT '5511999999999',
      mercado_pago_checkout TEXT NOT NULL DEFAULT 'https://www.mercadopago.com.br/',
      pix_key TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT '',
      services_json TEXT NOT NULL DEFAULT '[]',
      time_slots_json TEXT NOT NULL DEFAULT '[]',
      payment_methods_json TEXT NOT NULL DEFAULT '[]',
      allowed_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
      blocked_dates_json TEXT NOT NULL DEFAULT '[]',
      professionals_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await ensureSettingsColumns();

  await run(`
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
      active_booking INTEGER NOT NULL DEFAULT 1,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      amount REAL NOT NULL DEFAULT 0,
      duration TEXT NOT NULL DEFAULT 'Sob consulta',
      mercado_pago_preference_id TEXT DEFAULT '',
      mercado_pago_payment_id TEXT DEFAULT '',
      payment_url TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS professional_applications (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      email TEXT DEFAULT '',
      city TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      specialties TEXT DEFAULT '',
      message TEXT DEFAULT '',
      accepted_terms INTEGER NOT NULL DEFAULT 0,
      accepted_fee INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
  `);

  await ensureAppointmentsColumns();
  await ensureAppointmentBookingState();
  await ensureLegacyProfessionalBackfill();
  await ensureUniqueActiveAppointmentSlots();

  await run(`
    INSERT OR IGNORE INTO settings (
      id,
      business_whatsapp,
      mercado_pago_checkout,
      pix_key,
      business_address
    )
    VALUES (1, '5511999999999', 'https://www.mercadopago.com.br/', '', '')
  `);
}

async function ensureSettingsColumns() {
  const columns = await all(`PRAGMA table_info(settings)`);
  const existing = new Set(columns.map((column) => column.name));

  await addColumnIfMissing(existing, "services_json", "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(existing, "time_slots_json", "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(existing, "payment_methods_json", "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(existing, "allowed_weekdays_json", "TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]'");
  await addColumnIfMissing(existing, "blocked_dates_json", "TEXT NOT NULL DEFAULT '[]'");
  await addColumnIfMissing(existing, "professionals_json", "TEXT NOT NULL DEFAULT '[]'");
}

async function addColumnIfMissing(existing, columnName, definition) {
  if (existing.has(columnName)) {
    return;
  }

  await run(`ALTER TABLE settings ADD COLUMN ${columnName} ${definition}`);
}

async function ensureAppointmentsColumns() {
  const columns = await all(`PRAGMA table_info(appointments)`);
  const existing = new Set(columns.map((column) => column.name));

  await addAppointmentColumnIfMissing(existing, "professional_id", "TEXT NOT NULL DEFAULT 'legacy-professional'");
  await addAppointmentColumnIfMissing(existing, "professional_name", "TEXT NOT NULL DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "professional_whatsapp", "TEXT NOT NULL DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "professional_address", "TEXT NOT NULL DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "customer_email", "TEXT DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "service_region", "TEXT DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "customer_notes", "TEXT DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "active_booking", "INTEGER NOT NULL DEFAULT 1");
  await addAppointmentColumnIfMissing(existing, "mercado_pago_preference_id", "TEXT DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "mercado_pago_payment_id", "TEXT DEFAULT ''");
  await addAppointmentColumnIfMissing(existing, "payment_url", "TEXT DEFAULT ''");
}

async function addAppointmentColumnIfMissing(existing, columnName, definition) {
  if (existing.has(columnName)) {
    return;
  }

  await run(`ALTER TABLE appointments ADD COLUMN ${columnName} ${definition}`);
  console.log("[Flow API] SQLite appointments: added missing column", columnName);
}

async function ensureAppointmentBookingState() {
  await run(`
    UPDATE appointments
    SET active_booking = CASE WHEN status = 'cancelled' THEN 0 ELSE 1 END
    WHERE active_booking NOT IN (0, 1)
       OR (status = 'cancelled' AND active_booking != 0)
       OR (status != 'cancelled' AND active_booking != 1)
  `);
}

async function ensureLegacyProfessionalBackfill() {
  await run(`
    UPDATE appointments
    SET
      professional_id = CASE
        WHEN professional_id IS NULL OR TRIM(professional_id) = '' THEN 'legacy-professional'
        ELSE professional_id
      END,
      professional_name = CASE
        WHEN professional_name IS NULL OR TRIM(professional_name) = '' THEN 'Profissional principal'
        ELSE professional_name
      END,
      professional_whatsapp = CASE
        WHEN professional_whatsapp IS NULL OR TRIM(professional_whatsapp) = '' THEN customer_phone
        ELSE professional_whatsapp
      END,
      professional_address = CASE
        WHEN professional_address IS NULL OR TRIM(professional_address) = '' THEN service_region
        ELSE professional_address
      END
  `);
}

async function ensureUniqueActiveAppointmentSlots() {
  await run(`DROP INDEX IF EXISTS appointments_unique_active_slot`);

  const duplicatedSlots = await all(`
    SELECT professional_id, appointment_date, appointment_time
    FROM appointments
    WHERE active_booking = 1
    GROUP BY professional_id, appointment_date, appointment_time
    HAVING COUNT(*) > 1
  `);

  for (const slot of duplicatedSlots) {
    const rows = await all(
      `
        SELECT id
        FROM appointments
        WHERE professional_id = ? AND appointment_date = ? AND appointment_time = ? AND active_booking = 1
        ORDER BY created_at ASC, id ASC
      `,
      [slot.professional_id, slot.appointment_date, slot.appointment_time]
    );

    for (const duplicate of rows.slice(1)) {
      await run(
        `
          UPDATE appointments
          SET status = 'cancelled', active_booking = 0
          WHERE id = ?
        `,
        [duplicate.id]
      );
      console.warn("[Flow API] SQLite duplicate active slot auto-cancelled:", duplicate.id);
    }
  }

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_slot
    ON appointments (professional_id, appointment_date, appointment_time)
    WHERE active_booking = 1
  `);
}

async function run(sql, params = []) {
  await ensureReady();
  const statement = db.prepare(sql);

  try {
    statement.bind(params);
    while (statement.step()) {
      // Run until completion for write queries.
    }
  } finally {
    statement.free();
  }

  const changes = singleValue("SELECT changes() AS value");
  const lastID = singleValue("SELECT last_insert_rowid() AS value");
  persistDatabase();

  return {
    lastID,
    changes,
  };
}

async function get(sql, params = []) {
  await ensureReady();
  const rows = executeQuery(sql, params);
  return rows[0] || null;
}

async function all(sql, params = []) {
  await ensureReady();
  return executeQuery(sql, params);
}

async function bootDatabase() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, "node_modules", "sql.js", "dist", file),
  });

  if (fs.existsSync(databasePath)) {
    const fileBuffer = fs.readFileSync(databasePath);
    db = new SQL.Database(fileBuffer);
    return;
  }

  db = new SQL.Database();
  persistDatabase();
}

function executeQuery(sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);

    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

function singleValue(sql) {
  const result = db.exec(sql);

  if (!result.length || !result[0].values.length) {
    return 0;
  }

  return result[0].values[0][0];
}

function persistDatabase() {
  const data = db.export();
  fs.writeFileSync(databasePath, Buffer.from(data));
}

async function ensureReady() {
  if (!initPromise) {
    initPromise = bootDatabase();
  }

  await initPromise;
}

module.exports = {
  all,
  db: () => db,
  get,
  initializeDatabase,
  run,
};
