# Historial v2 — contrato de trabajo del equipo

Solicitud del usuario, 2026-11-15. Base: main, con PR #20 integrado.
Esta tarea sigue siendo un prototipo explícito con datos sintéticos, no demuestra
histórico real NASA ni validación científica.

## Reparto sin archivos compartidos

- Ian (@NunezIan, pc-2-ian): dashboard.tsx, calendar.tsx, nuevo history-detail.css,
  nuevo src/lib/history/demo-history.ts, messages/es.json y en.json, tests/history/,
  tests/e2e/history-expanded.spec.ts y docs/HISTORIAL-DIARIO.md.
- Yariel (@yarielDR32, pc-3-yariel): fire-map.tsx, fire-map.css, nuevo
  src/lib/geo/activity-grid.ts, tests/geo/activity-grid.test.ts, tests/map/ y
  docs/MAPA-INTERACTIVO.md. No modificar map-demo.ts ni mensajes compartidos.
- Dariana (@DarianaSM15, pc-1-dariana): shell.tsx, nuevo brand.css, prueba propia
  tests/e2e/branding.spec.ts y docs/IDENTIDAD-VISUAL.md. El logo ya está incluido
  por coordinación en public/images/firesync-logo.jpeg, sin editar la imagen.

## Interfaz entre Ian y Yariel

Se conserva FireMap con `detections`, `sensor`, `day`, `onSelect`, `mode`, `labels`.
Se añaden props OPCIONALES `onSensorChange?: (sensor: DemoSensorFilter) => void`
y `activity?: boolean` (valor por defecto true para history).

Ian prepara una sola lista de registros del período/mes/zona y la pasa al mapa.
El sensor controlado se mantiene en HistoryDashboard y pasa al mapa junto con
onSensorChange. El mapa filtra por sensor y día, dibuja intensidad con EXACTAMENTE
los registros filtrados y NO introduce otro generador o truncado oculto.
Los botones Ambos/MODIS/VIIRS se muestran bajo el mapa y actualizan ese estado.
Ian utiliza el mismo filtro para calendario, días, cifras y CSV; no basta cambiar
el color del botón. No hacer imports entre componentes cliente para generar datos:
la generación/resumen compartidos de Ian viven en src/lib/history/demo-history.ts.

Campos de labels ya aportados por coordinación: all, activity, activityUnit,
terrain, terrainUnavailable. Ambos agentes conservan estos campos; solo Ian
agrega textos adicionales a los dos diccionarios. Conservar todas las props
anteriores: inicio y actualidad deben seguir funcionando.

Paleta común, de menor a mayor intensidad relativa:
#fbd6d2, #ffb48f, #f77555, #be293b. No significan gravedad ni predicción.
Las capas espaciales agregan conteos de la lista por celdas estables; conservan
el total, muestran unidad, período y escala. El calendario agrega por mes. No
llamar "incendios confirmados" ni "zonas peligrosas" a estos conteos.

## Comportamiento solicitado

- Historial abre con la matriz anual/mensual completa, SIN mes preseleccionado.
  /mapa?caso=demo puede mantener la selección explícita del botón Probar un caso.
- Los selectores ofrecen 2000 primero, luego todos los años hasta el año actual
  obtenido dinámicamente. Rango predeterminado: 2000–año actual. Sin años futuros.
  No cambiar el reloj ni inventar observaciones hasta hoy: fechas futuras no
  generan registros; los meses futuros se distinguen de meses con cero actividad.
- Solo al pulsar un mes se despliega su calendario/desglose diario completo,
  incluidos días con cero detecciones y febrero bisiesto. Cada día permite ver
  sus registros con fecha UTC/local, sensor, satélite, confianza, FRP y posición.
  Cerrar detalle vuelve a todos los meses y restaura la vista espacial del período.
- Respetar disponibilidad nominal incluso en las simulaciones: no VIIRS antes
  de 2012, no Aqua antes de julio de 2002, ni MODIS antes de noviembre de 2000.
  No presentar MODIS/VIIRS combinados como un índice armonizado validado.
- Cambiar a 2020 o a otro rango cambia la intensidad espacial según sus propios
  registros; ambos mapas y calendario usan el mismo subconjunto, con leyendas claras.
- Relieve opcional: fuente raster-dem global Terrarium, toggle visible,
  atribución, captura de fallos y vuelta al mapa plano si no carga. No es necesario
  pagar un servicio ni introducir una clave. Verificar teselas de República Dominicana.
- La marca usa el logo aportado por el usuario. No aparece "Calendario de fuego"
  debajo de FireSync. Imagen sin distorsión, cabecera usable en móvil.

## Rendimiento y verificación

Evitar crear decenas de miles de marcadores DOM en 27 años: usar capa GeoJSON
agregada o limitar solo la representación de puntos con aviso explícito; las
cifras/CSV y agregados SI conservan todos los registros del filtro.

Cada sesión deja commit y pruebas, sin push del LLM. El worker sube la rama y
abre PR borrador tras lint/typecheck/test. No merge automático. Antes de integrar,
la coordinación comprueba también build, E2E y navegador escritorio/móvil.
Una tarea por sesión/worktree hackathon/issue-N; sin agentes adicionales.
