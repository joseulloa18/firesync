-- FIRESYNC: núcleo de datos FIRMS (MODIS + VIIRS).
-- Aplicada por scripts/db-migrate.mjs dentro de una única transacción.
-- No incluir BEGIN/COMMIT en las migraciones: el runner controla la transacción.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

create type public.sensor_family as enum ('MODIS', 'VIIRS');
create type public.confidence_class as enum ('low', 'nominal', 'high');

create table public.regions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  level       text not null check (level in ('country', 'province', 'custom')),
  parent_id   uuid references public.regions (id),
  geom        geometry(MultiPolygon, 4326) not null,
  area_km2    numeric(14, 3) not null check (area_km2 > 0),
  created_at  timestamptz not null default now(),
  constraint regions_parent_not_self check (parent_id is null or parent_id <> id),
  constraint regions_geom_valid check (ST_IsValid(geom))
);
create index regions_geom_idx on public.regions using gist (geom);
create index regions_parent_idx on public.regions (parent_id);

create table public.grid_cells (
  cell_id   bigint primary key check (cell_id >= 0),
  centroid  geometry(Point, 4326) not null,
  region_id uuid references public.regions (id) on delete set null,
  constraint grid_cells_centroid_valid check (
    ST_X(centroid) between -180 and 180 and ST_Y(centroid) between -90 and 90
  )
);
create index grid_cells_centroid_idx on public.grid_cells using gist (centroid);
create index grid_cells_region_idx on public.grid_cells (region_id);

create table public.raw_detections (
  id              bigserial primary key,
  source          text not null check (source in (
                    'MODIS_SP', 'MODIS_NRT',
                    'VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT',
                    'VIIRS_NOAA20_SP', 'VIIRS_NOAA20_NRT',
                    'VIIRS_NOAA21_SP', 'VIIRS_NOAA21_NRT'
                  )),
  sensor          public.sensor_family not null,
  satellite       text not null check (btrim(satellite) <> ''),
  instrument      text,
  acq_at          timestamptz not null,
  acq_date        date not null,
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  geom            geometry(Point, 4326) not null,
  confidence_raw  text,
  confidence      public.confidence_class not null,
  frp             numeric check (frp is null or frp >= 0),
  brightness      numeric check (brightness is null or brightness >= 0),
  brightness2     numeric check (brightness2 is null or brightness2 >= 0),
  scan            numeric,
  track           numeric,
  daynight        char(1) check (daynight is null or daynight in ('D', 'N')),
  is_nrt          boolean not null default false,
  cell_id         bigint not null references public.grid_cells (cell_id),
  ingested_at     timestamptz not null default now(),
  series_eligible boolean generated always as (
                    source in ('MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT')
                  ) stored,
  constraint raw_detections_source_sensor_check check (
    (source like 'MODIS%' and sensor = 'MODIS')
    or (source like 'VIIRS%' and sensor = 'VIIRS')
  ),
  constraint raw_detections_source_satellite_check check (
    (source in ('MODIS_SP', 'MODIS_NRT') and satellite in ('Terra', 'Aqua'))
    or (source in ('VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT') and satellite = 'S-NPP')
    or (source in ('VIIRS_NOAA20_SP', 'VIIRS_NOAA20_NRT') and satellite = 'NOAA-20')
    or (source in ('VIIRS_NOAA21_SP', 'VIIRS_NOAA21_NRT') and satellite = 'NOAA-21')
  ),
  constraint raw_detections_acq_date_utc_check check (
    acq_date = (acq_at at time zone 'UTC')::date
  ),
  constraint raw_detections_nrt_check check (is_nrt = (right(source, 4) = '_NRT')),
  constraint raw_detections_geom_check check (
    abs(ST_X(geom) - longitude) < 1e-9 and abs(ST_Y(geom) - latitude) < 1e-9
  ),
  unique (satellite, acq_at, latitude, longitude)
);
create index raw_detections_acq_idx on public.raw_detections (acq_at desc);
create index raw_detections_geom_idx on public.raw_detections using gist (geom);
create index raw_detections_cell_idx on public.raw_detections (cell_id, acq_date);
create index raw_detections_series_idx
  on public.raw_detections (cell_id, acq_date, source, satellite)
  where series_eligible;

