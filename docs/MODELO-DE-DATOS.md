# Modelo de datos

Base de datos PostgreSQL con PostGIS (Supabase). Nombres en inglés. Todas las fechas y horas en UTC. Geometrías en EPSG:4326. Este documento es la referencia para las migraciones en `supabase/migrations/`.

## 1. Extensiones y tipos

```sql
create extension if not exists postgis;
create extension if not exists pgcrypto;

create type sensor_family      as enum ('MODIS', 'VIIRS');
create type confidence_class   as enum ('low', 'nominal', 'high');
create type asset_type         as enum ('bomberos', 'defensa_civil', 'brigada_forestal', 'cruz_roja', 'coe', 'voluntario', 'otro');
create type availability_state as enum ('available', 'limited', 'unavailable', 'unknown');
create type incident_status    as enum ('open', 'monitoring', 'contained', 'closed', 'false_alarm');
create type severity_level     as enum ('low', 'medium', 'high');
create type notification_state as enum ('draft', 'pending_approval', 'queued', 'sent', 'failed', 'rejected');
create type actor_kind         as enum ('system', 'agent', 'human');
create type user_role          as enum ('user', 'coordinator', 'admin');
```

## 2. Datos de fuego y estadísticas

```sql
create table regions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  level       text not null check (level in ('country', 'province', 'custom')),
  parent_id   uuid references regions (id),
  geom        geometry(MultiPolygon, 4326) not null,
  area_km2    numeric not null,
  created_at  timestamptz not null default now()
);
create index regions_geom_idx on regions using gist (geom);

create table grid_cells (
  cell_id   bigint primary key,            -- iy * 36000 + ix, celdas de 0.01°
  centroid  geometry(Point, 4326) not null,
  region_id uuid references regions (id)   -- provincia que contiene el centroide (nivel más pequeño)
);
create index grid_cells_centroid_idx on grid_cells using gist (centroid);

create table raw_detections (
  id              bigserial primary key,
  source          text not null,                 -- p. ej. 'VIIRS_SNPP_SP'
  sensor          sensor_family not null,
  satellite       text not null,                 -- Terra, Aqua, N, N20, N21 (verificar valores reales del CSV)
  instrument      text,
  acq_at          timestamptz not null,
  acq_date        date not null,
  latitude        double precision not null,
  longitude       double precision not null,
  geom            geometry(Point, 4326) not null,
  confidence_raw  text,
  confidence      confidence_class not null,
  frp             numeric,
  brightness      numeric,
  daynight        char(1),
  is_nrt          boolean not null default false,
  cell_id         bigint not null,
  ingested_at     timestamptz not null default now(),
  unique (satellite, acq_at, latitude, longitude)
);
create index raw_detections_acq_idx  on raw_detections (acq_at desc);
create index raw_detections_geom_idx on raw_detections using gist (geom);
create index raw_detections_cell_idx on raw_detections (cell_id, acq_date);

-- Ocupación diaria por celda y familia (solo detecciones que pasan el filtro de confianza)
create table cell_day_occupancy (
  cell_id       bigint not null,
  day           date not null,
  sensor        sensor_family not null,
  n_detections  integer not null,
  max_frp       numeric,
  primary key (cell_id, day, sensor)
);

-- Agregado mensual por celda y familia
create table cell_month (
  cell_id        bigint not null,
  year           smallint not null,
  month          smallint not null check (month between 1 and 12),
  sensor         sensor_family not null,
  occupied_days  smallint not null,        -- celdas-día ocupadas (CDO) de esa celda en el mes
  n_detections   integer not null,
  frp_sum        numeric,
  primary key (cell_id, year, month, sensor)
);

create table calibration_factors (
  id               uuid primary key default gen_random_uuid(),
  region_id        uuid not null references regions (id),
  sensor_from      sensor_family not null default 'VIIRS',
  sensor_to        sensor_family not null default 'MODIS',
  month_of_year    smallint check (month_of_year between 1 and 12),  -- null = factor único
  factor           numeric not null,
  method           text not null,                 -- 'ratio_of_totals' | 'regression_origin'
  n_overlap_months integer not null,
  r2               numeric,
  period_start     date not null,
  period_end       date not null,
  method_version   text not null,
  fitted_at        timestamptz not null default now()
);

create table region_month_stats (
  region_id          uuid not null references regions (id),
  year               smallint not null,
  month              smallint not null check (month between 1 and 12),
  modis_cell_days    numeric,
  viirs_cell_days    numeric,
  harmonized_index   numeric,
  detections_modis   integer,
  detections_viirs   integer,
  is_partial         boolean not null default false,
  uses_nrt           boolean not null default false,
  terra_only         boolean not null default false,
  method_version     text not null,
  computed_at        timestamptz not null default now(),
  primary key (region_id, year, month)
);
```

