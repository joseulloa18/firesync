# Contenido de primeros auxilios

Esta carpeta no contiene instrucciones clínicas. El equipo debe aportar contenido
revisado por una persona calificada antes de habilitarlo en el asistente.

El cargador lee exclusivamente `kb/primeros-auxilios/index.json`, con un arreglo
de objetos que contienen `topic`, `locale` (`es` o `en`), `text`, `sourceUrl`,
`reviewer` y `reviewedAt` (`YYYY-MM-DD`). No se elige una ruta de archivo a partir
del mensaje del usuario. Cada entrada tiene una fuente pública, revisor y fecha;
las entradas futuras o inválidas no se sirven. Máximo 100 entradas de 6000
caracteres y cinco fragmentos por consulta.

Sin un archivo válido o sin el tema solicitado, la herramienta devuelve
`status: "unavailable"`; el asistente debe explicarlo y remitir a personal médico
o emergencias. Nunca sustituir el contenido faltante con texto médico inventado.
