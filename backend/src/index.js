import "dotenv/config";
import { ensureDatabase } from "./ensure-database.js";
import { validateProductionConfig } from "./config.js";
import { startupStep } from "./startup.js";

const production = process.env.NODE_ENV === "production";
const step = (name, operation) => startupStep(name, operation, { timeoutMs: production ? 30000 : 0 });

try {
  await step("validateProductionConfig", () => validateProductionConfig());
  const database = await step("ensureDatabase", () => ensureDatabase());
  const { prisma } = await step("import db.js", () => import("./db.js"));
  await step("Prisma connect and SELECT 1", async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  });
  const { createApp } = await step("import app.js (including upload directory initialization)", () => import("./app.js"));
  if (!production) {
    const { seed } = await step("import seed.js (development only)", () => import("../prisma/seed.js"));
    await step("seed (development only)", () => seed(prisma));
  }

  const port = Number(process.env.PORT || 4000);
  const app = await step("createApp", () => createApp());
  const server = await step("app.listen", () => new Promise((resolve, reject) => {
    const listener = app.listen(port, "0.0.0.0", () => resolve(listener));
    listener.once("error", reject);
  }));
  const mode = database.embedded ? "embedded PostgreSQL" : database.provider === "supabase" ? "Supabase" : "PostgreSQL";
  console.log(`RoomStay API listening on http://0.0.0.0:${server.address().port} (${mode})`);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      server.close();
      await prisma.$disconnect();
      await database.stop();
      process.exit(0);
    });
  }
} catch {
  console.error("[startup] Aborting startup; see the failed step above. Connection credentials are not logged.");
  // Do not await cleanup of an unresponsive database engine after a startup timeout.
  process.exit(1);
}
