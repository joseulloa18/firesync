# Validación PostGIS del núcleo de datos

Verificación automática de `supabase/migrations/20261114000100_initial_core.sql`.
**La migración aún no se aplicó a una base local ni a Supabase real en esta
tarea.** La evidencia se obtiene en CI con `postgis/postgis:16-3.5`; en local
solo se ejecutan comprobaciones estáticas y de Node.

## Qué valida la CI
`.github/workflows/database.yml` levanta PostGIS efímero con `DATABASE_URL`
local, instala con lockfile congelado, crea `anon` y `service_role` (con
`BYPASSRLS`), aplica migraciones con `scripts/db-migrate.mjs` y ejecuta
`scripts/db-check.mjs` y `pnpm test:db`.

`scripts/db-check.mjs` trabaja en una transacción y hace `ROLLBACK`: sus fixtures
sintéticos nunca persisten. Comprueba que Terra + Aqua producen una sola CDO, que
un SP en la celda A no elimina el NRT de la celda B, que `anon` lee pero su
`INSERT` falla con SQLSTATE `42501` (recuperado con `SAVEPOINT`) y que
`service_role` escribe usando `raw_detections_id_seq`.

## Permisos y limitación SP
Las siete tablas conceden solo `SELECT` a `public`. La escritura para
`service_role` (INSERT, UPDATE, DELETE y secuencia) se ejecuta solo si el rol
existe, porque el núcleo también corre en PostgreSQL sin Supabase. No se amplía
la escritura a `public`, `anon` ni `authenticated`.
`historical_product_detections` prefiere SP sobre NRT por celda, día y satélite,
lo que evita borrar NRT de celdas sin SP. No demuestra cobertura SP completa:
hará falta un manifiesto de productos en una tarea futura.
