# API

Endpoints REST implementados como Route Handlers de Next.js en `src/app/api/`. Todo en JSON salvo el CSV y el `.ics`. Entradas y salidas validadas con `zod`. Fechas ISO 8601 en UTC. Geometrías en GeoJSON `[lon, lat]`.

## Convenciones

- Éxito: `200` (o `201` al crear) con el objeto. Error: `{ "error": { "code": "string", "message": "string", "details": {} } }` con el código HTTP correspondiente.
- Códigos de error comunes: `validation_error` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `rate_limited` (429), `upstream_error` (502).
- Paginación: `?limit=50&cursor=...` con respuesta `{ items, nextCursor }`.
- Autenticación: sesión de Supabase (cookie). Los endpoints `/api/jobs/*` usan `Authorization: Bearer ${CRON_SECRET}`.
- Todo resultado que contenga cifras incluye `meta` con `unit`, `methodVersion`, `dataThrough` (última fecha con datos) y `sources`.

Rol requerido: **pub** (público), **user**, **coord** (coordinator o admin), **admin**.

## 1. Regiones

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/regions?level=province` | pub | Lista de regiones con `id`, `code`, `name`, `level`, `bbox`, `areaKm2` |
| `GET /api/regions/{id}` | pub | Región con geometría simplificada |

## 2. Historial y calendario

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/calendar` | pub | Matriz años × meses para una zona |
| `GET /api/calendar/month` | pub | Detalle de un mes |
| `POST /api/trends` | pub | Tendencia anual |
| `POST /api/seasonality` | pub | Épocas de mayor actividad |
| `GET /api/ranking` | pub | Ranking de zonas con mayor actividad |
| `POST /api/export/csv` | pub | CSV de la zona y el período |
| `GET /api/quality` | pub | Calidad de la armonización de una región |

Cuerpo común de zona (`aoi`): `{ "regionId": "uuid" }` **o** `{ "geometry": { "type": "Polygon", "coordinates": [...] } }`. El polígono debe estar dentro de la caja de ingesta y no superar `MAX_AOI_KM2` (por defecto 60000).

### `POST /api/calendar`

Solicitud:
```json
{ "aoi": { "regionId": "..." }, "fromYear": 2000, "toYear": 2026 }
```

Respuesta:
```json
{
  "aoi": { "type": "region", "id": "...", "name": "Santiago", "areaKm2": 2839.0 },
  "months": [
    {
      "year": 2024, "month": 3,
      "harmonizedIndex": 412.3,
      "status": "above_usual",
      "percentileRank": 0.82,
      "ratioToMedian": 1.35,
      "isPartial": false, "usesNrt": false, "terraOnly": false
    }
  ],
  "meta": {
    "unit": "celdas-día con detección (≈1 km), equivalente MODIS",
    "methodVersion": "v1",
    "calibration": { "factor": 0.81, "r2": 0.93, "periodStart": "2012-01-01", "periodEnd": "2026-09-30" },
    "dataThrough": "2026-11-13",
    "sources": ["MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"]
  }
}
```

### `GET /api/calendar/month?regionId=...&year=2024&month=3`

(Para un polígono, usar `POST /api/calendar/month` con `aoi` en el cuerpo.)

```json
{
  "year": 2024, "month": 3,
  "harmonizedIndex": 412.3,
  "detections": { "modis": 530, "viirs": 1904 },
  "cellDays": { "modis": 498, "viirs": 509 },
  "reference": { "median": 305.0, "p25": 210.0, "p75": 388.0, "p90": 450.0, "min": 80.0, "max": 560.0, "nYears": 25 },
  "status": "above_usual",
  "sameMonthOtherYears": [ { "year": 2023, "harmonizedIndex": 290.1 } ],
  "isPartial": false,
  "meta": { }
}
```

### `GET /api/ranking?level=province&fromYear=2021&toYear=2025&limit=10`

```json
{
  "period": { "fromYear": 2021, "toYear": 2025 },
  "measure": "celdas-día por 1000 km² por año",
  "items": [ { "regionId": "...", "name": "...", "value": 12.4, "rank": 1 } ],
  "meta": { }
}
```
Devuelve `409` con `code: "not_enough_regions"` si hay menos de dos regiones comparables.

## 3. Actualidad

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/detections/recent?bbox=w,s,e,n&hours=72&sensor=ALL` | pub | GeoJSON `FeatureCollection` de detecciones recientes |
| `GET /api/detections/{id}` | pub | Ficha de una detección |
| `GET /api/detections/latest-available` | pub | Período exacto de los últimos datos disponibles |
| `GET /api/current-vs-median?regionId=...` | pub | Mes en curso (a la fecha) frente a la mediana |

Cada `Feature` incluye `acqAt`, `sensor`, `satellite`, `confidence`, `frp`, `isNrt`. La respuesta incluye `updatedAt` (última ingesta exitosa) y `sourceNote` con el aviso de que una detección no es un incendio confirmado.

## 4. Zonas de monitoreo y alertas

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/zones` | user | Zonas propias |
| `POST /api/zones` | user | Crear zona `{ name, geometry, notifyEmail, minConfidence }`; envía correo de verificación |
| `PATCH /api/zones/{id}` | user | Editar, pausar o reanudar |
| `DELETE /api/zones/{id}` | user | Eliminar (borrado real) |
| `GET /api/zones/verify?token=...` | pub | Confirma el correo de la zona |
| `GET /api/zones/{id}/alerts` | user | Historial de alertas de la zona |
| `GET /api/alerts/unsubscribe?token=...` | pub | Baja desde el enlace del correo |

