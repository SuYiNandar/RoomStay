import path from "node:path";
export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (!env.UPLOAD_DIR || !path.isAbsolute(env.UPLOAD_DIR)) throw new Error("UPLOAD_DIR must be an absolute persistent disk path in production.");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required in production.");
  if (!env.JWT_SECRET || ["roomstay-dev-secret", "change-me-in-production"].includes(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error("Set JWT_SECRET to a random secret of at least 32 characters in production.");
  }
  if (!env.FRONTEND_ORIGIN) throw new Error("FRONTEND_ORIGIN is required in production.");
  const origin = new URL(env.FRONTEND_ORIGIN);
  if (origin.protocol !== "https:" || origin.origin !== env.FRONTEND_ORIGIN) {
    throw new Error("FRONTEND_ORIGIN must be an HTTPS origin without a trailing slash in production.");
  }
}
