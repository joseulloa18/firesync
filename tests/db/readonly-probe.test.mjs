import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import test from "node:test";
import {
  CORE_TABLES,
  CORE_VIEWS,
  DatabaseProbeError,
  probeReadonlyDatabase,
  readonlyClientConfig,
} from "../../scripts/lib/db-readonly-probe.mjs";

// Synthetic credentials and catalogue rows; no connection is made in tests.
const URL =
  "postgresql://synthetic:SYNTHETIC_PASSWORD@fixture.invalid:6543/postgres?sslmode=require";
const migrations = [
  { version: "20261114000100_initial_core", checksum: "a".repeat(64) },
];

function fixture(overrides = {}) {
  const queries = [];
  let ended = 0;
  let config;
  const relations = [
    ...CORE_TABLES.map((name) => ({
      name,
      kind: "r",
      rls: true,
      invoker: false,
    })),
    ...CORE_VIEWS.map((name) => ({
      name,
      kind: "v",
      rls: false,
      invoker: true,
    })),
    { name: "schema_migrations", kind: "r", rls: true, invoker: false },
  ];
  const client = {
    async connect() {
      if (overrides.connect) return overrides.connect();
    },
    async query(sql, values) {
      queries.push({ sql, values });
      if (overrides.query) {
        const result = overrides.query(sql, values);
        if (result !== undefined) return result;
      }
      if (sql.includes("server_version_num"))
        return { rows: [{ read_only: true, server_version: "170006" }] };
      if (sql.includes("pg_catalog.pg_extension"))
        return {
          rows: [
            { name: "postgis", version: "3.5.3" },
            { name: "pgcrypto", version: "1.3" },
          ],
        };
      if (sql.includes("pg_catalog.pg_class")) return { rows: relations };
      if (sql.includes("pg_catalog.pg_policies"))
        return {
          rows: CORE_TABLES.map((table) => ({
            table,
            command: "SELECT",
            public_read: true,
          })),
        };
      if (sql.includes("FROM public.schema_migrations"))
        return { rows: migrations };
      return { rows: [] };
    },
    async end() {
      ended++;
    },
  };
  const options = {
    databaseUrl: URL,
    expectedMigrations: migrations,
    createClient(value) {
      config = value;
      return client;
    },
    now: () => new Date("2026-11-15T18:30:00.000Z"),
  };
  return {
    options,
    client,
    queries,
    relations,
    get ended() {
      return ended;
    },
    get config() {
      return config;
    },
  };
}

test("valid configuration enforces verified TLS without forwarding URL query options", () => {
  const config = readonlyClientConfig(URL);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.host, "fixture.invalid");
  assert.equal(config.port, 6543);
  assert.equal(config.password, "SYNTHETIC_PASSWORD");
  assert.equal(config.connectionString, undefined);
  assert.equal(config.options, undefined);
  assert.equal(
    readonlyClientConfig(URL.replace("synthetic:", "synthetic%40role:")).user,
    "synthetic@role",
  );
});

test("missing or unsafe configuration fails before connecting without echoing credentials", async () => {
  for (const value of [
    "",
    undefined,
    "not a URL",
    URL + "&sslcert=file",
    URL + "&options=write",
    URL.replace("require", "disable"),
    URL.replace("postgresql:", "https:"),
    URL + "&sslmode=verify-full",
    URL.replace(":6543", ":99999"),
  ]) {
    assert.throws(
      () => readonlyClientConfig(value),
      (error) => {
        assert.ok(error instanceof DatabaseProbeError);
        assert.doesNotMatch(
          String(error),
          /SYNTHETIC_PASSWORD|fixture.invalid/,
        );
        assert.equal(error.cause, undefined);
        return true;
      },
    );
  }
  const f = fixture();
  await assert.rejects(
    probeReadonlyDatabase({ ...f.options, expectedMigrations: [] }),
    { code: "invalid_configuration" },
  );
  assert.equal(f.ended, 0);
});