La referencia histórica (mediana, p25, p75, p90, mínimo, máximo) se calcula al consultar, dejando fuera el año evaluado, a partir de `region_month_stats` (hay como máximo unos 27 valores por mes). No se guarda en tabla.

Consulta de referencia para un mes (ejemplo):

```sql
select
  percentile_cont(0.5)  within group (order by harmonized_index) as median,
  percentile_cont(0.25) within group (order by harmonized_index) as p25,
  percentile_cont(0.75) within group (order by harmonized_index) as p75,
  percentile_cont(0.90) within group (order by harmonized_index) as p90,
  min(harmonized_index) as min,
  max(harmonized_index) as max,
  count(*) as n_years
from region_month_stats
where region_id = $1 and month = $2 and year <> $3 and not is_partial;
```

Para un polígono dibujado, el índice se calcula al vuelo uniendo `cell_month` con `grid_cells` mediante `ST_Within(centroid, aoi)` y aplicando el factor de calibración correspondiente. El área del polígono se mide con `ST_Area(geography)`.

## 3. Usuarios, zonas e incidentes

```sql
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         user_role not null default 'user',
  locale       text not null default 'es',
  created_at   timestamptz not null default now()
);

create table monitored_zones (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  name              text not null,
  geom              geometry(Polygon, 4326) not null,
  area_km2          numeric not null,
  notify_email      text not null,
  email_verified_at timestamptz,
  min_confidence    confidence_class not null default 'nominal',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index monitored_zones_geom_idx on monitored_zones using gist (geom);

create table incidents (
  id                 uuid primary key default gen_random_uuid(),
  status             incident_status not null default 'open',
  severity           severity_level not null default 'low',
  severity_score     integer not null default 0,
  is_expanding       boolean not null default false,
  centroid           geometry(Point, 4326) not null,
  footprint          geometry(Geometry, 4326),
  region_id          uuid references regions (id),
  first_detected_at  timestamptz not null,
  last_detected_at   timestamptz not null,
  detection_count    integer not null default 0,
  max_frp            numeric,
  needs_agent        boolean not null default false,
  needs_agent_reason text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index incidents_centroid_idx on incidents using gist (centroid);
create index incidents_status_idx on incidents (status, last_detected_at desc);

create table incident_detections (
  incident_id  uuid not null references incidents (id) on delete cascade,
  detection_id bigint not null references raw_detections (id),
  primary key (incident_id, detection_id)
);
```

## 4. Activos y notificaciones

```sql
create table assets (
  id                      uuid primary key default gen_random_uuid(),
  type                    asset_type not null,
  name                    text not null,
  institution             text,
  geom                    geometry(Point, 4326) not null,
  address                 text,
  phone                   text,
  email                   text,
  coverage_radius_km      numeric,
  availability            availability_state not null default 'unknown',
  availability_updated_at timestamptz,
  source                  text not null,          -- de dónde salió el dato
  verified_at             timestamptz,
  is_demo                 boolean not null default false,
  active                  boolean not null default true
);
create index assets_geom_idx on assets using gist (geom);

create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  incident_id         uuid references incidents (id),
  audience            text not null check (audience in ('zone_user', 'asset', 'public')),
  zone_id             uuid references monitored_zones (id),
  asset_id            uuid references assets (id),
  user_id             uuid references profiles (id),
  channel             text not null check (channel in ('email', 'sms', 'whatsapp', 'phone_task', 'in_app')),
  recipient           text,                      -- correo o teléfono efectivo (en DEMO_MODE, la bandeja de pruebas)
  subject             text,
  body                text not null,
  status              notification_state not null default 'draft',
  created_by          actor_kind not null,
  agent_run_id        uuid,
  dedupe_key          text unique,
  approved_by         uuid references profiles (id),
  approved_at         timestamptz,
  sent_at             timestamptz,
  provider_message_id text,
  response            text,
  error               text,
  created_at          timestamptz not null default now()
);
create index notifications_incident_idx on notifications (incident_id, created_at desc);
```

