/**
 * Lazy-load the DB implementation so DATABASE_URL / POSTGRES_URL from Vercel
 * are read at runtime (not only when the module is first evaluated at cold start).
 */

function normalizeDatabaseUrl() {
  if (!String(process.env.DATABASE_URL || "").trim()) {
    const fallbackUrl = String(
      process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || ""
    ).trim();
    if (fallbackUrl) {
      process.env.DATABASE_URL = fallbackUrl;
    }
  }
}

function isPostgresEnv() {
  normalizeDatabaseUrl();
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

let impl;
let loggedDriver;

function getImpl() {
  normalizeDatabaseUrl();
  const usePg = Boolean(String(process.env.DATABASE_URL || "").trim());

  if (!impl) {
    impl = usePg ? require("./database-postgres") : require("./database");
    if (!loggedDriver) {
      loggedDriver = true;
      console.log("[Flow API] DB driver:", usePg ? "postgresql" : "sqlite");
    }
  }

  return impl;
}

module.exports = {
  isPostgresEnv,
  initializeDatabase: (...args) => getImpl().initializeDatabase(...args),
  run: (...args) => getImpl().run(...args),
  get: (...args) => getImpl().get(...args),
  all: (...args) => getImpl().all(...args),
};
