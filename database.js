const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const databasePath = process.env.VERCEL
  ? path.join("/tmp", "database.sqlite")
  : path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(databasePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes,
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_whatsapp TEXT NOT NULL DEFAULT '5511999999999',
      mercado_pago_checkout TEXT NOT NULL DEFAULT 'https://www.mercadopago.com.br/',
      pix_key TEXT NOT NULL DEFAULT '',
      business_address TEXT NOT NULL DEFAULT ''
    )
  `);

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

module.exports = {
  all,
  db,
  get,
  initializeDatabase,
  run,
};
