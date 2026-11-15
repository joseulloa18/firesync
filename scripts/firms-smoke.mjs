// Node 24 LTS. Uses the existing TypeScript client without another runner.
import { registerHooks } from "node:module";
import { extname } from "node:path";

const usage =
  "Usage: node --env-file-if-exists=.env.local scripts/firms-smoke.mjs [--source MODIS_SP] [--date YYYY-MM-DD] [--bbox west,south,east,north]";
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log(usage);
} else {
  try {
    const input = {};
    const names = { "--source": "source", "--date": "date", "--bbox": "bbox" };
    for (let i = 0; i < args.length; i += 2) {
      const name = names[args[i]];
      const value = args[i + 1];
      if (
        !Object.hasOwn(names, args[i]) ||
        !value ||
        Object.hasOwn(input, name)
      ) {
        throw new Error("invalid_input");
      }
      input[name] = name === "bbox" ? value.split(",").map(Number) : value;
    }
    if (!process.env.FIRMS_MAP_KEY?.trim()) {
      throw new Error("missing_key");
    }
    const sourceRoot = new URL("../src/", import.meta.url).href;
    // Existing bundler imports omit .ts; resolve them only inside our sources.
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (
          context.parentURL?.startsWith(sourceRoot) &&
          specifier.startsWith(".") &&
          !extname(specifier)
        ) {
          return nextResolve(specifier + ".ts", context);
        }
        return nextResolve(specifier, context);
      },
    });
    const { probeFirms, FirmsProbeError } =
      await import("../src/lib/firms-client/probe.ts");
    try {
      const summary = await probeFirms(input, {
        mapKey: process.env.FIRMS_MAP_KEY,
        fetch: globalThis.fetch,
      });
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error(
        JSON.stringify({
          status: "failed",
          code:
            error instanceof FirmsProbeError ? error.code : "execution_error",
          persisted: false,
        }),
      );
      process.exitCode = 1;
    }
  } catch (error) {
    const code =
      error instanceof Error &&
      ["missing_key", "invalid_input"].includes(error.message)
        ? error.message
        : error?.code === "ERR_MODULE_NOT_FOUND"
          ? "missing_dependencies"
          : "execution_error";
    console.error(JSON.stringify({ status: "failed", code, persisted: false }));
    process.exitCode = 1;
  }
}
