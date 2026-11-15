import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

if (process.argv.length === 3 && process.argv[2] === "--help") {
  console.log(
    "Usage: node --env-file-if-exists=.env.local scripts/db-readonly-smoke.mjs",
  );
} else {
  try {
    if (process.argv.length !== 2) throw new Error("invalid_arguments");
    if (!process.env.DATABASE_URL?.trim())
      throw new Error("missing_database_url");
    const { Client } = await import("pg");
    const { probeReadonlyDatabase, DatabaseProbeError } =
      await import("./lib/db-readonly-probe.mjs");
    const directory = fileURLToPath(
      new URL("../supabase/migrations/", import.meta.url),
    );
    const names = (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const expectedMigrations = [];
    for (const name of names) {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name))
        throw new Error("invalid_migrations");
      const content = await readFile(path.join(directory, name));
      expectedMigrations.push({
        version: name.slice(0, -4),
        checksum: createHash("sha256").update(content).digest("hex"),
      });
    }
    try {
      const result = await probeReadonlyDatabase({
        databaseUrl: process.env.DATABASE_URL,
        expectedMigrations,
        createClient: (config) => new Client(config),
      });
      console.log(JSON.stringify(result, null, 2));
      if (!result.schemaReady) process.exitCode = 2;
    } catch (error) {
      console.error(
        JSON.stringify({
          status: "failed",
          connectionVerified: false,
          written: false,
          code:
            error instanceof DatabaseProbeError
              ? error.code
              : "execution_error",
          stage:
            error instanceof DatabaseProbeError ? error.stage : "configuration",
        }),
      );
      process.exitCode = 1;
    }
  } catch (error) {
    const code = [
      "missing_database_url",
      "invalid_arguments",
      "invalid_migrations",
    ].includes(error?.message)
      ? error.message
      : error?.code === "ERR_MODULE_NOT_FOUND"
        ? "missing_dependencies"
        : "execution_error";
    console.error(
      JSON.stringify({
        status: "failed",
        connectionVerified: false,
        written: false,
        code,
      }),
    );
    process.exitCode = 1;
  }
}