-- source y satellite forman parte de la clave: NOAA-20/21 nunca se suman con S-NPP.
comment on table public.raw_detections is
  'Detecciones FIRMS. series_eligible excluye NOAA y MODIS_NRT del histórico.';

create table public.cell_day_occupancy (
  cell_id       bigint not null references public.grid_cells (cell_id) on delete cascade,
  day           date not null,
  source        text not null,
  satellite     text not null,
  sensor        public.sensor_family not null,
  n_detections  integer not null check (n_detections > 0),
  max_frp       numeric check (max_frp is null or max_frp >= 0),
  primary key (cell_id, day, source, satellite)
);
create index cell_day_occupancy_day_idx on public.cell_day_occupancy (day desc);
comment on table public.cell_day_occupancy is
  'CDO por celda, día, origen y satélite. No mezclar S-NPP con NOAA.';

create table public.cell_month (
  cell_id        bigint not null references public.grid_cells (cell_id) on delete cascade,
  year           smallint not null check (year between 2000 and 2100),
  month          smallint not null check (month between 1 and 12),
  source         text not null,
  satellite      text not null,
  sensor         public.sensor_family not null,
  occupied_days  smallint not null check (occupied_days between 0 and 31),
  n_detections   integer not null check (n_detections >= 0),
  frp_sum        numeric check (frp_sum is null or frp_sum >= 0),
  primary key (cell_id, year, month, source, satellite)
);
create index cell_month_period_idx on public.cell_month (year, month, source);
comment on table public.cell_month is
  'Agregado mensual por celda y origen. La serie histórica filtra S-NPP y MODIS_SP.';

create table public.calibration_factors (
  id                uuid primary key default gen_random_uuid(),
  region_id         uuid not null references public.regions (id) on delete cascade,
  sensor_from       public.sensor_family not null default 'VIIRS',
  sensor_to         public.sensor_family not null default 'MODIS',
  month_of_year     smallint check (month_of_year between 1 and 12),
  factor            numeric not null check (factor >= 0),
  method            text not null check (method in ('ratio_of_totals', 'regression_origin')),
  n_overlap_months  integer not null check (n_overlap_months > 0),
  r2                numeric check (r2 is null or r2 <= 1),
  period_start      date not null,
  period_end        date not null,
  method_version    text not null check (btrim(method_version) <> ''),
  fitted_at         timestamptz not null default now(),
  constraint calibration_factors_sensors_differ check (sensor_from <> sensor_to),
  constraint calibration_factors_period_check check (period_start <= period_end)
);
-- month_of_year es nullable y no forma parte de la PK. Se garantiza unicidad
-- con dos índices parciales (compatible con PostgreSQL anterior a NULLS NOT DISTINCT).
create unique index calibration_factors_month_uidx
  on public.calibration_factors
  (region_id, sensor_from, sensor_to, method, method_version, month_of_year)
  where month_of_year is not null;
create unique index calibration_factors_single_uidx
  on public.calibration_factors
  (region_id, sensor_from, sensor_to, method, method_version)
  where month_of_year is null;
create index calibration_factors_region_idx on public.calibration_factors (region_id, fitted_at desc);

create table public.region_month_stats (
  region_id         uuid not null references public.regions (id) on delete cascade,
  year              smallint not null check (year between 2000 and 2100),
  month             smallint not null check (month between 1 and 12),
  modis_cell_days   numeric check (modis_cell_days is null or modis_cell_days >= 0),
  viirs_cell_days   numeric check (viirs_cell_days is null or viirs_cell_days >= 0),
  harmonized_index  numeric check (harmonized_index is null or harmonized_index >= 0),
  detections_modis  integer check (detections_modis is null or detections_modis >= 0),
  detections_viirs  integer check (detections_viirs is null or detections_viirs >= 0),
  is_partial        boolean not null default false,
  uses_nrt          boolean not null default false,
  terra_only        boolean not null default false,
  method_version    text not null check (btrim(method_version) <> ''),
  computed_at       timestamptz not null default now(),
  primary key (region_id, year, month)
);
create index region_month_stats_period_idx on public.region_month_stats (year, month);

