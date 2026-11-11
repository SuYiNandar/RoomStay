import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function connectionUrl(raw) {
  const url = new URL(raw);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "30");
  url.searchParams.set("sslmode", "disable");
  return url.toString();
}

function isSupabase(raw) {
  const host = new URL(raw).hostname;
  return host.endsWith(".supabase.co") || host.endsWith(".supabase.com") || host.includes("pooler.supabase");
}

// Supabase requires TLS. The transaction pooler (port 6543) also needs Prisma's pgbouncer flag.
function supabaseUrl(raw) {
  const url = new URL(raw);
  if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  if (url.port === "6543") {
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "1");
  }
  return url.toString();
}

async function pushSchema(acceptDataLoss) {
  const args = [
    path.join(root, "node_modules/prisma/build/index.js"),
    "db",
    "push",
    "--skip-generate",
  ];
  if (acceptDataLoss) args.push("--accept-data-loss");
  await execFileAsync(process.execPath, args, { cwd: root, env: process.env });
}

export async function ensureDatabase(options = {}) {
  if (!options.forceEmbedded && process.env.DATABASE_URL) {
    const supabase = isSupabase(process.env.DATABASE_URL);
    if (supabase) process.env.DATABASE_URL = supabaseUrl(process.env.DATABASE_URL);
    // Production schema changes are an explicit deployment step.
    if (process.env.NODE_ENV !== "production") await pushSchema(false);
    return { embedded: false, provider: supabase ? "supabase" : "postgres", async stop() {} };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create(options.dataDir || path.join(root, ".pglite"));
  const ready = await db.query(`SELECT to_regclass('public."User"') AS name`);
  if (!ready.rows[0]?.name) {
    const sql = await readFile(path.join(root, "prisma/init.sql"), "utf8");
    await db.exec(sql);
  }
  const paymentChat = await db.query(`SELECT to_regclass('public."PaymentInquiry"') AS name`);
  if (!paymentChat.rows[0]?.name) {
    const sql = await readFile(path.join(root, "prisma/payment-chat.sql"), "utf8");
    await db.exec(sql);
  }

  const server = new PGLiteSocketServer({
    db,
    port: options.port ?? 54329,
    host: "127.0.0.1",
  });
  await server.start();
  const address = server.getServerConn();
  const raw = address.startsWith("postgres") ? address : `postgresql://postgres:postgres@${address}/template1`;
  process.env.DATABASE_URL = connectionUrl(raw);
  return {
    embedded: true,
    url: process.env.DATABASE_URL,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
