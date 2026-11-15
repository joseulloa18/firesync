import { z } from "zod";

export const CORE_TABLES = [
  "regions",
  "grid_cells",
  "raw_detections",
  "cell_day_occupancy",
  "cell_month",
  "calibration_factors",
  "region_month_stats",
];
export const CORE_VIEWS = [
  "historical_product_detections",
  "historical_cell_day_occupancy",
];

const migrationSchema = z.strictObject({
  version: z.string().regex(/^\d{14}_[a-z0-9_]+$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
const migrationsSchema = z.array(migrationSchema).min(1).max(100);
const stages = [
  "configuration",
  "connect",
  "transaction",
  "schema",
  "ledger",
  "rollback",
];

export class DatabaseProbeError extends Error {
  constructor(code, stage) {
    super("Database verification failed; no data was written.");
    this.name = "DatabaseProbeError";
    this.code = code;
    this.stage = stages.includes(stage) ? stage : "configuration";
  }
}

/** Parse explicitly: pg connectionString SSL parameters can override ssl options. */
export function readonlyClientConfig(databaseUrl) {
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new DatabaseProbeError("missing_database_url", "configuration");
  }
  try {
    const url = new URL(databaseUrl);
    const sslMode = url.searchParams.get("sslmode");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      url.hash ||
      url.pathname.length < 2 ||
      url.pathname.slice(1).includes("/") ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
      url.searchParams.getAll("sslmode").length > 1 ||
      (sslMode !== null && !["require", "verify-full"].includes(sslMode))
    )
      throw new Error("invalid");
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("invalid");
    return {
      host: url.hostname,
      port,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: { rejectUnauthorized: true },
      application_name: "firesync-db-readonly-smoke",
      connectionTimeoutMillis: 5_000,
      query_timeout: 6_000,
    };
  } catch {
    throw new DatabaseProbeError("invalid_database_url", "configuration");
  }
}

const relationSchema = z.object({
  name: z.enum([...CORE_TABLES, ...CORE_VIEWS, "schema_migrations"]),
  kind: z.enum(["r", "p", "v", "m", "f"]),
  rls: z.boolean(),
  invoker: z.boolean(),
});
const extensionSchema = z.object({
  name: z.enum(["postgis", "pgcrypto"]),
  version: z.string().regex(/^[0-9][a-zA-Z0-9._+-]{0,63}$/),
});
const policySchema = z.object({
  table: z.enum(CORE_TABLES),
  command: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"]),
  public_read: z.boolean(),
});

function safeError(error, stage) {
  if (error instanceof DatabaseProbeError) return error;
  const code = error?.code;
  if (code === "28P01" || code === "28000") {
    return new DatabaseProbeError("authentication_failed", stage);
  }
  if (code === "42501")
    return new DatabaseProbeError("permission_denied", stage);
  if (code === "57014") return new DatabaseProbeError("query_timeout", stage);
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return new DatabaseProbeError("dns_error", stage);
  }
  if (
    [
      "CERT_HAS_EXPIRED",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ].includes(code)
  ) {
    return new DatabaseProbeError("tls_error", stage);
  }
  return new DatabaseProbeError(
    stage === "connect" ? "connection_failed" : "verification_failed",
    stage,
  );
}