Límites: máximo `MAX_ZONES_PER_USER` zonas (por defecto 10), área máxima `MAX_ZONE_KM2` (por defecto 5000), 20 correos por hora por usuario.

## 5. Incidentes, activos y avisos

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/incidents?status=open` | pub (resumen) / coord (completo) | Lista de incidentes |
| `GET /api/incidents/{id}` | pub (resumen) / coord (completo) | Detalle con detecciones, gravedad y línea de tiempo |
| `PATCH /api/incidents/{id}` | coord | Cambiar estado (`monitoring`, `contained`, `closed`, `false_alarm`) |
| `GET /api/assets?near=lat,lon&radiusKm=25&type=bomberos&available=true` | coord | Activos cercanos, ordenados por distancia |
| `POST /api/assets` | admin | Crear activo |
| `PATCH /api/assets/{id}` | admin | Editar, incluida la disponibilidad |
| `GET /api/incidents/{id}/notifications` | coord | Avisos del incidente |
| `POST /api/incidents/{id}/dispatch` | coord | Crea un aviso manual a activos `{ assetIds, channel, body }` |
| `POST /api/notifications/{id}/approve` | coord | Aprueba un aviso pendiente y lo encola |
| `POST /api/notifications/{id}/reject` | coord | Rechaza un aviso pendiente |

En `DEMO_MODE`, `recipient` de los avisos a activos es siempre `DEMO_INBOX`.

## 6. Prevención y recursos

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/prevention/priority-months?regionId=...` | pub | Meses prioritarios y el historial que los respalda |
| `GET /api/prevention/resources?regionId=...&category=reporte` | pub | Recursos oficiales |
| `GET /api/prevention/events?regionId=...` | pub (solo `planned`) / user | Eventos del calendario |
| `POST /api/prevention/events` | user | Crear evento |
| `PATCH /api/prevention/events/{id}` | user (propio) / coord | Editar |
| `DELETE /api/prevention/events/{id}` | user (propio) / coord | Eliminar |
| `GET /api/prevention/calendar.ics?regionId=...` | pub | Exportación `.ics` de eventos `planned` |

## 7. Laboratorio

| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/lab/case` | pub | Caso del laboratorio (zona, mes, reportes de MODIS y VIIRS, opciones, explicaciones). Datos reales de la zona del caso más el guion en `src/content/lab-case.json` |

## 8. Agente de IA

| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/agent/chat` | pub (con límite de tasa) | Mensaje al asistente. Respuesta en streaming (Server-Sent Events). Cuerpo: `{ sessionId?, message, context?: { regionId?, incidentId?, location? } }` |
| `GET /api/agent/runs/{id}` | coord | Ejecución con mensajes y herramientas llamadas |
| `POST /api/agent/trigger` | coord | Lanza el agente para un incidente `{ incidentId }` |

La ubicación en `context.location` solo se usa durante la sesión y no se guarda.

### Primera integración de chat (Muse)

`POST /api/agent/chat` implementa el perfil público `support-chat`; añade
`locale?: "es" | "en"` (por defecto `es`) al cuerpo anterior. La sesión pertenece
a una cookie HttpOnly; `sessionId` por sí solo no permite recuperar el historial.
SSE: `session`, `text_delta`, `tool`, `fallback`, `done` y `error`, cada uno con JSON
validado y campo `type`. Máximo 4000 caracteres por mensaje, diez turnos/minuto y
sesenta/hora por IP, un turno concurrente por sesión y 60 segundos de ejecución.
Errores HTTP: `400` entrada inválida, `403` origen/sesión, `409` sesión ocupada,
`413` cuerpo mayor de 24000 bytes, `415` contenido distinto de JSON, `429` cuota
y `503` configuración/almacenamiento no disponible. Los fallos durante streaming
usan un evento `error` terminal y no exponen errores crudos del proveedor.

El adaptador real es Meta Model API (`LLM_PROVIDER=meta`), con mock por defecto.
Los endpoints de revisión y disparo de incidentes de la tabla siguen pendientes.
Contrato completo, herramientas implementadas, variables y límites:
[`IA-MUSE.md`](IA-MUSE.md).

## 9. Tareas programadas

Todas `POST`, con `Authorization: Bearer ${CRON_SECRET}`, idempotentes.

| Ruta | Descripción |
|---|---|
| `/api/jobs/ingest-nrt` | Ingesta NRT |
| `/api/jobs/evaluate-zones` | Evalúa zonas, crea y actualiza incidentes, genera avisos |
| `/api/jobs/reconcile-sp` | Reemplaza NRT por SP cuando ya está disponible |
| `/api/jobs/recompute-stats` | Recalcula agregados, calibración y estadísticas |
| `/api/jobs/retention` | Aplica la política de retención |

## 10. Salud

`GET /api/health` devuelve `{ db: "ok", lastIngestAt, emailProvider: "ok|error", version }`.

## 11. Contratos de tipos

Define los tipos de solicitud y respuesta con `zod` en `src/lib/schemas/` y exporta los tipos de TypeScript desde allí para compartirlos entre servidor y cliente. Cualquier cambio de contrato actualiza este documento.
