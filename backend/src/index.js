import "dotenv/config";
import { ensureDatabase } from "./ensure-database.js";
import { validateProductionConfig } from "./config.js";

validateProductionConfig();
const database = await ensureDatabase();
const { prisma } = await import("./db.js");
const { createApp } = await import("./app.js");
const { seed } = await import("../prisma/seed.js");

if (process.env.NODE_ENV !== "production") await seed(prisma);

const port = Number(process.env.PORT || 4000);
const app = createApp();
const server = app.listen(port, () => {
  const mode = database.embedded ? "embedded PostgreSQL" : database.provider === "supabase" ? "Supabase" : "PostgreSQL";
  console.log(`RoomStay API listening on http://localhost:${port} (${mode})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await prisma.$disconnect();
    await database.stop();
    process.exit(0);
  });
}
