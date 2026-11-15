// Vista previa de archivos históricos locales de FIRMS.
// Solo lee CSV y un manifiesto: no descarga, no escribe en la base de datos y
// no envía correos. Uso:
//   pnpm ingest:preview --dir ./data/firms
//   pnpm ingest:preview --dir ./data/firms --manifest manifest.json
import {
  DEFAULT_MANIFEST_FILE,
  LOCAL_PREVIEW_LIMITS,
  LocalPreviewError,
  previewLocalArchive,
} from "../src/lib/ingest/local-preview";

interface CliArguments {
  readonly directory: string;
  readonly manifestFileName: string;
}

const USAGE = `Vista previa de CSV históricos locales de FIRMS (solo lectura).

Uso:
  pnpm ingest:preview --dir <carpeta> [--manifest <archivo.json>]

Argumentos:
  --dir <carpeta>        Carpeta que contiene el manifiesto y los CSV.
  --manifest <archivo>   Manifiesto dentro de la carpeta (por defecto ${DEFAULT_MANIFEST_FILE}).
  --help, -h             Muestra esta ayuda.

Límites por defecto:
  ${LOCAL_PREVIEW_LIMITS.maxFiles} archivos, ${LOCAL_PREVIEW_LIMITS.maxFileBytes} bytes por CSV,
  ${LOCAL_PREVIEW_LIMITS.maxTotalBytes} bytes en total y
  ${LOCAL_PREVIEW_LIMITS.maxManifestBytes} bytes para el manifiesto.

El informe JSON se escribe en la salida estándar. No se escribe ningún archivo.
`;

function readOptionValue(
  argv: readonly string[],
  index: number,
  name: string,
): { value: string; nextIndex: number } {
  const argument = argv[index] as string;
  const equalsPrefix = `${name}=`;
  if (argument.startsWith(equalsPrefix)) {
    const value = argument.slice(equalsPrefix.length);
    if (value === "") {
      throw new Error(`Falta el valor de ${name}.`);
    }
    return { value, nextIndex: index };
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Falta el valor de ${name}.`);
  }
  return { value, nextIndex: index + 1 };
}

function parseArguments(argv: readonly string[]): CliArguments | null {
  let directory: string | null = null;
  let manifestFileName = DEFAULT_MANIFEST_FILE;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (argument === "--help" || argument === "-h") {
      return null;
    }
    if (argument === "--dir" || argument.startsWith("--dir=")) {
      if (directory !== null) {
        throw new Error("--dir se indicó más de una vez.");
      }
      const parsed = readOptionValue(argv, index, "--dir");
      directory = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === "--manifest" || argument.startsWith("--manifest=")) {
      const parsed = readOptionValue(argv, index, "--manifest");
      manifestFileName = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    throw new Error(`Argumento desconocido: ${argument}`);
  }

  if (directory === null) {
    throw new Error("Falta --dir <carpeta>.");
  }
  return { directory, manifestFileName };
}

function writeError(error: unknown): void {
  if (error instanceof LocalPreviewError) {
    process.stderr.write(`Error (${error.code}): ${error.message}\n`);
    for (const issue of error.issues) {
      process.stderr.write(`  - ${issue.path}: ${issue.message}\n`);
    }
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
}

async function main(): Promise<number> {
  let args: CliArguments | null;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error: unknown) {
    writeError(error);
    process.stderr.write("Usa --help para ver el uso.\n");
    return 1;
  }

  if (args === null) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    const report = await previewLocalArchive({
      directory: args.directory,
      manifestFileName: args.manifestFileName,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error: unknown) {
    writeError(error);
    return 1;
  }
}

// `await` en el nivel superior mantiene el código simple; tsx ejecuta este
// archivo como módulo ESM.
process.exitCode = await main();