-- RLS: lectura pública; anon/authenticated no tienen políticas de escritura.
-- service_role (BYPASSRLS) es el único camino de escritura previsto.
alter table public.regions enable row level security;
alter table public.grid_cells enable row level security;
alter table public.raw_detections enable row level security;
alter table public.cell_day_occupancy enable row level security;
alter table public.cell_month enable row level security;
alter table public.calibration_factors enable row level security;
alter table public.region_month_stats enable row level security;

create policy regions_public_read on public.regions for select using (true);
create policy grid_cells_public_read on public.grid_cells for select using (true);
create policy raw_detections_public_read on public.raw_detections for select using (true);
create policy cell_day_occupancy_public_read on public.cell_day_occupancy for select using (true);
create policy cell_month_public_read on public.cell_month for select using (true);
create policy calibration_factors_public_read on public.calibration_factors for select using (true);
create policy region_month_stats_public_read on public.region_month_stats for select using (true);

grant select on public.regions to public;
grant select on public.grid_cells to public;
grant select on public.raw_detections to public;
grant select on public.cell_day_occupancy to public;
grant select on public.cell_month to public;
grant select on public.calibration_factors to public;
grant select on public.region_month_stats to public;

-- Supabase crea service_role con BYPASSRLS. Fuera de Supabase el rol puede no
-- existir: en ese caso se omite el grant sin fallar la migración. Nunca se
-- concede escritura a public/anon/authenticated.
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public, extensions to service_role';
    execute 'grant insert, update, delete on table
      public.regions, public.grid_cells, public.raw_detections,
      public.cell_day_occupancy, public.cell_month,
      public.calibration_factors, public.region_month_stats
      to service_role';
    execute 'grant usage, select on sequence public.raw_detections_id_seq
      to service_role';
  end if;
end
$$;

-- Vistas de la CDO histórica. security_invoker respeta la RLS y los privilegios
-- del llamador. Primero se prefiere SP sobre NRT por celda/satélite/día; después
-- se colapsa a una fila por celda/día/sensor. Terra + Aqua en la misma
-- celda/día cuentan una sola CDO, no dos.
-- Limitación: saber si un día/satélite tiene cobertura SP completa requiere un
-- manifiesto de productos; esta vista solo detecta SP ya ingerido por celda.
create view public.historical_product_detections
with (security_invoker = true) as
with eligible as (
  select id, cell_id, source, sensor, satellite, acq_at, acq_date, confidence, frp, geom
  from public.raw_detections
  where source in ('MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_SNPP_NRT')
    and confidence <> 'low'
),
sp_available as (
  select cell_id, acq_date, satellite, bool_or(source = 'VIIRS_SNPP_SP') as has_sp
  from eligible
  group by cell_id, acq_date, satellite
)
select e.id, e.cell_id, e.source, e.sensor, e.satellite, e.acq_at, e.acq_date,
       e.confidence, e.frp, e.geom
from eligible e
join sp_available s using (cell_id, acq_date, satellite)
where not s.has_sp or e.source = 'VIIRS_SNPP_SP';

create view public.historical_cell_day_occupancy
with (security_invoker = true) as
select cell_id,
       acq_date as day,
       sensor,
       count(*)::integer as n_detections,
       max(frp) as max_frp,
       array_agg(distinct satellite order by satellite) as satellites
from public.historical_product_detections
group by cell_id, acq_date, sensor;

grant select on public.historical_product_detections to public;
grant select on public.historical_cell_day_occupancy to public;

comment on view public.historical_cell_day_occupancy is
  'CDO histórica: una fila por celda/día/sensor. Terra y Aqua se colapsan; no sumar occupied_days por satélite.';
