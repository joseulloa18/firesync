// Aplica migraciones SQL versionadas de FIRESYNC con una sola transacción.
// Requiere DATABASE_URL y el paquete `pg`. Nunca imprime la cadena de conexión.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve('supabase/migrations');
const FILE_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function redact(text) {
  let out = String(text ?? '');
  const url = process.env.DATABASE_URL;
  if (url) {
    out = out.split(url).join('[DATABASE_URL]');
    try {
      const password = new URL(url).password;
      if (password) out = out.split(decodeURIComponent(password)).join('[REDACTED]');
    } catch {}
  }
  return out.replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_URL]');
}

async function loadMigrations() {
  const names = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  if (names.length === 0) throw new Error('No hay migraciones en supabase/migrations.');
  const migrations = [];
  for (const name of names) {
    if (!FILE_PATTERN.test(name)) {
      throw new Error(`Nombre de migración inválido: ${name}. Usa AAAAMMDDHHMMSS_descripcion.sql.`);
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    migrations.push({ version: name.slice(0, -4), checksum: sha256(sql), sql });
  }
  return migrations;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL es obligatoria para aplicar migraciones.');
    process.exitCode = 1;
    return;
  }
  const migrations = await loadMigrations();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: 'firesync-db-migrate',
  });
  try {
    await client.connect();
    await client.query('begin');
    await client.query("select pg_advisory_xact_lock(hashtext('firesync:schema_migrations'))");
    await client.query(`
      create table if not exists public.schema_migrations (
        version    text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      );
    `);
    const { rows } = await client.query(
      'select version, checksum from public.schema_migrations order by version',
    );
    const applied = new Map(rows.map((row) => [row.version, row.checksum]));
    const local = new Set(migrations.map((migration) => migration.version));
    for (const [version, checksum] of applied) {
      if (!local.has(version)) {
        throw new Error(`La base contiene una migración ausente en el repo: ${version}`);
      }
      const current = migrations.find((migration) => migration.version === version);
      if (current.checksum !== checksum) {
        throw new Error(`Checksum distinto para una migración ya aplicada: ${version}`);
      }
    }
    const pending = migrations.filter((migration) => !applied.has(migration.version));
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        'insert into public.schema_migrations (version, checksum) values ($1, $2)',
        [migration.version, migration.checksum],
      );
      console.log(`Aplicada: ${migration.version}`);
    }
    await client.query('commit');
    console.log(pending.length === 0 ? 'Sin migraciones pendientes.' : `${pending.length} migración(es) aplicada(s).`);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error(`Migración fallida: ${redact(error.message)}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Migración fallida: ${redact(error.message)}`);
  process.exitCode = 1;
});