/** Only fixed catalogue/ledger reads. Does not call the migrator or db-check. */
export async function probeReadonlyDatabase({
  databaseUrl,
  expectedMigrations,
  createClient,
  timeoutMs = 30_000,
  now = () => new Date(),
}) {
  const config = readonlyClientConfig(databaseUrl);
  const parsed = migrationsSchema.safeParse(expectedMigrations);
  if (
    !parsed.success ||
    new Set(parsed.data.map((m) => m.version)).size !== parsed.data.length ||
    typeof createClient !== "function" ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000
  ) {
    throw new DatabaseProbeError("invalid_configuration", "configuration");
  }
  let client;
  try {
    client = createClient(config);
    if (
      !["connect", "query", "end"].every(
        (method) => typeof client?.[method] === "function",
      )
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw new DatabaseProbeError("invalid_configuration", "configuration");
  }
  // pg may emit connection errors in addition to rejecting a pending query.
  const quietError = () => {};
  client.on?.("error", quietError);
  let stage = "connect";
  let inTransaction = false;
  let expired = false;
  let closing;
  const close = () => {
    if (!closing)
      closing = Promise.resolve()
        .then(() => client.end())
        .catch(() => {});
    return closing;
  };
  const query = async (sql, values) => {
    if (expired) throw new DatabaseProbeError("timeout", stage);
    const result = await client.query(sql, values);
    if (expired) throw new DatabaseProbeError("timeout", stage);
    return result;
  };
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      void close();
      reject(new DatabaseProbeError("timeout", stage));
    }, timeoutMs);
  });
  const run = async () => {
    await client.connect();
    if (expired) throw new DatabaseProbeError("timeout", stage);
    stage = "transaction";
    await query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    inTransaction = true;
    await query("SET LOCAL statement_timeout = '5000ms'");
    await query("SET LOCAL lock_timeout = '1000ms'");
    await query("SET LOCAL idle_in_transaction_session_timeout = '15000ms'");
    await query("SET LOCAL search_path = pg_catalog");
    const settings = await query(`SELECT
      current_setting('transaction_read_only') = 'on' AS read_only,
      current_setting('server_version_num') AS server_version`);
    const settingsRow = z
      .object({
        read_only: z.literal(true),
        server_version: z.string().regex(/^\d{5,7}$/),
      })
      .parse(settings.rows[0]);

    stage = "schema";
    const ext = await query(
      `SELECT extname AS name, extversion AS version
      FROM pg_catalog.pg_extension WHERE extname = ANY($1::text[])`,
      [["postgis", "pgcrypto"]],
    );
    const extensions = z.array(extensionSchema).max(2).parse(ext.rows);
    const rel = await query(
      `SELECT c.relname AS name, c.relkind::text AS kind,
      c.relrowsecurity AS rls,
      COALESCE(c.reloptions, '{}'::text[]) @> ARRAY['security_invoker=true'] AS invoker
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [[...CORE_TABLES, ...CORE_VIEWS, "schema_migrations"]],
    );
    const relations = z.array(relationSchema).max(10).parse(rel.rows);
    const pol = await query(
      `SELECT tablename AS "table", cmd AS command,
      COALESCE((cmd = 'SELECT' AND 'public'::name = ANY(roles)
       AND permissive = 'PERMISSIVE' AND qual = 'true'), false) AS public_read
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
      LIMIT 101`,
      [CORE_TABLES],
    );
    const policies = z.array(policySchema).max(100).parse(pol.rows);
    const tables = CORE_TABLES.map((name) => {
      const relation = relations.find((r) => r.name === name);
      return {
        name,
        exists: relation?.kind === "r" || relation?.kind === "p",
        rlsEnabled: relation?.rls === true,
        publicReadPolicy: policies.some(
          (p) => p.table === name && p.public_read,
        ),
        writePolicies: policies.filter(
          (p) => p.table === name && p.command !== "SELECT",
        ).length,
        additionalReadPolicies: policies.filter(
          (p) => p.table === name && p.command === "SELECT" && !p.public_read,
        ).length,
      };
    });
    const views = CORE_VIEWS.map((name) => {
      const relation = relations.find((r) => r.name === name);
      return {
        name,
        exists: relation?.kind === "v",
        securityInvoker: relation?.invoker === true,
      };
    });

    stage = "ledger";
    const ledgerExists = relations.some(
      (r) => r.name === "schema_migrations" && r.kind === "r",
    );
    let migrations = [];
    if (ledgerExists) {
      const ledger = await query(
        "SELECT version, checksum FROM public.schema_migrations ORDER BY version LIMIT 101",
      );
      migrations = z.array(migrationSchema).max(100).parse(ledger.rows);
    }
    const migrationChecks = parsed.data.map((expected) => {
      const actual = migrations.find((m) => m.version === expected.version);
      return {
        version: expected.version,
        status: !actual
          ? "missing"
          : actual.checksum === expected.checksum
            ? "matching"
            : "checksum_mismatch",
      };
    });
    const unexpectedMigrations = migrations.filter(
      (actual) => !parsed.data.some((m) => m.version === actual.version),
    ).length;
    const duplicateMigrations =
      migrations.length - new Set(migrations.map((m) => m.version)).size;
    const schemaReady =
      extensions.length === 2 &&
      tables.every(
        (t) =>
          t.exists &&
          t.rlsEnabled &&
          t.publicReadPolicy &&
          t.writePolicies === 0 &&
          t.additionalReadPolicies === 0,
      ) &&
      views.every((v) => v.exists && v.securityInvoker) &&
      ledgerExists &&
      migrationChecks.every((m) => m.status === "matching") &&
      unexpectedMigrations === 0 &&
      duplicateMigrations === 0;
    stage = "rollback";
    await query("ROLLBACK");
    inTransaction = false;
    return {
      status: schemaReady ? "ok" : "incomplete",
      provider: "PostgreSQL",
      connectionVerified: true,
      schemaReady,
      tls: "certificate_verified",
      mode: "read_only",
      written: false,
      checkedAt: now().toISOString(),
      serverVersion: settingsRow.server_version,
      extensions,
      tables,
      views,
      ledger: {
        exists: ledgerExists,
        migrations: migrationChecks,
        unexpectedMigrations,
        duplicateMigrations,
      },
      privateDataAuthorization: "not_assessed",
      observationCounts: "not_queried",
    };
  };
  try {
    return await Promise.race([run(), deadline]);
  } catch (error) {
    throw safeError(error, stage);
  } finally {
    clearTimeout(timer);
    if (inTransaction && !expired) {
      await Promise.race([
        Promise.resolve()
          .then(() => client.query("ROLLBACK"))
          .catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    await Promise.race([
      close(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    void close().then(() => client.removeListener?.("error", quietError));
  }
}
