import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith(".sql"),
);
const sql = readFileSync(path.join(migrationsDir, migrationName), "utf8");

const tables = [
  "regions",
  "grid_cells",
  "raw_detections",
  "cell_day_occupancy",
  "cell_month",
  "calibration_factors",
  "region_month_stats",
];

test("la migración crea el núcleo y activa RLS en todas las tablas", () => {
  assert.match(migrationName, /^\d{14}_[a-z0-9_]+\.sql$/);
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, "i"));
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table} enable row level security;`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(`on public\\.${table} for select using \\(true\\);`, "i"),
    );
  }
});

test("raw_detections guarda campos del parser y valida satélite/fecha UTC", () => {
  assert.match(sql, /\bscan\s+numeric/i);
  assert.match(sql, /\btrack\s+numeric/i);
  assert.match(sql, /\bbrightness2\s+numeric/i);
  assert.match(
    sql,
    /source in \('MODIS_SP', 'MODIS_NRT'\) and satellite in \('Terra', 'Aqua'\)/i,
  );
  assert.match(
    sql,
    /source in \('VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT'\) and satellite = 'S-NPP'/i,
  );
  assert.match(
    sql,
    /source in \('VIIRS_NOAA20_SP', 'VIIRS_NOAA20_NRT'\) and satellite = 'NOAA-20'/i,
  );
  assert.match(
    sql,
    /source in \('VIIRS_NOAA21_SP', 'VIIRS_NOAA21_NRT'\) and satellite = 'NOAA-21'/i,
  );
  assert.match(sql, /acq_date = \(acq_at at time zone 'UTC'\)::date/i);
});

test("los agregados separan source y satellite en la clave primaria", () => {
  assert.match(sql, /primary key \(cell_id, day, source, satellite\)/i);
  assert.match(sql, /primary key \(cell_id, year, month, source, satellite\)/i);
});

test("la serie elegible excluye NOAA y MODIS_NRT", () => {
  const generated = sql.match(
    /series_eligible boolean generated always as \(([\s\S]*?)\) stored/i,
  );
  assert.ok(generated, "falta series_eligible");
  assert.match(generated[1], /MODIS_SP/);
  assert.match(generated[1], /VIIRS_SNPP_SP/);
  assert.match(generated[1], /VIIRS_SNPP_NRT/);
  assert.doesNotMatch(generated[1], /NOAA|MODIS_NRT/);
});

test("calibración resuelve el mes nullable fuera de la PK", () => {
  assert.doesNotMatch(sql, /primary key \([^)]*month_of_year/i);
  assert.match(sql, /where month_of_year is not null;/i);
  assert.match(sql, /where month_of_year is null;/i);
  assert.match(sql, /factor\s+numeric not null check \(factor >= 0\)/i);
  assert.match(sql, /r2\s+numeric check \(r2 is null or r2 <= 1\)/i);
  assert.doesNotMatch(sql, /r2 >= 0/i);
});

test("las vistas históricas son security_invoker y colapsan satélites", () => {
  assert.match(
    sql,
    /create view public\.historical_product_detections\s+with \(security_invoker = true\)/i,
  );
  assert.match(
    sql,
    /create view public\.historical_cell_day_occupancy\s+with \(security_invoker = true\)/i,
  );
  assert.match(sql, /bool_or\(source = 'VIIRS_SNPP_SP'\)/i);
  assert.match(sql, /group by cell_id, acq_date, satellite/i);
  assert.match(
    sql,
    /join sp_available s using \(cell_id, acq_date, satellite\)/i,
  );
  assert.match(sql, /where not s\.has_sp or e\.source = 'VIIRS_SNPP_SP'/i);
  assert.match(sql, /group by cell_id, acq_date, sensor/i);
});

test("service_role escribe solo si existe y public no gana escritura", () => {
  assert.match(
    sql,
    /if exists \(select 1 from pg_catalog\.pg_roles where rolname = 'service_role'\)/i,
  );
  assert.match(
    sql,
    /grant insert, update, delete on table[\s\S]*?to service_role/i,
  );
  assert.match(
    sql,
    /grant usage, select on sequence public\.raw_detections_id_seq[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:insert|update|delete)[^;]*\bto public\b/i,
  );
});

test("el runner rechaza una ejecución sin DATABASE_URL antes de conectar", () => {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  const result = spawnSync(process.execPath, ["scripts/db-migrate.mjs"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL es obligatoria/);
  assert.equal(result.stdout, "");
});
