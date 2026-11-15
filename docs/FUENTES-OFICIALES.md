# Fuentes oficiales de prevención, reporte y boletines

Fecha de revisión: **2026-11-15** (UTC).
Catálogo asociado: `src/content/official-resource-catalog.json`.

## Propósito y alcance

Este documento reúne una lista corta de recursos públicos de instituciones
oficiales de República Dominicana para las secciones de Prevención, Respuesta y
Actualidad. No es una base de detecciones, no confirma incendios y no sustituye
al 9-1-1.

El catálogo solo enlaza páginas oficiales. No copia artículos completos, no
transcribe contactos ni inventa teléfonos, protocolos, brigadas o emergencias
activas. Los textos e imágenes de cada sitio pertenecen a su institución.

## Método de verificación

Para cada registro se comprobó:

1. Que la URL fuera HTTPS y respondiera con HTTP 200.
2. Que el dominio fuera oficial (`.gob.do`) y que la página mostrara el nombre
   de la institución.
3. Que el contenido visible correspondiera al título y a la categoría asignada,
   no solo que la URL existiera.
4. La fecha de publicación cuando el sitio la muestra. Si no la muestra, se
   guarda `null`; no se deduce una fecha.
5. La fecha UTC de revisión en `checkedAt`.

Las comprobaciones HTTP y de contenido se hicieron el 2026-11-15 entre las
16:00 y las 16:12 UTC. El valor `checkedAt` del catálogo registra el cierre de
esa revisión: `2026-11-15T16:12:28Z`.

## Contrato del catálogo

El archivo `src/content/official-resource-catalog.json` tiene esta forma:

```json
{
  "version": 1,
  "resources": []
}
```

Cada recurso incluye:

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | Identificador estable en kebab-case. |
| `title` | string | Título visible de la página o del documento. |
| `organization` | string | Institución oficial que publica el recurso. |
| `category` | string | `prevention`, `reporting` o `bulletins`. |
| `url` | string | URL HTTPS de la página oficial. |
| `regionCode` | string | `DO` para cobertura nacional. |
| `publishedAt` | string o null | Fecha mostrada por el sitio, en formato ISO 8601 (`YYYY-MM-DD` si solo hay fecha). |
| `checkedAt` | string | Fecha y hora UTC de la revisión, en ISO 8601. |
| `reviewStatus` | string | `verified_source` o `pending`. |
| `notes` | string | Alcance y límites del recurso. |
| `is_demo` | boolean | `false` para vínculos a fuentes reales. |

`reviewStatus: "verified_source"` significa que se comprobó la página y su
contenido visible en la fecha indicada. No significa que la institución haya
validado este proyecto ni que el recurso esté siempre actualizado.

`reviewStatus: "pending"` queda reservado para candidatos localizados que aún
no se pudieron revisar por completo. La interfaz no debe presentarlos como
recursos oficiales revisados hasta que una persona los valide.

## Fuentes verificadas

| ID | Institución | Categoría | URL | Publicación | HTTP | Evidencia visible |
|---|---|---|---|---|---|---|
| `mmarn-temporada-prevencion-incendios-forestales-2026` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `prevention` | https://ambiente.gob.do/queda-iniciada-la-temporada-de-prevencion-de-incendios-forestales-2026/ | 2026-02-14 | 200 | Título «Queda iniciada la Temporada de Prevención de Incendios Forestales 2026»; texto sobre la campaña nacional, prevención y respuesta. |
| `mmarn-refuerza-prevencion-incendios-forestales-2026` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `prevention` | https://ambiente.gob.do/medio-ambiente-refuerza-prevencion-incendios-forestales/ | 2026-07-31 | 200 | Título «Medio Ambiente refuerza la estrategia nacional de prevención ante el incremento de incendios forestales»; texto sobre vigilancia, coordinación y reporte de columnas de humo. |
| `defensa-civil-incendio-forestal` | Defensa Civil Dominicana | `prevention` | https://www.defensacivil.gob.do/index.php/incendio-forestal | — | 200 | Título «Incendio Forestal»; sección «¿Qué hacer en caso de incendio forestal?» con recomendaciones de prevención y autoprotección. |
| `911-como-usarlo` | Sistema Nacional de Atención a Emergencias y Seguridad 9-1-1 | `reporting` | https://911.gob.do/como-usarlo/ | — | 200 | Título «¿CÓMO USARLO?»; explica el 9-1-1, incluye al Cuerpo de Bomberos entre las instituciones de respuesta y declara cobertura nacional parcial. |
| `mmarn-denuncias-ambientales` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `reporting` | https://ambiente.gob.do/denuncias-ambientales/ | — | 200 | Título «Denuncias Ambientales»; publica línea directa, WhatsApp y línea sin cargos para denuncias ambientales. |
| `linea-verde-rd` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `reporting` | https://lineaverde.gob.do/ | — | 200 | Título «Realiza tus denuncias medio ambientales en Línea Verde»; formulario público de denuncias y consulta de seguimiento. |
| `mmarn-noticias` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `bulletins` | https://ambiente.gob.do/noticias/ | — | 200 | Título «Noticias»; índice de la sala de prensa del MMARN. |
| `coe-boletines` | Centro de Operaciones de Emergencias (COE) | `bulletins` | https://www.coe.gob.do/index.php/documentos-descargas/category/186-boletines | — | 200 | Título «BOLETINES»; listado de boletines operativos del COE (en la revisión, Semana Santa 2026). |

