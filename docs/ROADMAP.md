# Hoja de ruta

Prioridades: **P0** núcleo del reto, **P1** valor central de la propuesta, **P2** ampliaciones con agente, **P3** futuro.

**Línea de corte:** si el tiempo se acorta, se entrega **P0 + P1** completos y bien probados. Las fases 7 y 8 (P2) se muestran con datos y activos de demostración y avisos en `DEMO_MODE`. No se empieza una fase P2 hasta que las fases 0 a 6 cumplan su criterio de aceptación.

Cada tarea sigue la «Definición de terminado» de `AGENTS.md`.

## Fase 0: Base del proyecto (P0)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T0.1 | Crear el proyecto Next.js + TypeScript estricto + Tailwind; scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e` | Todos los scripts corren en limpio |
| T0.2 | Integración continua (lint, typecheck, test) | La CI pasa en la rama principal |
| T0.3 | Supabase con PostGIS; carpeta `supabase/migrations`; script `db:migrate` | Una migración vacía aplica sin errores |
| T0.4 | i18n (`es` por defecto, `en`), layout, navegación, tema accesible, pie con atribución a NASA FIRMS | Se puede cambiar de idioma; la navegación enlaza las 7 rutas con páginas de relleno |
| T0.5 | `.env.example` completo, carga de configuración validada con `zod`, `GET /api/health` | La app falla con mensaje claro si falta una variable obligatoria |

## Fase 1: Datos y armonización (P0)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T1.1 | Migraciones del esquema de `MODELO-DE-DATOS.md` (sin tablas de agente aún) | `pnpm db:migrate` crea el esquema completo |
| T1.2 | Cliente FIRMS con throttle, reintentos, parseo de CSV y fixtures reales | Pruebas unitarias con CSV de MODIS y VIIRS pasan |
| T1.3 | Carga de regiones (país y provincias) y cálculo de `grid_cells` | `GET /api/regions` devuelve país y provincias con área |
| T1.4 | Backfill histórico de `MODIS_SP` y `VIIRS_SNPP_SP` para la región de ingesta | `raw_detections` contiene datos desde 2000 (MODIS) y 2012 (VIIRS) |
| T1.5 | Limpieza y agregación a `cell_day_occupancy` y `cell_month` | Prueba de integración con una semana conocida coincide con el conteo manual |
| T1.6 | Calibración y `region_month_stats` según `DATOS-Y-ARMONIZACION.md` | Hay factor por región y serie mensual armonizada completa |
| T1.7 | Informe de validación (`pnpm stats:report`) | El informe muestra MODIS vs VIIRS × f, R² y ausencia de salto en 2012 |

## Fase 2: Mapa e historial e Inicio (P0)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T2.1 | Endpoints `calendar`, `calendar/month`, `trends`, `seasonality`, `ranking`, `export/csv`, `quality` | Contratos de `API.md` cumplidos con pruebas |
| T2.2 | UI: selector de zona y fechas, mapa, dibujo de polígono | Se puede elegir una provincia o dibujar una zona válida |
| T2.3 | UI: calendario años × meses y detalle del mes | Calendario de una región en menos de 2 s; detalle con mediana y rango |
| T2.4 | UI: tendencias, épocas de mayor actividad, ranking y calidad | Cada pestaña muestra período, unidad y advertencias |
| T2.5 | Descarga CSV | El CSV reproduce lo mostrado y trae metadatos |
| T2.6 | Inicio con «Explorar el calendario» y «Probar un caso» (`demo-case.json`) | El caso abre el detalle del mes sin pasos extra |

## Fase 3: Actualidad (P1)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T3.1 | Tarea `ingest-nrt` programada y registro en `job_runs` | Entra una ingesta cada 15 min sin duplicados |
| T3.2 | Endpoints de detecciones recientes, ficha, últimos datos disponibles y mes en curso vs mediana | Contratos cumplidos |
| T3.3 | UI de Actualidad con mapa, fecha de actualización, sensor y ficha por punto | Cada punto abre su ficha con aviso de no confirmado |
| T3.4 | «Últimos datos disponibles» cuando no hay datos recientes | Se muestra el período exacto |
| T3.5 | Tarea `reconcile-sp` | Meses antiguos pasan de NRT a SP y se recalculan |

