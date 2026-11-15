# Contratos iniciales de base de datos

Documento de entrega de la tarea ESQUEMA. Corresponde a la migración
`supabase/migrations/20261114000100_initial_core.sql` y al runner
`scripts/db-migrate.mjs`.

## Alcance entregado

Esta primera migración crea únicamente el núcleo necesario para ingesta y
armonización:

| Tabla | Contrato |
|---|---|
| `regions` | País, provincias y polígonos personalizados; geometría `MultiPolygon(4326)` y área en km². |
| `grid_cells` | Cuadrícula de 0.01°; `cell_id = iy * 36000 + ix`, centroide y región opcional. |
| `raw_detections` | Detecciones FIRMS con `source`, `satellite`, fecha UTC, confianza normalizada, FRP y geometría. |
| `cell_day_occupancy` | CDO por celda, día, **source y satellite**. |
| `cell_month` | Agregado mensual por celda, **source y satellite**. |
| `calibration_factors` | Factores VIIRS→MODIS por región, método y versión. |
| `region_month_stats` | Serie mensual armonizada por región. |

Tipos creados: `sensor_family` (`MODIS`, `VIIRS`) y `confidence_class`
(`low`, `nominal`, `high`).

## Decisiones de contrato

### Separación de satélite en agregados

`cell_day_occupancy` y `cell_month` incluyen `source` y `satellite` en su clave
primaria. Nunca se suman filas de S-NPP con NOAA-20/21 ni con otro origen.

Series históricas y de comparación deben filtrar explícitamente:

```sql
source in ('MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT')
```

`raw_detections.series_eligible` aplica ese filtro a nivel de fila y excluye
`MODIS_NRT` y todos los orígenes NOAA. NOAA-20/21 puede almacenarse para
Actualidad y alertas, pero no entra en el índice histórico.

### Calibración con mes nullable

`month_of_year` es nullable y **no** forma parte de la clave primaria. La
unicidad se resuelve con dos índices parciales:

- factor único: `(region_id, sensor_from, sensor_to, method, method_version)`
  donde `month_of_year is null`;
- factor mensual: la misma clave más `month_of_year` donde no es null.

Así pueden coexistir el factor anual y los factores por mes del año sin usar
`NULLS NOT DISTINCT` (compatible con PostgreSQL anteriores a 15).

### RLS y escritura

Las siete tablas tienen RLS activado y una política de `select` pública. No hay
políticas de escritura para `anon` ni `authenticated`: la ingesta y el cálculo
de agregados deben usar `service_role` desde el servidor, que evita RLS.

Se concede `select` a `public` sobre las siete tablas. Los roles de Supabase
(`anon`, `authenticated`, `service_role`) deben existir en el proyecto de
destino.

### Índices espaciales y de consulta

- GiST: `regions.geom`, `grid_cells.centroid`, `raw_detections.geom`.
- Fechas: `acq_at`, `cell_day_occupancy.day`, `cell_month(year, month)`.
- Ingesta: `(cell_id, acq_date)` y `(cell_id, acq_date, source, satellite)`
  parcial para `series_eligible`.
- Calibración: índices únicos parciales y `(region_id, fitted_at desc)`.

## Runner de migraciones

`scripts/db-migrate.mjs`:

- exige `DATABASE_URL`; no aplica nada ni simula éxito si falta;
- ordena archivos `AAAAMMDDHHMMSS_descripcion.sql`;
- registra versión y checksum SHA-256 en `public.schema_migrations`;
- rechaza checksums alterados o versiones aplicadas que faltan del repo;
- aplica todas las pendientes dentro de una transacción y con bloqueo
  consultivo; ante error hace `rollback`;
- no imprime la URL de conexión ni la contraseña en los errores.

Dependencias: Node LTS, paquete npm `pg`, PostgreSQL con PostGIS y pgcrypto, y
`DATABASE_URL`. El script de `package.json` (`pnpm db:migrate`) lo conectará el
responsable de la base de la aplicación; esta tarea no modifica
`package.json`.

Las migraciones no deben contener `BEGIN`/`COMMIT`: el runner controla la
transacción. El namespace `extensions` y `auth.users` son dependencias de
Supabase; esta migración no crea usuarios.

## Pendiente para fases posteriores

No se entregan todavía: `profiles`, `monitored_zones`, tokens de verificación o
baja (solo hash), `incidents`, `incident_events`, `incident_detections`,
`assets`, `notifications`, tablas del agente, prevención, lugares seguros,
`job_runs`, vistas materializadas de estadísticas ni cargas de datos reales.

También queda pendiente decidir si los agregados separan además por
`instrument` o si `satellite` es suficiente para la reconciliación NRT/SP.

## Verificación de esta entrega

- `node --check scripts/db-migrate.mjs` (sintaxis).
- Revisión estática de la migración: tablas, claves, índices, RLS y filtro de
  series.
- Pruebas de contrato en `tests/db/`.

El SQL **no se ejecutó** en esta estación porque no hay una instancia PostgreSQL
disponible. No se afirma que la migración haya sido aplicada ni validada contra
datos reales.