test("successful verification only reads catalogues and ledger, then rolls back and closes", async () => {
  const f = fixture();
  const result = await probeReadonlyDatabase(f.options);
  assert.equal(result.status, "ok");
  assert.equal(result.connectionVerified, true);
  assert.equal(result.schemaReady, true);
  assert.equal(result.written, false);
  assert.equal(result.tables.length, 7);
  assert.equal(result.views.length, 2);
  assert.equal(result.privateDataAuthorization, "not_assessed");
  assert.equal(result.observationCounts, "not_queried");
  assert.match(f.queries[0].sql, /^BEGIN.*READ ONLY$/);
  assert.equal(f.queries.at(-1).sql, "ROLLBACK");
  assert.equal(f.ended, 1);
  assert.ok(
    f.queries.every(({ sql }) =>
      /^(BEGIN|SET LOCAL|SELECT|ROLLBACK)\b/.test(sql),
    ),
  );
  assert.ok(
    f.queries.every(
      ({ sql }) =>
        !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|DO|CALL|COMMIT)\b/.test(
          sql,
        ),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /SYNTHETIC_PASSWORD|fixture.invalid|synthetic@/,
  );
  assert.equal(f.config.ssl.rejectUnauthorized, true);
});

test("missing core tables or RLS and non-invoker views are reported incomplete", async () => {
  const f = fixture();
  f.relations.splice(
    f.relations.findIndex((row) => row.name === "raw_detections"),
    1,
  );
  f.relations.find((row) => row.name === "regions").rls = false;
  f.relations.find((row) => row.name === CORE_VIEWS[0]).invoker = false;
  const result = await probeReadonlyDatabase(f.options);
  assert.equal(result.status, "incomplete");
  assert.equal(result.connectionVerified, true);
  assert.equal(result.schemaReady, false);
  assert.equal(
    result.tables.find((t) => t.name === "raw_detections").exists,
    false,
  );
  assert.equal(
    result.tables.find((t) => t.name === "regions").rlsEnabled,
    false,
  );
  assert.equal(f.queries.at(-1).sql, "ROLLBACK");
});

test("missing or unexpected write policies and missing extensions do not claim readiness", async () => {
  const f = fixture({
    query(sql) {
      if (sql.includes("pg_catalog.pg_policies"))
        return {
          rows: [{ table: "regions", command: "ALL", public_read: false }],
        };
      if (sql.includes("pg_catalog.pg_extension"))
        return { rows: [{ name: "pgcrypto", version: "1.3" }] };
    },
  });
  const result = await probeReadonlyDatabase(f.options);
  assert.equal(result.schemaReady, false);
  assert.equal(result.tables[0].writePolicies, 1);
  assert.equal(result.tables[0].publicReadPolicy, false);
});

test("ledger comparison reports missing, modified and unknown migrations", async () => {
  for (const [rows, expected, unexpected] of [
    [[], "missing", 0],
    [[{ ...migrations[0], checksum: "b".repeat(64) }], "checksum_mismatch", 0],
    [
      [
        ...migrations,
        { version: "20261115000000_unknown", checksum: "b".repeat(64) },
      ],
      "matching",
      1,
    ],
  ]) {
    const f = fixture({
      query(sql) {
        if (sql.includes("FROM public.schema_migrations")) return { rows };
      },
    });
    const result = await probeReadonlyDatabase(f.options);
    assert.equal(result.schemaReady, false);
    assert.equal(result.ledger.migrations[0].status, expected);
    assert.equal(result.ledger.unexpectedMigrations, unexpected);
  }
});

test("missing ledger is incomplete without attempting to create or read it", async () => {
  const f = fixture();
  f.relations.splice(
    f.relations.findIndex((r) => r.name === "schema_migrations"),
    1,
  );
  const result = await probeReadonlyDatabase(f.options);
  assert.equal(result.ledger.exists, false);
  assert.equal(result.schemaReady, false);
  assert.ok(
    !f.queries.some(({ sql }) => sql.includes("FROM public.schema_migrations")),
  );
});

test("additional restrictive read policies and duplicate ledger rows cannot claim readiness", async () => {
  const f = fixture({
    query(sql) {
      if (sql.includes("pg_catalog.pg_policies"))
        return {
          rows: [
            ...CORE_TABLES.map((table) => ({
              table,
              command: "SELECT",
              public_read: true,
            })),
            { table: "regions", command: "SELECT", public_read: false },
          ],
        };
      if (sql.includes("FROM public.schema_migrations"))
        return { rows: [...migrations, ...migrations] };
    },
  });
  const result = await probeReadonlyDatabase(f.options);
  assert.equal(result.status, "incomplete");
  assert.equal(result.tables[0].additionalReadPolicies, 1);
  assert.equal(result.ledger.duplicateMigrations, 1);
});

