import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const migrationName = readdirSync(migrationsDir).find((name) => name.endsWith('.sql'));
const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8');
const runner = readFileSync(path.join(root, 'scripts', 'db-migrate.mjs'), 'utf8');

const tables = [
  'regions',
  'grid_cells',
  'raw_detections',
  'cell_day_occupancy',
  'cell_month',
  'calibration_factors',
  'region_month_stats',
];

test('la migración crea el núcleo y activa RLS en todas las tablas', () => {
  assert.match(migrationName, /^\d{14}_[a-z0-9_]+\.sql$/);
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'));
    assert.match(sql, new RegExp(`on public\\.${table} for select using \\(true\\);`, 'i'));
  }
});

test('los agregados separan source y satellite en la clave primaria', () => {
  assert.match(
    sql,
    /primary key \(cell_id, day, source, satellite\)/i,
  );
  assert.match(
    sql,
    /primary key \(cell_id, year, month, source, satellite\)/i,
  );
});

test('la serie elegible excluye NOAA y MODIS_NRT', () => {
  const generated = sql.match(/series_eligible boolean generated always as \(([\s\S]*?)\) stored/i);
  assert.ok(generated, 'falta series_eligible');
  assert.match(generated[1], /MODIS_SP/);
  assert.match(generated[1], /VIIRS_SNPP_SP/);
  assert.match(generated[1], /VIIRS_SNPP_NRT/);
  assert.doesNotMatch(generated[1], /NOAA|MODIS_NRT/);
});

test('calibración resuelve el mes nullable fuera de la PK', () => {
  assert.doesNotMatch(sql, /primary key \([^)]*month_of_year/i);
  assert.match(sql, /where month_of_year is not null;/i);
  assert.match(sql, /where month_of_year is null;/i);
});

test('el runner requiere DATABASE_URL y usa transacción/versionado', () => {
  assert.match(runner, /process\.env\.DATABASE_URL/);
  assert.match(runner, /from 'pg'/);
  assert.match(runner, /schema_migrations/);
  assert.match(runner, /client\.query\('begin'\)/);
  assert.match(runner, /client\.query\('commit'\)/);
  assert.match(runner, /client\.query\('rollback'\)/);
  assert.match(runner, /checksum/);
  assert.doesNotMatch(runner, /console\.log\([^)]*DATABASE_URL/i);
});