## Fase 4: Zonas de monitoreo y alertas por correo (P1)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T4.1 | Autenticación por enlace mágico, perfiles y roles | Un usuario inicia sesión y ve solo lo suyo (RLS probada) |
| T4.2 | CRUD de zonas con dibujo en mapa, límites y verificación de correo | Una zona sin verificar no recibe alertas |
| T4.3 | `EmailProvider` con implementación real y modo de pruebas | En desarrollo todo va a la dirección de prueba |
| T4.4 | `evaluate-zones`, creación de avisos con `dedupe_key` y escalada | Prueba: sin duplicados en 6 h; con escalada si sube la gravedad |
| T4.5 | Plantilla de correo (es y en) y enlaces de baja | El correo cumple el contenido mínimo de `PAGINAS-UI.md` |
| T4.6 | UI `/zonas` con historial de alertas | Se ve el estado de cada alerta |
| T4.7 | Botón «Monitorear esta zona» desde Mapa y Actualidad | El polígono llega prellenado |

## Fase 5: Prevención y respuesta (P1)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T5.1 | Carga de `prevention_resources` (contenido aportado por el equipo) | Recursos agrupados por categoría con organización y fecha |
| T5.2 | Endpoint y UI de meses prioritarios | Se muestran con el historial que los respalda |
| T5.3 | Conservar la zona al llegar desde Actualidad | La página abre ya con la zona seleccionada |
| T5.4 | Calendario de prevención manual (CRUD) y exportación `.ics` | El `.ics` se abre en un calendario externo |

## Fase 6: Laboratorio (P1)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T6.1 | Guion del caso en `lab-case.json` con datos reales de la zona del caso | El caso carga sin errores |
| T6.2 | UI de personajes MODIS y VIIRS y elección de qué comprobar | Cada opción da retroalimentación explicativa |
| T6.3 | «Comparar sensores» con el mismo caso | La explicación usa las cifras del caso |

## Fase 7: Incidentes y activos (P2)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T7.1 | Agrupación en incidentes, expansión y gravedad v1 | Pruebas con casos conocidos pasan |
| T7.2 | CRUD de `assets` y búsqueda por cercanía y disponibilidad; datos demo | Se listan activos ordenados por distancia |
| T7.3 | Panel `/respuesta` y detalle con mapa y línea de tiempo | Un coordinador ve incidentes y activos cercanos |
| T7.4 | Avisos a activos con aprobación humana, `DEMO_MODE` y salvaguardas | Prueba: nunca sale un mensaje a un destinatario distinto de `DEMO_INBOX` en demo |
| T7.5 | Alerta automática de respaldo si el agente falla | Se envía a los usuarios de las zonas afectadas |

## Fase 8: Agente de IA (P2)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T8.1 | Interfaz `LLMProvider`, implementación real, `MockLLMProvider`, tablas de agente, bucle y auditoría | Un turno con herramienta simulada queda registrado completo |
| T8.2 | Herramientas de lectura | Cada una con esquema `zod` y pruebas |
| T8.3 | Herramientas con efectos y política (`suggest` y `auto`) | La política se prueba en código, no depende del prompt |
| T8.4 | Perfil `incident-coordinator`: alertas con criterio y coordinación con activos | Casos de `AGENTE-IA.md` sección 10 sobre incidentes pasan |
| T8.5 | Perfil `support-chat`: primeros auxilios (desde `kb/`), lugares seguros y rutas | Casos de apoyo pasan; siempre aparece el 9-1-1 y la fuente |
| T8.6 | Perfil `prevention-planner`: borradores de eventos justificados | Nada pasa a `planned` sin confirmación humana |
| T8.7 | Panel del asistente en la interfaz | Funciona en móvil y escritorio, con aviso de aprobación pendiente |
| T8.8 | Conjunto de evaluación y prueba con al menos dos proveedores de modelos | Los casos mínimos pasan con ambos |

## Fase 9: Pulido y entrega (P0 y P1)

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| T9.1 | Accesibilidad (teclado, contraste, lector de pantalla) y rendimiento | Auditoría sin fallos críticos |
| T9.2 | Datos de demostración, guion de demo (`PRD.md` sección 7) y modo de simulación de una detección | La demo completa corre sin errores ni envíos reales |
| T9.3 | Documentación final: README, atribuciones, explicación del método dentro de la app | Un tercero puede levantar el proyecto con el README |
| T9.4 | Materiales de entrega (video, descripción y repositorio) según requisitos del reto | Entrega verificada contra la lista oficial |

## Dependencias entre fases

```
0 → 1 → 2 → (3, 5, 6 en paralelo)
         2 → 4 (necesita 3.1 para detecciones recientes)
         4 → 7 → 8
9 cierra todo
```

## Contenido que debe aportar el equipo (no lo genera el agente de codificación)

- Límites administrativos y su licencia.
- Zona y mes del caso de demostración; guion del laboratorio.
- Recursos oficiales de prevención y reporte (`prevention_resources`).
- Contenido revisado de primeros auxilios y prevención (`kb/`).
- Contactos reales y validados de activos (o confirmación de usar solo datos demo).
- Lugares seguros (`safe_places`) de la zona de demostración.
- Textos de interfaz revisados en español e inglés.
