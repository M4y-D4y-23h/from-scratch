import { defineConfig } from "drizzle-kit";

// Gera as migrações SQL a partir do schema (pnpm db:generate). Não precisa de banco aberto.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
});