La fecha «—» significa que la página no muestra una fecha de publicación
verificable. No se rellenó con una fecha estimada.

### Candidato pendiente

| ID | Institución | Categoría | URL | HTTP | Motivo |
|---|---|---|---|---|---|
| `mmarn-estrategia-nacional-manejo-fuego-2016-2025` | Ministerio de Medio Ambiente y Recursos Naturales (MMARN) | `prevention` | https://sinia.ambiente.gob.do/documentacion/descarga/mmarn-estrategiafuego-2016/ESTRATEGIA-NACIONAL-MANEJO-DE-FUEGO-RD-2016-2025.pdf | 200 (`application/pdf`) | El PDF existe, pero el texto visible no se pudo comprobar en esta revisión. Queda `reviewStatus: "pending"` hasta que una persona lo abra y valide. |

## Limitaciones de cobertura

- **9-1-1:** la página indica cobertura de aproximadamente 91.7 % de la
  población y enumera las zonas cubiertas. No es una cobertura universal. Las
  llamadas desde municipios sin cobertura se transfieren con asistencia, según
  la misma página. Para una emergencia, la acción correcta sigue siendo llamar
  al 9-1-1.
- **Reporte de incendios forestales:** no se localizó un formulario público
  oficial específico para reportar incendios forestales. El canal de emergencia
  verificado es el 9-1-1. Las páginas de denuncias ambientales del MMARN y
  Línea Verde son canales de denuncias ambientales, no líneas de emergencia.
- **Boletines:** los boletines del COE son operativos y generales; no son un
  feed específico de incendios forestales. El índice de noticias del MMARN
  incluye temas ambientales diversos y no confirma incendios por sí solo.
- **Actualidad:** este catálogo no contiene noticias de incendios activos ni
  registros de incidentes. Las noticias y los boletines deben consultarse en su
  fuente y conservar fecha, territorio y estado reportado. Una detección
  satelital no es un incendio confirmado.
- **Contactos:** el catálogo no transcribe teléfonos ni correos. Enlaza las
  páginas oficiales que los publican para evitar datos duplicados o
  desactualizados. Cualquier contacto que se muestre en la interfaz debe salir
  de la página oficial enlazada y llevar su fecha de revisión.
- **Vigencia:** una URL puede cambiar o dejar de responder después de
  `checkedAt`. La revisión debe repetirse antes de publicar cambios.

## Candidatos descartados o no verificados

Estos sitios se probaron, pero no se incluyeron como recursos verificados:

- `https://bomberosrd.gob.do/`: respondió HTTP 404 el 2026-11-15.
- `https://www.bomberos.gob.do/` y `https://proteccioncivil.gob.do/`: el nombre
  no resolvió por DNS en la revisión.
- `https://cbdn.gob.do/`: carga, pero muestra «ESTAMOS EN CONTRUCCION» y solo
  información de contacto; no se verificó un formulario público de reporte.
- `https://www.cne.gob.do/`: es la Comisión Nacional de Energía, no la gestión
  de emergencias. Se excluye para evitar confusión.
- `https://comisiondeemergencias.gob.do/`: es la Comisión Nacional de
  Emergencias. Su portada respondió 200 y se revisó, pero no se identificó en
  esta pasada un recurso específico de incendios forestales que cumpliera el
  alcance. Puede evaluarse en una revisión posterior.
- Artículos de noticias sobre incendios de fechas anteriores: no se incluyen
  como boletines actuales para no presentar incidentes pasados como si fueran
  información vigente.

## Licencia y atribución

No se encontró una licencia explícita de reutilización en las páginas
revisadas. Por eso el catálogo se limita a enlazar la fuente original y no
reproduce artículos, imágenes ni documentos completos. La atribución visible
debe incluir el nombre de la institución y el enlace a la página oficial. Si el
equipo quiere reutilizar texto o imágenes, debe revisar los términos de uso de
cada sitio o pedir autorización.

## Cómo actualizar el catálogo

1. Abrir la URL y confirmar HTTP 200, institución y contenido visible.
2. Revisar si la página sigue siendo pertinente para prevención, reporte o
   boletines.
3. Actualizar `checkedAt` con la fecha UTC de la nueva revisión.
4. Cambiar `reviewStatus` solo si la revisión fue completa.
5. Anotar en este documento cualquier cambio de URL, fecha o alcance.
6. No agregar teléfonos, correos, protocolos clínicos ni disponibilidad de
   brigadas desde memoria.

## Aviso de emergencia

En una emergencia en República Dominicana, llama al **9-1-1**. Este catálogo y
la aplicación no sustituyen a los servicios de emergencia. Una detección
satelital no es un incendio confirmado.

## Revisión de integración de Prevención/Respuesta

La ficha `911-como-usarlo` pasa a `pending`: la revisión central obtuvo HTTP 403
y no pudo repetir la comprobación. Se excluye de la interfaz y de fichas exportadas
hasta validar su contenido de nuevo. La tabla anterior conserva el registro histórico
de la revisión inicial; no representa el estado vigente de esa ficha. El aviso general
de emergencia del proyecto y el enlace voluntario `tel:911` permanecen.

El contexto de Respuesta se resuelve por ID de un registro sintético conocido;
los parámetros antiguos con coordenadas se aceptan solo si coinciden con ese registro.
No se admiten observaciones inventadas por texto libre en un enlace.
