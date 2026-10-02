/**
 * LOCAL E2E seed — prepares the file DB (schema + user) for the Yandex import
 * E2E run. Prints `userId` on stdout (consumed by local_e2e.mjs).
 *
 * Run: TURSO_DATABASE_URL=file:... npx tsx scripts/yandex/e2e_seed.ts
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e-secret";

import { ensureTursoSchema, getTursoClient } from "@/lib/database";
import { randomUUID } from "crypto";

async function main() {
  await ensureTursoSchema();
  const userId = `ue2e_${randomUUID().slice(0, 12)}`;
  const t = getTursoClient();
  await t.execute({
    sql: "INSERT INTO User (id, username, email, password, confirmed, role, createdAt) VALUES (?,?,?,?,1,'user',?)",
    args: [userId, `e2e_${userId.slice(5, 13)}`, `${userId}@e2e.local`, "x", new Date().toISOString()],
  });
  console.log(userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
