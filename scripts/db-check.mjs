// Humo PostGIS: fixtures sintéticos en transacción, aserciones y ROLLBACK.
// Requiere DATABASE_URL y roles anon/service_role (la CI los crea).
import assert from "node:assert/strict";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL es obligatoria para db-check.");
  process.exit(1);
}
const client = new Client({
  connectionString: url,
  application_name: "db-check",
});
const CELL_A = 910001;
const CELL_B = 910002;

async function detection([source, satellite, cellId, lon, lat, at]) {
  const sensor = source.startsWith("MODIS") ? "MODIS" : "VIIRS";
  await client.query(
    `insert into public.raw_detections
       (source, sensor, satellite, acq_at, acq_date, latitude, longitude,
        geom, confidence, is_nrt, cell_id)
     values ($1, $2, $3, $4::timestamptz,
             ($4::timestamptz at time zone 'UTC')::date, $5, $6,
             ST_SetSRID(ST_MakePoint($6, $5), 4326), 'nominal', $7, $8)`,
    [source, sensor, satellite, at, lat, lon, source.endsWith("_NRT"), cellId],
  );
}

async function main() {
  await client.connect();
  await client.query("set search_path = public, extensions");
  await client.query("begin");
  try {
    const region = await client.query(
      `insert into public.regions (code, name, level, geom, area_km2)
       values ('demo-dbcheck', 'DEMO db-check', 'custom',
               ST_Multi(ST_GeomFromText(
                 'POLYGON((-70 18, -69 18, -69 19, -70 19, -70 18))', 4326)), 1)
       returning id`,
    );
    await client.query(
      `insert into public.grid_cells (cell_id, centroid, region_id) values
         ($1, ST_SetSRID(ST_MakePoint(-69.5, 18.5), 4326), $3),
         ($2, ST_SetSRID(ST_MakePoint(-69.4, 18.4), 4326), $3)`,
      [CELL_A, CELL_B, region.rows[0].id],
    );
    const fixtures = [
      ["MODIS_SP", "Terra", CELL_A, -69.5, 18.5, "2024-01-02T01:00:00Z"],
      ["MODIS_SP", "Aqua", CELL_A, -69.5, 18.5, "2024-01-02T13:00:00Z"],
      ["VIIRS_SNPP_SP", "S-NPP", CELL_A, -69.4, 18.4, "2024-01-03T02:00:00Z"],
      ["VIIRS_SNPP_NRT", "S-NPP", CELL_A, -69.4, 18.4, "2024-01-03T03:00:00Z"],
      ["VIIRS_SNPP_NRT", "S-NPP", CELL_B, -69.3, 18.3, "2024-01-03T04:00:00Z"],
    ];
    for (const row of fixtures) await detection(row);

    const cdo = await client.query(
      `select count(*)::int as cdo_rows,
              coalesce(sum(n_detections), 0)::int as detections
         from public.historical_cell_day_occupancy
        where cell_id = $1 and day = '2024-01-02'::date and sensor = 'MODIS'`,
      [CELL_A],
    );
    assert.equal(cdo.rows[0].cdo_rows, 1, "Terra y Aqua deben contar una CDO");
    assert.equal(cdo.rows[0].detections, 2);

    const nrt = await client.query(
      `select cell_id, count(*)::int as n
         from public.historical_product_detections
        where source = 'VIIRS_SNPP_NRT'
        group by cell_id order by cell_id`,
    );
    assert.deepEqual(
      nrt.rows.map(({ cell_id, n }) => [cell_id, n]),
      [[CELL_B, 1]],
      "el SP de la celda A no debe eliminar el NRT de la celda B",
    );
    const sp = await client.query(
      `select count(*)::int as n from public.historical_product_detections
        where source = 'VIIRS_SNPP_SP' and cell_id = $1`,
      [CELL_A],
    );
    assert.equal(sp.rows[0].n, 1);

    await client.query("set local role anon");
    const anonRead = await client.query(
      "select count(*)::int as n from public.regions",
    );
    assert.equal(anonRead.rows[0].n, 1);
    await client.query("savepoint anon_insert");
    let denied;
    try {
      await client.query("insert into public.regions default values");
    } catch (error) {
      denied = error;
    } finally {
      await client.query("rollback to savepoint anon_insert");
    }
    assert.equal(denied?.code, "42501", "anon no debe poder insertar");
    await client.query("reset role");

    await client.query("set local role service_role");
    const write = await client.query(
      `insert into public.raw_detections
         (source, sensor, satellite, acq_at, acq_date, latitude, longitude,
          geom, confidence, is_nrt, cell_id)
       values ('VIIRS_SNPP_NRT', 'VIIRS', 'S-NPP', '2024-01-04T00:00:00Z',
               '2024-01-04', 18.3, -69.3,
               ST_SetSRID(ST_MakePoint(-69.3, 18.3), 4326), 'nominal', true, $1)
       returning id`,
      [CELL_B],
    );
    assert.ok(write.rows[0].id > 0);
    await client.query("reset role");

    await client.query("rollback");
    console.log(
      "db-check OK: CDO, SP/NRT, anon lectura y service_role escritura.",
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`db-check falló: ${error.message}`);
  process.exitCode = 1;
});
