import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startupStep } from "../src/startup.js";
const exec = promisify(execFile);
const cwd = new URL("../", import.meta.url);

test("startup steps log completion and return results", async () => {
  const logs = [];
  assert.equal(await startupStep("connect", async () => 42, { log: text => logs.push(text) }), 42);
  assert.match(logs[0], /connect: starting/);
  assert.match(logs[1], /connect: complete/);
});
test("stalled initialization fails within its deadline", async () => {
  const logs = [];
  await assert.rejects(startupStep("database", () => new Promise(() => {}), { timeoutMs: 20, log: text => logs.push(text) }), { code: "STARTUP_TIMEOUT" });
  assert.match(logs[1], /database: failed \(STARTUP_TIMEOUT/);
});
test("startup errors report Prisma codes without connection secrets", async () => {
  const logs = [];
  const error = Object.assign(new Error("postgresql://user:secret@host/db"), { errorCode: "P1001" });
  await assert.rejects(startupStep("database", () => { throw error; }, { log: text => logs.push(text) }));
  assert.match(logs[1], /P1001/);
  assert.ok(!logs.join(" ").includes("secret"));
});
test("production database setup never runs schema CLI or embedded fallback", async () => {
  const { stdout } = await exec(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { ensureDatabase } from './src/ensure-database.js';
    const db = await ensureDatabase();
    assert.equal(db.embedded, false);
    assert.equal(db.provider, 'supabase');
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(url.port, '5432');
    assert.equal(url.searchParams.get('sslmode'), 'require');
    assert.equal(url.searchParams.get('connect_timeout'), '10');
    assert.equal(url.searchParams.get('pool_timeout'), '10');
    assert.equal(url.searchParams.has('pgbouncer'), false);
    await assert.rejects(ensureDatabase({forceEmbedded: true}));
    delete process.env.DATABASE_URL;
    await assert.rejects(ensureDatabase());
    console.log('passed');
  `], { cwd, env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://user:secret@invalid.pooler.supabase.com:5432/postgres" }, timeout: 5000 });
  assert.match(stdout, /passed/);
});
test("production entrypoint exits before listening when database is unreachable", async () => {
  await assert.rejects(exec(process.execPath, ["src/index.js"], {
    cwd,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://user:startup-secret@127.0.0.1:1/db?connect_timeout=1", JWT_SECRET: "x".repeat(32), FRONTEND_ORIGIN: "https://example.com", UPLOAD_DIR: "/tmp/roomstay-startup-test", PORT: "0" },
    timeout: 10000,
  }), error => {
    assert.equal(error.code, 1);
    assert.equal(error.killed, false);
    assert.match(error.stdout, /ensureDatabase: complete/);
    assert.match(error.stdout, /Prisma connect and SELECT 1: failed/);
    assert.ok(!error.stdout.includes('app.listen: starting'));
    assert.ok(!(error.stdout + error.stderr).includes('startup-secret'));
    return true;
  });
});
