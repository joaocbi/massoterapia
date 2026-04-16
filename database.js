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
      blocked_dates_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await ensureSettingsColumns();

  await run(`
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
      amount REAL NOT NULL DEFAULT 0,
      duration TEXT NOT NULL DEFAULT 'Sob consulta',
      mercado_pago_preference_id TEXT DEFAULT '',
      mercado_pago_payment_id TEXT DEFAULT '',
      payment_url TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

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
}

async function addColumnIfMissing(existing, columnName, definition) {
  if (existing.has(columnName)) {
    return;
  }

  await run(`ALTER TABLE settings ADD COLUMN ${columnName} ${definition}`);
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
