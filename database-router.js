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
let implKind;

function getImpl() {
  normalizeDatabaseUrl();
  const usePg = Boolean(String(process.env.DATABASE_URL || "").trim());
  const desiredKind = usePg ? "pg" : "sqlite";

  // If env becomes available later (or first tick had no DATABASE_URL), do not keep using SQLite forever.
  if (impl && implKind !== desiredKind) {
    console.warn("[Flow API] DB driver mismatch; reloading store:", implKind, "->", desiredKind);
    impl = null;
    implKind = null;
  }

  if (!impl) {
    impl = usePg ? require("./database-postgres") : require("./database");
    implKind = desiredKind;
    console.log("[Flow API] DB driver:", implKind);
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
