# PRD: Calendario de actividad de incendios

## 1. Contexto

Reto NASA Space Apps Challenge 2026: crear una aplicación web que armonice los registros de focos de incendio activos de MODIS y VIIRS en un **calendario de actividad de incendios**, para que servicios de alerta temprana, respuesta a emergencias, científicos y gestores de tierras examinen patrones históricos, condiciones inusuales y períodos críticos dentro de un área de interés seleccionada. El reto sugiere usar los puntos calientes de NASA FIRMS y comparar la actividad del mes actual con la mediana histórica.

El equipo amplía el reto con tres capacidades: monitoreo de zonas con alerta por correo, respuesta temprana con activos cercanos y un agente de IA de apoyo.

## 2. Objetivos

1. **Núcleo del reto:** un calendario armonizado MODIS + VIIRS, claro y verificable, para cualquier zona seleccionada.
2. **Anticipación:** que una persona pueda decir si la actividad actual se salió de lo habitual y qué meses requieren preparación.
3. **Aviso temprano:** que un usuario marque una zona y reciba un correo cuando se detecte un foco dentro de ella.
4. **Respuesta temprana:** que ante un incendio detectado se identifiquen y se contacten los activos cercanos para mitigarlo antes de que crezca.
5. **Apoyo con IA:** un agente que decide alertas que requieren criterio, coordina activos, orienta a personas (primeros auxilios, rutas a sitios seguros) y ayuda a planificar actividades de prevención.

## 3. Usuarios

| Persona | Necesita | Secciones principales |
|---|---|---|
| Gestor de emergencias / coordinador de respuesta | Ver patrones y períodos críticos, recibir alertas, contactar activos | Mapa e historial, Mis zonas, Respuesta a incendios |
| Científico o gestor de tierras | Series históricas comparables, descarga de datos, explicación del método | Mapa e historial, Laboratorio |
| Ciudadano, comunidad, agricultor | Saber si su zona está en riesgo, recibir avisos, qué hacer | Inicio, Actualidad, Prevención y respuesta, Asistente |
| Estudiante o docente | Entender qué es la armonización y cómo difieren los sensores | Laboratorio, Inicio |
| Administrador del sistema | Cargar activos, recursos y contenidos, revisar el agente | Respuesta a incendios, panel de administración |

## 4. Requisitos funcionales

Prioridad: **P0** núcleo del reto, **P1** valor central de la propuesta, **P2** ampliaciones con agente, **P3** futuro.

### 4.1 Inicio
| ID | Requisito | Prio |
|---|---|---|
| RF-INI-1 | Mostrar la pregunta «¿La actividad de fuego en esta zona se salió de lo habitual?» como eje de la página | P0 |
| RF-INI-2 | Botón **Explorar el calendario** que abre Mapa e historial | P0 |
| RF-INI-3 | Botón **Probar un caso** que abre Mapa e historial con la zona y el mes del caso de demostración (configurable) | P0 |

### 4.2 Mapa e historial
| ID | Requisito | Prio |
|---|---|---|
| RF-MAP-1 | Elegir zona (región predefinida o polígono dibujado) y rango de fechas | P0 |
| RF-MAP-2 | Mapa con la zona y calendario con años en filas y meses en columnas | P0 |
| RF-MAP-3 | Al tocar un mes: detecciones, mediana y rango del mismo mes en otros años, y estado (dentro de lo habitual, por encima, excepcional) | P0 |
| RF-MAP-4 | Tendencias de la zona con aviso de interpretación | P0 |
| RF-MAP-5 | Épocas de mayor actividad por zona | P0 |
| RF-MAP-6 | Descarga CSV con metadatos del método | P0 |
| RF-MAP-7 | Lista «Zonas con mayor actividad detectada» con período indicado y medida por área | P1 |
| RF-MAP-8 | Botón «Monitorear esta zona» que lleva a crear una zona de monitoreo con el polígono actual | P1 |
| RF-MAP-9 | Panel «Calidad de la armonización» (ajuste MODIS vs VIIRS en el período de solapamiento) | P1 |

### 4.3 Actualidad
| ID | Requisito | Prio |
|---|---|---|
| RF-ACT-1 | Mapa de detecciones recientes de FIRMS con fecha de actualización y sensor de origen | P1 |
| RF-ACT-2 | Cada punto abre una ficha (fecha y hora UTC y local, sensor, satélite, confianza, potencia radiativa, vínculo a Prevención y respuesta) | P1 |
| RF-ACT-3 | Si no hay datos recientes, mostrar «Últimos datos disponibles» con el período exacto | P1 |
| RF-ACT-4 | Comparar el mes en curso con la mediana histórica de la zona (a la fecha) | P1 |

### 4.4 Prevención y respuesta
| ID | Requisito | Prio |
|---|---|---|
| RF-PRE-1 | Seleccionar una zona y ver los meses en que conviene priorizar la preparación según su historial | P1 |
| RF-PRE-2 | Consultar recursos oficiales de prevención, extinción y reporte (tabla `prevention_resources`) | P1 |
| RF-PRE-3 | Si se llega desde un punto de Actualidad, conservar la zona y mostrar los recursos pertinentes | P1 |
| RF-PRE-4 | Calendario de actividades de prevención (crear, editar, exportar a `.ics`) | P1 |
| RF-PRE-5 | Planificación del calendario asistida por el agente según alertas y tendencia reciente | P2 |

### 4.5 Laboratorio
| ID | Requisito | Prio |
|---|---|---|
| RF-LAB-1 | MODIS y VIIRS como personajes que entregan reportes distintos del mismo lugar y mes | P1 |
| RF-LAB-2 | El jugador elige qué comprobaría antes de concluir | P1 |
| RF-LAB-3 | «Comparar sensores» muestra la explicación con ese mismo caso | P1 |

