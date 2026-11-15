# Regiones: contrato de validación e importación

Documento de la tarea **T1.3** (issue #13). Describe el contrato del validador
`src/lib/geo/regions.ts` para que un importador posterior pueda cargar límites
administrativos en la tabla `regions`.

Este documento **no afirma** que exista una fuente de límites con licencia, que
la ingesta de regiones esté hecha ni que `GET /api/regions` esté completo. Solo
define y prueba la validación de un archivo GeoJSON y la normalización de sus
filas. La carga en base de datos, el cálculo de área y el endpoint pertenecen a
tareas posteriores.

## 1. Estado implementado

| Archivo | Responsabilidad |
|---|---|
| `src/lib/geo/regions.ts` | Esquema `zod` y funciones para validar y normalizar un `FeatureCollection` de regiones |
| `tests/geo/regions.test.ts` | Pruebas de geometría inválida, ejes invertidos, propiedades faltantes y fixture válido |
| `docs/REGIONES-IMPORTACION.md` | Este contrato |

No se modificaron migraciones, rutas de API, `package.json` ni dependencias:
`zod` ya está instalado.

## 2. Entrada esperada

Un objeto GeoJSON `FeatureCollection` con una o más `Feature`. Cada `Feature`:

- `type`: `"Feature"`.
- `geometry.type`: `"Polygon"` o `"MultiPolygon"`. Cualquier otro tipo se
  rechaza.
- `geometry.coordinates`: posiciones WGS84 (EPSG:4326) en orden
  `[longitud, latitud]`. No se admiten altitudes ni elementos extra en la
  posición.
- `properties`: metadatos obligatorios descritos abajo.

### Propiedades obligatorias por feature

| Propiedad | Tipo | Regla |
|---|---|---|
| `code` | string | Obligatoria, 1–64 caracteres. Debe empezar por letra o dígito y contener solo letras, dígitos, `.`, `-` o `_`. Única dentro del archivo. |
| `name` | string | Obligatoria, 1–200 caracteres. |
| `level` | string | `country`, `province` o `custom` (los mismos valores del `check` de `regions.level`). |
| `bbox` | `[west, south, east, north]` | Obligatorio. Cuatro números finitos en WGS84, con `west < east` y `south < north`. Debe coincidir con la caja calculada de la geometría. |
| `source` | string | Obligatoria, 1–500 caracteres. Nombre de la institución o conjunto de datos que produjo los límites. |
| `license` | string | Obligatoria, 1–500 caracteres. Licencia exacta del conjunto de datos. El validador exige que exista; no la verifica ni la deduce. |
| `is_demo` | boolean | Obligatorio y explícito. Todo dato sintético o de ejemplo debe llevar `true`. |

### Propiedades opcionales

| Propiedad | Tipo | Uso |
|---|---|---|
| `parent_code` | string | Código de la región padre dentro del archivo. El validador comprueba el formato, no que el padre exista en la base. |
| `attribution` | string | Texto de atribución que debe mostrarse. |
| `source_url` | URL | Enlace al conjunto de datos original. |
| `license_url` | URL | Enlace al texto de la licencia. |
| `retrieved_at` | fecha ISO `YYYY-MM-DD` | Fecha de descarga o corte de los datos. |

Las propiedades desconocidas se ignoran. El objeto de entrada no se modifica.

## 3. Reglas de geometría

- Cada posición tiene exactamente dos números finitos.
- Longitud en `[-180, 180]` y latitud en `[-90, 90]`.
- Cada anillo lineal tiene al menos 4 posiciones: tres vértices distintos y la
  primera posición repetida al final.
- El primer y el último par ordenado del anillo deben ser idénticos.
- Un anillo colapsado, con menos de tres posiciones distintas o sin área
  planar medible, se rechaza como `degenerate_ring`.
- Un `Polygon` necesita al menos un anillo; un `MultiPolygon`, al menos un
  polígono.
- No se exige una orientación concreta de los anillos (regla de la mano
  derecha). PostGIS puede normalizarla al importar.
- **No** se comprueba aquí la intersección de anillos, que los huecos estén
  dentro del anillo exterior, ni la validez topológica completa. Eso queda para
  `ST_IsValid`/`ST_MakeValid` en la base de datos.

## 4. Caja delimitadora (`bbox`)

La caja declarada se compara con la caja calculada de todas las posiciones de la
geometría. La tolerancia es `BBOX_TOLERANCE_DEGREES = 1e-6` grados.

- Si no coincide, se devuelve `bbox_mismatch`.
- Si coincide con la caja calculada pero con los ejes intercambiados
  (`[south, west, north, east]`), se devuelve `bbox_axis_swap`.
- Una caja fuera de rango o con orden inválido se rechaza como `bbox_invalid`.

El `bbox` del resultado se calcula a partir de la geometría validada; no se
copia el valor declarado.

## 5. Detección de ejes invertidos

El orden correcto es `[longitud, latitud]`. Una latitud mayor que 90 o una
longitud mayor que 180 se detecta siempre por rango.

Cuando la longitud está entre `-90` y `90` (por ejemplo, América), un par
invertido puede seguir siendo numéricamente válido. Para detectarlo, el
importador debe pasar la caja de ingesta:

```ts
parseRegionFeatureCollection(input, {
  expectedBbox: { west: -72.6, south: 17.0, east: -67.7, north: 20.6 },
});
```

- Si la geometría no intersecta `expectedBbox` y al intercambiar longitud y
  latitud sí lo haría, se devuelve `likely_axis_swap`.
- Si no intersecta de ninguna forma, se devuelve `outside_expected_bbox`.
- Sin `expectedBbox` no se puede detectar ese intercambio sutil, solo el
  `bbox_axis_swap` declarado y los valores fuera de rango.

La caja esperada es opcional: permite importar regiones de otras zonas si en el
futuro el proyecto las admite. Si se pasa, debe ser válida; de lo contrario la
función lanza `RangeError`.

## 6. Salida normalizada

`parseRegionFeatureCollection` devuelve:

```ts
type RegionParseResult =
  | { success: true; regions: ImportedRegion[] }
  | { success: false; issues: RegionValidationIssue[] };
```

`ImportedRegion`:

| Campo | Procedencia |
|---|---|
| `code`, `name`, `level` | `properties` |
| `parentCode` | `properties.parent_code` o `null` |
| `bbox` | Calculado de la geometría |
| `geometry` | Siempre `MultiPolygon`; un `Polygon` se envuelve en una lista |
| `source`, `license`, `attribution`, `sourceUrl`, `licenseUrl`, `retrievedAt` | `properties`, con `null` si faltan |
| `isDemo` | `properties.is_demo` |

Los errores no se lanzan: se devuelve la lista completa de problemas para que el
importador pueda informar varias filas de un mismo archivo.

`RegionValidationIssue` tiene `path` (por ejemplo
`features[0].properties.bbox`), `code` y `message`.

## 7. Códigos de error

| Código | Significado |
|---|---|
| `invalid_collection` | La raíz no es un `FeatureCollection`. |
| `empty_collection` | No hay features. |
| `invalid_feature` | Una feature no tiene la forma esperada. |
| `invalid_properties` | Falta una propiedad obligatoria o tiene un valor inválido. |
| `invalid_geometry` | Tipo de geometría no admitido o estructura de anillos inválida. |
| `invalid_position` | Una posición no es un par de números finitos. |
| `coordinate_out_of_range` | Longitud o latitud fuera de WGS84. |
| `ring_too_short` | Menos de 4 posiciones en un anillo. |
| `ring_not_closed` | El anillo no repite la primera posición. |
| `degenerate_ring` | Anillo colapsado, con pocos vértices distintos o sin área planar. |
| `bbox_invalid` | `bbox` o `expectedBbox` fuera de rango o mal ordenado. |
| `bbox_mismatch` | La `bbox` declarada no coincide con la geometría. |
| `bbox_axis_swap` | La `bbox` declarada tiene los ejes intercambiados. |
| `duplicate_code` | Dos features repiten `code`. |
| `outside_expected_bbox` | La geometría queda fuera de la caja esperada. |
| `likely_axis_swap` | La geometría parece tener latitud y longitud invertidas. |

## 8. Ejemplo de archivo válido

El siguiente ejemplo es **sintético**: los nombres, coordenadas y la licencia
son inventados para documentar el contrato. No es un límite real ni debe
presentarse como tal.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "code": "DEMO-COUNTRY",
        "name": "Synthetic Demo Country",
        "level": "country",
        "bbox": [-70.5, 17.5, -69.5, 19.5],
        "source": "Synthetic square geometry created for documentation",
        "license": "Synthetic test data; no real-world license applies",
        "is_demo": true
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-70.5, 17.5],
            [-69.5, 17.5],
            [-69.5, 19.5],
            [-70.5, 19.5],
            [-70.5, 17.5]
          ]
        ]
      }
    }
  ]
}
```

## 9. Uso previsto por el importador

```ts
import { parseRegionFeatureCollection } from "@/lib/geo/regions";