test("driver errors are classified safely and cleanup rolls back on query failure", async () => {
  for (const [code, expected] of [
    ["42501", "permission_denied"],
    ["28P01", "authentication_failed"],
    ["57014", "query_timeout"],
    ["ENOTFOUND", "dns_error"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "tls_error"],
    [undefined, "verification_failed"],
  ]) {
    const f = fixture({
      query(sql) {
        if (sql.includes("pg_catalog.pg_class")) {
          const error = new Error(URL, { cause: "SYNTHETIC_PASSWORD" });
          error.code = code;
          throw error;
        }
      },
    });
    await assert.rejects(probeReadonlyDatabase(f.options), (error) => {
      assert.equal(error.code, expected);
      assert.equal(error.stage, "schema");
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(
        String(error) + error.stack,
        /SYNTHETIC_PASSWORD|fixture.invalid/,
      );
      return true;
    });
    assert.equal(f.queries.at(-1).sql, "ROLLBACK");
    assert.equal(f.ended, 1);
  }
});

test("failure to establish read-only state prevents any catalogue read", async () => {
  const f = fixture({
    query(sql) {
      if (sql.includes("server_version_num"))
        return { rows: [{ read_only: false, server_version: "170006" }] };
    },
  });
  await assert.rejects(probeReadonlyDatabase(f.options), {
    code: "verification_failed",
    stage: "transaction",
  });
  assert.ok(!f.queries.some(({ sql }) => sql.includes("pg_catalog.pg_class")));
  assert.equal(f.queries.at(-1).sql, "ROLLBACK");
});

test("total timeout ends a stalled connection and never proceeds to queries", async () => {
  const f = fixture({ connect: () => new Promise(() => {}) });
  await assert.rejects(probeReadonlyDatabase({ ...f.options, timeoutMs: 10 }), {
    code: "timeout",
    stage: "connect",
  });
  assert.equal(f.queries.length, 0);
  assert.equal(f.ended, 1);
});

test("CLI help and missing configuration need no database and never echo arguments", () => {
  const env = { ...process.env, DATABASE_URL: "" };
  const script = "scripts/db-readonly-smoke.mjs";
  const help = spawnSync(process.execPath, [script, "--help"], {
    env,
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  const missing = spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).code, "missing_database_url");
  const unknown = spawnSync(process.execPath, [script, "--url", URL], {
    env,
    encoding: "utf8",
  });
  assert.equal(unknown.status, 1);
  assert.equal(JSON.parse(unknown.stderr).code, "invalid_arguments");
  assert.doesNotMatch(unknown.stderr, /SYNTHETIC_PASSWORD|fixture.invalid/);
});

// Only the existing ephemeral CI database; never a configured remote project.
let ephemeralUrl;
try {
  const candidate = new globalThis.URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.CI === "true" &&
    ["localhost", "127.0.0.1"].includes(candidate.hostname) &&
    candidate.pathname === "/firesync_test"
  ) {
    ephemeralUrl = candidate.href;
  }
} catch {
  /* No ephemeral database in the local unit-test environment. */
}
test(
  "catalogue SQL runs read-only against ephemeral PostGIS in CI",
  { skip: !ephemeralUrl },
  async () => {
    const filename = "20261114000100_initial_core.sql";
    const expected = [
      {
        version: filename.slice(0, -4),
        checksum: createHash("sha256")
          .update(
            readFileSync(
              new globalThis.URL(
                "../../supabase/migrations/" + filename,
                import.meta.url,
              ),
            ),
          )
          .digest("hex"),
      },
    ];
    const result = await probeReadonlyDatabase({
      databaseUrl: URL,
      expectedMigrations: expected,
      createClient(config) {
        assert.equal(config.ssl.rejectUnauthorized, true);
        // The CI service intentionally has no TLS. Production CLI never uses
        // this adapter and always passes the strictly verified TLS config.
        return new Client({
          connectionString: ephemeralUrl,
          query_timeout: 6_000,
          connectionTimeoutMillis: 5_000,
        });
      },
    });
    assert.equal(result.schemaReady, true);
    assert.equal(result.written, false);
  },
);