### 4.6 Mis zonas y alertas (Función 1)
| ID | Requisito | Prio |
|---|---|---|
| RF-ZON-1 | Marcar una zona de monitoreo en el mapa (polígono) con nombre y correo de contacto | P1 |
| RF-ZON-2 | Verificación de correo (doble confirmación) antes de enviar alertas | P1 |
| RF-ZON-3 | Alerta por correo cuando se detecta un foco dentro de la zona, sin duplicados | P1 |
| RF-ZON-4 | Historial de alertas, pausar, editar y eliminar zonas; enlace de baja en cada correo | P1 |
| RF-ZON-5 | Aviso por cercanía a una zona de alto riesgo o a un incendio según la ubicación de la persona (idea de Ian) | P3 |

### 4.7 Respuesta a incendios (Función 2)
| ID | Requisito | Prio |
|---|---|---|
| RF-RES-1 | Agrupar detecciones en incidentes y calcular gravedad y expansión | P2 |
| RF-RES-2 | Ubicar activos cercanos (bomberos, Defensa Civil, brigadas, otros) y su disponibilidad | P2 |
| RF-RES-3 | Notificar a los activos necesarios, con aprobación humana o automática según configuración | P2 |
| RF-RES-4 | Panel de seguimiento del incidente hasta controlarlo (estados, avisos enviados, respuestas) | P2 |

### 4.8 Asistente de IA
| ID | Requisito | Prio |
|---|---|---|
| RF-IA-1 | Adaptador para usar cualquier modelo por API sin cambiar la lógica | P2 |
| RF-IA-2 | Agente que decide y redacta las alertas que requieren criterio | P2 |
| RF-IA-3 | Agente que ubica y contacta activos disponibles cercanos | P2 |
| RF-IA-4 | Chat de apoyo a personas: primeros auxilios y rutas hacia sitios seguros | P2 |
| RF-IA-5 | Registro de auditoría de cada ejecución, herramienta y mensaje enviado | P2 |

## 5. Requisitos no funcionales

- **Rendimiento:** el calendario de una región completa responde en menos de 2 segundos con datos precalculados; el detalle de un mes en menos de 1 segundo.
- **Fiabilidad de datos:** toda cifra muestra su unidad, período, sensores y fecha de actualización. Los meses incompletos o provisionales (datos NRT) se marcan.
- **Accesibilidad:** nivel WCAG 2.1 AA como meta; escalas de color aptas para daltonismo; uso con teclado.
- **Idioma:** español (República Dominicana) por defecto y versión en inglés para el jurado y la comunidad internacional.
- **Responsive:** funcional en teléfono (el uso en campo es probable) y en escritorio.
- **Privacidad:** consentimiento explícito para correos, mínimo de datos personales, retención limitada de ubicación y conversaciones (ver `ALERTAS-Y-RESPUESTA.md`).
- **Seguridad:** RLS en base de datos, secretos en variables de entorno, límites de tasa, validación de entradas.
- **Transparencia:** explicar el método de armonización y sus límites dentro de la aplicación.
- **Operación:** las tareas programadas son idempotentes y registran su resultado.

## 6. Fuera de alcance del MVP

- Predicción de incendios con aprendizaje automático.
- Aplicación móvil nativa.
- Despacho operativo real de bomberos u otras instituciones durante la demostración.
- Comparación de temperatura y proyecciones a futuro (idea de Ian): requiere otra fuente de datos; queda como línea futura.
- Cobertura global: el MVP cubre una región de ingesta (por defecto, República Dominicana) con diseño preparado para ampliarse.

## 7. Flujo de demostración (guion mínimo)

1. Inicio: leer la pregunta central y pulsar **Probar un caso**.
2. Mapa e historial: ver el calendario armonizado, tocar el mes del caso y mostrar detecciones, mediana y rango; abrir «Calidad de la armonización».
3. Ranking de zonas y descarga CSV.
4. Actualidad: abrir una detección reciente y pasar a Prevención y respuesta con la zona conservada.
5. Mis zonas: marcar una zona y recibir la alerta por correo (con detección simulada si no hay una real).
6. Respuesta a incendios: ver un incidente, los activos cercanos y la notificación redactada por el agente (en `DEMO_MODE`).
7. Asistente: pedir indicaciones de primeros auxilios y una ruta a un sitio seguro.
8. Laboratorio: jugar el caso de MODIS y VIIRS y abrir Comparar sensores.

## 8. Criterios de éxito

- El calendario muestra una serie continua MODIS + VIIRS sin saltos visibles en 2012 y el panel de calidad lo respalda.
- Un usuario nuevo completa el flujo «marcar zona → recibir correo» en menos de 3 minutos.
- La demostración completa corre de principio a fin sin errores y sin enviar mensajes reales.
- Cada cifra mostrada se puede rastrear a sus datos de origen.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Armonización mal calibrada | Documentar el método, mostrar calidad del ajuste, validar con un mentor o científico |
| Falsas detecciones (quemas agrícolas, fuentes industriales) | Filtro de confianza, etiquetas claras, aviso de que no es incendio confirmado |
| Límite de transacciones de FIRMS | Servidor único consulta FIRMS, throttle, caché y agregados precalculados |
| Falta de datos oficiales de activos | Datos demo etiquetados; carga y validación por el equipo |
| Respuestas del agente erróneas en temas de seguridad | Base de conocimiento curada, aviso del 9-1-1, evaluación con casos de prueba, aprobación humana a instituciones |
| Alcance excesivo para el tiempo disponible | Línea de corte P0 + P1 en `ROADMAP.md` |
