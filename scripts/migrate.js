import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../migrations");
const pool = new Pool({ connectionString: databaseUrl });

try {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const name of files) {
    const alreadyApplied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (alreadyApplied.rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(path.join(migrationsDir, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.info(`Applied migration ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
