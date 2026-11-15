# Identidad visual de FireSync

Estado: prototipo explícito con datos sintéticos. Este documento describe la
marca de la interfaz; no afirma respaldo institucional ni datos reales de NASA.

## Logo

- Archivo único: `public/images/firesync-logo.jpeg` (919 × 887 píxeles,
  proporción aproximada 1.036:1). Es el logo aportado por el usuario y la
  coordinación lo incluyó intacto en el repositorio.
- No se recorta, recolorea, estira ni regenera. Tampoco se sustituye por un
  icono dibujado, un SVG aproximado o una versión «mejorada» generada por el
  equipo.
- El fondo del archivo es un marfil cálido (`#FEF7F1`) muy cercano al fondo de
  la cabecera (`#fff9f4`), por lo que no hace falta recortarlo ni añadir un
  recuadro blanco.

## Uso en la interfaz

### Encabezado

- El enlace de marca contiene el logo y el texto **FireSync**. El texto es el
  único rótulo: ya no aparece «Calendario de fuego» / «Fire Calendar» debajo.
  No se añade otra leyenda en su lugar.
- El logo se muestra con altura fija y ancho automático (`height: 44px`), de
  modo que la proporción del archivo se conserva. En anchos de hasta 720 px
  baja a `38px` para que la cabecera siga siendo usable a 390 px.
- Los siete destinos de navegación, el selector ES / EN y la píldora melocotón
  de la página activa no cambian.

### Pie de página

- La marca del pie repite el mismo logo (altura `20px`, `18px` en móvil) en
  lugar del antiguo icono de llama, para que la identidad sea coherente.

### Estilos

- Los estilos de la marca viven en `src/components/brand.css`, importado desde
  `src/components/shell.tsx`. No se modifican `src/app/globals.css` ni otros
  estilos compartidos.
- `brand.css` solo fija tamaño y proporción del logo; la maqueta de la cabecera
  sigue saliendo de `globals.css`.

## Accesibilidad

- La imagen se marca como decorativa (`alt=""`) porque el nombre accesible lo
  aporta el texto visible. El enlace de marca expone el nombre exacto
  **FireSync**, sin prefijos como «Logo» ni duplicados.
- El logo no comunica estado por sí solo y no sustituye a ningún texto
  obligatorio de la interfaz.
- La cabecera mantiene el orden de foco, el enlace «Saltar al contenido» y los
  controles alcanzables con teclado.

## Verificación

`tests/e2e/branding.spec.ts` comprueba, en español, inglés y a 390 px:

1. que el encabezado usa la imagen exacta `/images/firesync-logo.jpeg` y que el
   archivo carga de verdad (`naturalWidth`);
2. que la caja renderizada conserva la proporción del archivo, sin distorsión;
3. que el texto de marca es solo «FireSync» y no queda ningún subtítulo ni
   leyenda sustituta;
4. que siguen los siete enlaces, el idioma, la navegación activa y el nombre
   accesible del enlace;
5. que no hay desbordamiento horizontal a 390 px y que el logo cabe completo.

Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm test` y, en la revisión de
coordinación, `pnpm build` + `pnpm test:e2e`.

## Pendiente de coordinación

- `docs/DISENO-UI.md` (sección «Cabecera») todavía menciona la leyenda
  «Calendario de fuego». Este documento y `docs/HISTORIAL-V2-CONTRATO.md` son
  más específicos y recientes, pero el archivo pertenece a otra tarea: debe
  actualizarse al integrar, sin tocar estilos compartidos.
- Las claves `tagline` de `messages/es.json` y `messages/en.json` quedan sin uso
  en la cabecera. Su retiro corresponde a la tarea que administra los mensajes.