const result = parseRegionFeatureCollection(fileAsJson, {
  expectedBbox: { west: -72.6, south: 17.0, east: -67.7, north: 20.6 },
});

if (!result.success) {
  // Registrar result.issues; no abortar en el primer error.
  throw new Error(`Regiones inválidas: ${result.issues.length}`);
}

for (const region of result.regions) {
  // TODO de la tarea de importación:
  // - resolver parent_code a parent_id;
  // - calcular area_km2 con ST_Area(geography) / 1e6;
  // - validar con ST_IsValid y, si hace falta, ST_MakeValid;
  // - insertar las filas con service_role desde el servidor.
}
```

El importador debe además:

1. Rechazar archivos reales sin `source`, `license` y `attribution` revisados
   por el equipo.
2. Conservar el aviso `is_demo = true` en cualquier dato sintético.
3. Convertir las coordenadas a `MultiPolygon` (ya normalizado) y usar SRID
   4326.
4. Calcular el área en la base de datos, no en este módulo.
5. Resolver los códigos de padre dentro de la misma carga o contra filas ya
   existentes, y decidir qué hacer si falta el padre.
6. Registrar la versión del archivo y su fecha de descarga.

## 10. Pruebas

`tests/geo/regions.test.ts` cubre, con un fixture **sintético** marcado
`is_demo: true`:

- país `Polygon` y provincia `MultiPolygon`, con hueco, normalizados a
  `MultiPolygon`;
- anillo abierto, anillo corto, anillo colapsado y polígono vacío;
- coordenadas `NaN`, infinitas, fuera de rango y con ordenadas extra;
- tipo de geometría no admitido;
- falta de `code`, `name`, `level`, `bbox`, `source`, `license` o `is_demo`;
- nivel, códigos, textos y URLs inválidos;
- `bbox` desalineada, invertida, con orden inválido o fuera de rango;
- `FeatureCollection` vacío, raíz incorrecta y códigos duplicados;
- detección de ejes invertidos con `expectedBbox` y región fuera de la caja;
- que la entrada no se modifique.

Resultado de esta tanda: **31 pruebas, 1 archivo, todas pasan**.

```text
pnpm exec vitest run tests/geo/regions.test.ts
pnpm exec tsc --noEmit
```

## 11. Límites y pendientes

- **No hay límites reales cargados.** El equipo debe aportar una fuente de
  límites administrativos con licencia verificable (ver `DECISIONES.md`, #8).
  Hasta entonces solo existe el fixture sintético de las pruebas.
- No se calcula `area_km2`; corresponde a PostGIS en la importación.
- No se valida topología completa con PostGIS ni se corrigen geometrías.
- No se comprueba la existencia del padre ni la jerarquía país/provincia.
- No se soportan polígonos que cruzan el antimeridiano (`west < east` es
  obligatorio).
- El validador no verifica si una licencia permite el uso comercial o la
  atribución exigida; eso lo revisa el equipo.
- `GET /api/regions` y la escritura en `regions` siguen pendientes; esta tarea
  no los implementa y no debe presentarse como si estuvieran listos.