Las «alertas» de un usuario son las filas de `notifications` con `audience = 'zone_user'`.

## 5. Agente de IA

```sql
create table agent_runs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid,
  trigger       text not null check (trigger in ('incident', 'user_chat', 'schedule')),
  user_id       uuid references profiles (id),
  incident_id   uuid references incidents (id),
  provider      text not null,
  model         text not null,
  status        text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  tokens_in     integer,
  tokens_out    integer,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table agent_messages (
  id         bigserial primary key,
  run_id     uuid not null references agent_runs (id) on delete cascade,
  role       text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content    jsonb not null,
  created_at timestamptz not null default now()
);

create table agent_tool_calls (
  id              bigserial primary key,
  run_id          uuid not null references agent_runs (id) on delete cascade,
  tool            text not null,
  input           jsonb not null,
  output          jsonb,
  has_side_effect boolean not null default false,
  policy_decision text,                      -- 'allowed' | 'needs_approval' | 'denied'
  created_at      timestamptz not null default now()
);

alter table notifications
  add constraint notifications_agent_run_fk foreign key (agent_run_id) references agent_runs (id);
```

## 6. Prevención, contenido y operación

```sql
create table prevention_events (
  id               uuid primary key default gen_random_uuid(),
  region_id        uuid references regions (id),
  title            text not null,
  description      text,
  type             text not null check (type in ('charla', 'limpieza', 'cortafuego', 'simulacro', 'capacitacion', 'otro')),
  starts_on        date not null,
  ends_on          date,
  status           text not null default 'draft' check (status in ('draft', 'planned', 'done', 'cancelled')),
  created_by       actor_kind not null,
  created_by_user  uuid references profiles (id),
  rationale        text,                      -- por qué se sugirió (estacionalidad, alertas recientes)
  created_at       timestamptz not null default now()
);

create table prevention_resources (
  id          uuid primary key default gen_random_uuid(),
  region_id   uuid references regions (id),
  title       text not null,
  url         text not null,
  organization text not null,
  category    text not null check (category in ('prevencion', 'extincion', 'reporte', 'primeros_auxilios')),
  verified_at timestamptz
);

create table safe_places (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('refugio', 'hospital', 'espacio_abierto', 'punto_encuentro')),
  name        text not null,
  geom        geometry(Point, 4326) not null,
  source      text not null,
  verified_at timestamptz,
  is_demo     boolean not null default false
);
create index safe_places_geom_idx on safe_places using gist (geom);

create table job_runs (
  id           bigserial primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows_read    integer,
  rows_written integer,
  cursor       text,                          -- para reanudar backfills
  error        text
);
```

## 7. Acceso por rol (RLS)

Activa `row level security` en todas las tablas y escribe las políticas en migraciones.

| Tabla | anonymous | user | coordinator | admin |
|---|---|---|---|---|
| `regions`, `region_month_stats`, `calibration_factors`, `prevention_resources`, `safe_places` | leer | leer | leer | todo |
| `raw_detections` (vía API, solo columnas públicas) | leer | leer | leer | todo |
| `monitored_zones` | nada | solo las propias | leer todas | todo |
| `notifications` | nada | solo `zone_user` propias | todas | todo |
| `incidents`, `incident_detections` | leer resumen público (sin correos ni datos de activos) | leer resumen | todo | todo |
| `assets` | nada | nada | leer y editar | todo |
| `agent_runs`, `agent_messages`, `agent_tool_calls` | nada | solo sus conversaciones de chat | todas | todo |
| `prevention_events` | leer los `planned` | leer, crear borradores propios | todo | todo |
| `job_runs` | nada | nada | leer | todo |

Las tareas programadas y el agente usan la clave de servicio en el servidor; nunca se expone al navegador.

## 8. Retención

- `agent_messages` del chat anónimo: 30 días.
- Ubicación compartida en el chat: solo dentro de la sesión, no se guarda en tablas.
- `notifications` y `agent_tool_calls`: se conservan para auditoría (definir plazo en `DECISIONES.md`).
- Zonas eliminadas por el usuario: borrado real, no lógico.
