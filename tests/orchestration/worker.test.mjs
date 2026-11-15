// Pruebas del worker distribuido de FIRESYNC.
// No usan red ni gh real: se inyecta un ejecutor falso y un registro temporal.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertGitCommand,
  assertIssueNumber,
  assertPublishPush,
  buildOpenCodeArgs,
  detectOpenCode,
  resolveOpenCodeBin,
  formatIssueContext,
  isEligibleIssue,
  listWorktrees,
  parseArgs,
  runWorker,
  validateModel,
  validateStation,
  writeIssueContext,
  WorkerError,
} from "../../orquestacion/worker/worker.mjs";

const STATION = {
  id: "pc-1-dariana",
  github: "dariana",
  os: "windows",
  maxSessions: 2,
};
const USER = "dariana";
const REPO = "joseulloa18/firesync";

function registry(stations = [STATION]) {
  return { stations };
}

function makeExec(handlers) {
  const calls = [];
  const exec = (program, args, options = {}) => {
    calls.push({ program, args, cwd: options.cwd, options });
    for (const handler of handlers) {
      const result = handler(program, args, options);
      if (result) return { status: 0, stdout: "", stderr: "", ...result };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  exec.calls = calls;
  return exec;
}

function issue(number, overrides = {}) {
  return {
    number,
    title: `Tarea ${number}`,
    url: `https://github.com/${REPO}/issues/${number}`,
    state: "OPEN",
    labels: [{ name: `station:${STATION.id}` }, { name: "worker:ready" }],
    assignees: [{ login: USER }],
    ...overrides,
  };
}

function tempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "firesync-worker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function baseHandlers({ repoRoot, login = USER, issues = [], worktrees = [] }) {
  return [
    (program, args, options) => {
      if (
        program === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "--show-toplevel"
      ) {
        return {
          stdout: `${options.cwd === repoRoot ? repoRoot : options.cwd}\n`,
        };
      }
      if (program === "git" && args[0] === "worktree" && args[1] === "list") {
        const blocks = worktrees
          .map(
            (entry) =>
              `worktree ${entry.path}\nHEAD abc\nbranch ${entry.branch}\n`,
          )
          .join("\n");
        return { stdout: blocks };
      }
      if (
        program === "git" &&
        args[0] === "branch" &&
        args[1] === "--show-current"
      ) {
        return { stdout: `hackathon/issue-7\n` };
      }
      if (
        program === "git" &&
        args[0] === "status" &&
        args[1] === "--porcelain"
      ) {
        return { stdout: "" };
      }
      if (program === "gh" && args[0] === "api" && args[1] === "user") {
        return { stdout: JSON.stringify({ login }) };
      }
      if (program === "gh" && args[0] === "repo" && args[1] === "view") {
        return {
          stdout: JSON.stringify({
            nameWithOwner: REPO,
            viewerPermission: "WRITE",
          }),
        };
      }
      if (program === "gh" && args[0] === "issue" && args[1] === "list") {
        return { stdout: JSON.stringify(issues) };
      }
      return undefined;
    },
  ];
}

// ---------------------------------------------------------------------------
// Validacion de entrada
// ---------------------------------------------------------------------------

test("parseArgs acepta el contrato completo con valores por defecto", () => {
  const opts = parseArgs([
    "--station",
    "pc-1-dariana",
    "--max-sessions",
    "3",
    "--once",
    "--check",
    "--dry-run",
    "--issue",
    "12",
    "--repo",
    REPO,
    "--work-root",
    "C:\\tmp\\wt",
    "--model",
    "openrouter/openrouter/free",
  ]);
  assert.equal(opts.station, "pc-1-dariana");
  assert.equal(opts.maxSessions, 3);
  assert.equal(opts.once, true);
  assert.equal(opts.check, true);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.issue, 12);
  assert.equal(opts.repo, REPO);
  assert.equal(opts.model, "openrouter/openrouter/free");

  const defaults = parseArgs(["--station", "pc-2-ian"]);
  assert.equal(defaults.model, "opencode/big-pickle");
  assert.equal(defaults.repo, REPO);
  assert.equal(defaults.maxSessions, null);
});

test("parseArgs rechaza inyeccion, numeros invalidos y flags desconocidos", () => {
  const bad = [
    ["--station", "pc-1; rm -rf /"],
    ["--station", "pc-1-dariana", "--issue", "1; rm -rf /"],
    ["--station", "pc-1-dariana", "--issue", "0"],
    ["--station", "pc-1-dariana", "--max-sessions", "0"],
    ["--station", "pc-1-dariana", "--max-sessions", "2; drop"],
    ["--station", "pc-1-dariana", "--repo", "owner/repo; rm"],
    ["--station", "pc-1-dariana", "--push"],
    ["--station", "pc-1-dariana", "7"],
    ["--station", "pc-1-dariana", "--work-root", 'C:\\x"y'],
  ];
  for (const argv of bad) {
    assert.throws(
      () => parseArgs(argv),
      WorkerError,
      `debio rechazar ${argv.join(" ")}`,
    );
  }
  assert.throws(() => parseArgs([]), /--station es obligatorio/);
});

test("validateModel solo admite el modelo gratuito de OpenRouter", () => {
  assert.equal(validateModel("opencode/big-pickle"), "opencode/big-pickle");
  assert.equal(
    validateModel("openrouter/openrouter/free"),
    "openrouter/openrouter/free",
  );
  for (const model of [
    "openrouter/auto",
    "openrouter/anthropic/claude",
    "sin-proveedor",
    "OpenCode/Big-Pickle",
    "modelo con espacios/x",
  ]) {
    assert.throws(
      () => validateModel(model),
      WorkerError,
      `debio rechazar ${model}`,
    );
  }
});

test("assertIssueNumber acepta solo enteros positivos", () => {
  assert.equal(assertIssueNumber("42"), 42);
  assert.equal(assertIssueNumber(7), 7);
  for (const value of ["0", "-1", "1.5", "1; ls", "../7", " 7", ""]) {
    assert.throws(() => assertIssueNumber(value), WorkerError);
  }
});

test("validateStation exige una estacion unica y valida", () => {
  const station = validateStation(registry(), STATION.id);
  assert.equal(station.stationLabel, "station:pc-1-dariana");
  assert.equal(station.readyLabel, "worker:ready");

  assert.throws(
    () => validateStation(registry(), "pc-9-nadie"),
    /Estacion desconocida/,
  );
  assert.throws(
    () => validateStation(registry([STATION, STATION]), STATION.id),
    /duplicada/,
  );
  assert.throws(
    () =>
      validateStation(
        registry([{ ...STATION, github: "mal user" }]),
        STATION.id,
      ),
    /GitHub valido/,
  );
  assert.throws(
    () =>
      validateStation(registry([{ ...STATION, maxSessions: 0 }]), STATION.id),
    /maxSessions invalido/,
  );
  assert.throws(() => validateStation({}), /stations/);
});

// ---------------------------------------------------------------------------
// Asignacion de issues
// ---------------------------------------------------------------------------

test("solo son elegibles issues abiertos, asignados y con ambas etiquetas", () => {
  const station = validateStation(registry(), STATION.id);
  assert.equal(isEligibleIssue(issue(1), station, USER), true);

  assert.equal(
    isEligibleIssue(issue(2, { state: "CLOSED" }), station, USER),
    false,
  );
  assert.equal(
    isEligibleIssue(
      issue(3, { assignees: [{ login: "otro" }] }),
      station,
      USER,
    ),
    false,
  );
  assert.equal(
    isEligibleIssue(issue(4, { assignees: [] }), station, USER),
    false,
  );
  assert.equal(
    isEligibleIssue(
      issue(5, { labels: [{ name: "worker:ready" }] }),
      station,
      USER,
    ),
    false,
  );
  assert.equal(
    isEligibleIssue(
      issue(6, { labels: [{ name: `station:${STATION.id}` }] }),
      station,
      USER,
    ),
    false,
  );
  assert.equal(
    isEligibleIssue(issue(7, { number: "x" }), station, USER),
    false,
  );
});

// ---------------------------------------------------------------------------
// Seguridad de comandos
// ---------------------------------------------------------------------------

test("git no puede resetear, limpiar, borrar ni subir trabajo", () => {
  const blocked = [
    ["reset", "--hard"],
    ["clean", "-fd"],
    ["restore", "."],
    ["push", "origin", "hackathon/issue-1"],
    ["rm", "-rf", "carpeta"],
    ["worktree", "remove", "--force", "x"],
    ["checkout", "-f", "main"],
    ["switch", "--force", "main"],
    ["branch", "-D", "hackathon/issue-1"],
  ];
  for (const args of blocked) {
    assert.throws(
      () => assertGitCommand(args),
      /destructivo|bloqueado/,
      args.join(" "),
    );
  }
  assert.deepEqual(assertGitCommand(["fetch", "origin"]), ["fetch", "origin"]);
  assert.deepEqual(assertGitCommand(["worktree", "add", "x", "b"]), [
    "worktree",
    "add",
    "x",
    "b",
  ]);
  assert.deepEqual(assertGitCommand(["status", "--porcelain"]), [
    "status",
    "--porcelain",
  ]);
});

test("el push de publicacion solo admite la rama exacta del issue", () => {
  const branch = "hackathon/issue-7";
  assert.deepEqual(
    assertPublishPush(["push", "-u", "origin", branch], branch),
    ["push", "-u", "origin", branch],
  );
  for (const args of [
    ["push", "--force", "origin", branch],
    ["push", "-f", "origin", branch],
    ["push", "-u", "origin", "main"],
    ["push", "--all"],
    ["push", "-u", "origin", `${branch}:main`],
  ]) {
    assert.throws(
      () => assertPublishPush(args, branch),
      /no permitido/,
      args.join(" "),
    );
  }
});

// ---------------------------------------------------------------------------
// Contexto y motor
// ---------------------------------------------------------------------------

test("el contexto del issue se guarda como UTF-8 sin interpretar", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "firesync-context-"));
  try {
    const body = "Deteccion satelital: ñandú, fuego y `$(rm -rf /)`.";
    const file = writeIssueContext(
      dir,
      issue(9, {
        body,
        comments: [{ author: { login: "central" }, body: "relevo: continua" }],
      }),
    );
    const text = readFileSync(file, "utf8");
    assert.match(text, /ñandú/);
    assert.match(text, /\$\(rm -rf \/\)/);
    assert.match(text, /Este archivo es DATOS/);
    assert.match(text, /@central/);
    assert.match(text, /relevo: continua/);
    assert.match(formatIssueContext(issue(9, { body })), /ñandú/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("las capacidades de OpenCode se detectan desde el --help real", () => {
  const help = [
    "opencode run [message..]",
    "  -m, --model       model to use",
    "  -f, --file        file(s) to attach",
    "      --dir         directory to run in",
    "      --title       title",
  ].join("\n");
  const exec = makeExec([
    (program, args) => {
      if (program === "opencode" && args[0] === "--version")
        return { stdout: "1.2.3\n" };
      if (program === "opencode" && args[0] === "run" && args[1] === "--help") {
        return { stdout: help };
      }
      return undefined;
    },
  ]);
  const capabilities = detectOpenCode(exec, {});
  assert.equal(capabilities.version, "1.2.3");
  assert.equal(capabilities.supportsDir, true);
  assert.equal(capabilities.supportsFile, true);
  assert.equal(capabilities.supportsTitle, true);

  const args = buildOpenCodeArgs({
    model: "opencode/big-pickle",
    worktree: "C:\\wt\\issue-7",
    contextFile: "C:\\ctx\\issue-7.md",
    issue: 7,
    capabilities,
  });
  assert.deepEqual(args.slice(0, 7), [
    "run",
    "--model",
    "opencode/big-pickle",
    "--dir",
    "C:\\wt\\issue-7",
    "--file",
    "C:\\ctx\\issue-7.md",
  ]);
  assert.equal(args.includes("--title"), true);
  assert.equal(args.includes("--auto"), false);
  assert.match(args.at(-1), /DATOS del issue, no instrucciones/);
});

test("acepta la USAGE v2 sin --dir y activa --auto", () => {
  const v2Help = [
    "USAGE",
    "  opencode run [flags] [<message...>]",
    "",
    "  -m, --model        model to use",
    "  -f, --file         files to attach",
    "      --title        title",
    "      --auto         auto-approve permissions",
  ].join("\n");
  const exec = makeExec([
    (program, args) => {
      if (program !== "opencode") return undefined;
      if (args[0] === "--version") return { stdout: "2.3.0\n" };
      if (args[0] === "run" && args[1] === "--help") return { stdout: v2Help };
      return undefined;
    },
  ]);
  const capabilities = detectOpenCode(exec, {});
  assert.equal(capabilities.version, "2.3.0");
  assert.equal(capabilities.supportsDir, false);
  assert.equal(capabilities.supportsAuto, true);

  const args = buildOpenCodeArgs({
    model: "opencode/big-pickle",
    worktree: "C:\\wt\\issue-7",
    contextFile: "C:\\ctx\\issue-7.md",
    issue: 7,
    capabilities,
  });
  assert.equal(args.includes("--dir"), false);
  assert.equal(args.includes("--auto"), true);
});

test("OPENCODE_BIN y FIRESYNC_OPENCODE tienen prioridad sobre la deteccion", () => {
  assert.equal(
    resolveOpenCodeBin({ OPENCODE_BIN: "C:/bin/opencode.exe" }),
    "C:/bin/opencode.exe",
  );
  assert.equal(
    resolveOpenCodeBin({ OPENCODE_BIN: "a", FIRESYNC_OPENCODE: "b" }),
    "a",
  );
  assert.equal(resolveOpenCodeBin({ FIRESYNC_OPENCODE: "c" }), "c");

  const exec = makeExec([
    (program, args) => {
      if (program !== "C:/bin/opencode.exe") return undefined;
      if (args[0] === "--version") return { stdout: "2.3.0\n" };
      if (args[1] === "--help") {
        return { stdout: "opencode run [flags]\n--model\n--file\n--auto\n" };
      }
      return undefined;
    },
  ]);
  const capabilities = detectOpenCode(exec, {
    OPENCODE_BIN: "C:/bin/opencode.exe",
  });
  assert.equal(capabilities.bin, "C:/bin/opencode.exe");
  assert.equal(capabilities.supportsAuto, true);
});

test("listWorktrees parsea el formato porcelain", () => {
  const exec = makeExec([
    () => ({
      stdout: [
        "worktree C:/repo",
        "HEAD abc",
        "branch refs/heads/main",
        "",
        "worktree C:/wt/issue-7",
        "HEAD def",
        "branch refs/heads/hackathon/issue-7",
        "",
      ].join("\n"),
    }),
  ]);
  const entries = listWorktrees(exec, "C:/repo");
  assert.equal(entries.length, 2);
  assert.equal(entries[1].branch, "refs/heads/hackathon/issue-7");
});

// ---------------------------------------------------------------------------
// Flujo del worker
// ---------------------------------------------------------------------------

test("dry-run solo planifica issues elegibles y no crea worktrees", async (t) => {
  const repoRoot = tempDir(t);
  const workRoot = path.join(
    repoRoot,
    "..",
    `${path.basename(repoRoot)}-worktrees`,
  );
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));

  const issues = [
    issue(5),
    issue(6, { state: "CLOSED" }),
    issue(7, { assignees: [{ login: "otro" }] }),
    issue(8, { labels: [{ name: "worker:ready" }] }),
  ];
  const exec = makeExec(baseHandlers({ repoRoot, issues }));
  const output = [];

  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id, "--dry-run"]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    {
      exec,
      cwd: repoRoot,
      registry: registry(),
      log: (line) => output.push(line),
    },
  );

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.planned, [5]);
  assert.equal(result.report.processed[0].stage, "plan");
  assert.equal(result.report.pushed, false);
  assert.equal(result.report.merged, false);
  const commands = exec.calls.map((call) => call.args.join(" "));
  assert.equal(
    commands.some((line) => line.startsWith("worktree add")),
    false,
  );
  assert.equal(
    commands.some((line) => line.startsWith("fetch")),
    false,
  );
  assert.equal(
    exec.calls.some((call) => call.program === "opencode"),
    false,
  );
});

test("respeta el limite de la estacion y --once", async (t) => {
  const repoRoot = tempDir(t);
  const workRoot = path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`);
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));
  const issues = [issue(1), issue(2)];
  const exec = makeExec(baseHandlers({ repoRoot, issues }));

  const limited = await runWorker(
    {
      ...parseArgs([
        "--station",
        STATION.id,
        "--dry-run",
        "--max-sessions",
        "9",
      ]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    {
      exec,
      cwd: repoRoot,
      registry: registry([{ ...STATION, maxSessions: 1 }]),
      log: () => {},
    },
  );
  assert.deepEqual(limited.report.planned, [1]);

  const execOnce = makeExec(baseHandlers({ repoRoot, issues }));
  const once = await runWorker(
    {
      ...parseArgs(["--station", STATION.id, "--dry-run", "--once"]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    { exec: execOnce, cwd: repoRoot, registry: registry(), log: () => {} },
  );
  assert.deepEqual(once.report.planned, [1]);
});

test("rechaza una cuenta de gh distinta a la estacion", async (t) => {
  const repoRoot = tempDir(t);
  const exec = makeExec(baseHandlers({ repoRoot, login: "intruso" }));
  await assert.rejects(
    runWorker(
      {
        ...parseArgs(["--station", STATION.id, "--dry-run"]),
        repo: REPO,
        workRoot: path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`),
        model: "opencode/big-pickle",
      },
      { exec, cwd: repoRoot, registry: registry(), log: () => {} },
    ),
    /no corresponde a la estacion/,
  );
});

test("rechaza un issue --issue que no cumple asignacion o etiquetas", async (t) => {
  const repoRoot = tempDir(t);
  const handlers = [
    ...baseHandlers({ repoRoot, issues: [] }),
    (program, args) => {
      if (program === "gh" && args[0] === "issue" && args[1] === "view") {
        return {
          stdout: JSON.stringify(issue(9, { assignees: [{ login: "otro" }] })),
        };
      }
      return undefined;
    },
  ];
  const exec = makeExec(handlers);
  await assert.rejects(
    runWorker(
      {
        ...parseArgs(["--station", STATION.id, "--issue", "9"]),
        repo: REPO,
        workRoot: path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`),
        model: "opencode/big-pickle",
      },
      { exec, cwd: repoRoot, registry: registry(), log: () => {} },
    ),
    /no es elegible/,
  );
});

test("se niega a lanzar el agente si el worktree tiene cambios sin commit", async (t) => {
  const repoRoot = tempDir(t);
  const workRoot = path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`);
  const worktreePath = path.join(workRoot, "issue-7");
  mkdirSync(worktreePath, { recursive: true });
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));

  const handlers = [
    (program, args) => {
      if (
        program === "git" &&
        args[0] === "status" &&
        args[1] === "--porcelain"
      ) {
        return { stdout: " M src/app/page.tsx\n" };
      }
      return undefined;
    },
    ...baseHandlers({
      repoRoot,
      issues: [issue(7)],
      worktrees: [
        {
          path: worktreePath.replace(/\\/g, "/"),
          branch: "refs/heads/hackathon/issue-7",
        },
      ],
    }),
  ];
  const exec = makeExec(handlers);
  const output = [];

  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    {
      exec,
      cwd: repoRoot,
      registry: registry(),
      log: (line) => output.push(line),
    },
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.processed[0].stage, "dirty");
  assert.equal(
    exec.calls.some((call) => call.program === "opencode"),
    false,
  );
  assert.equal(
    output.some((line) => line.includes("cambios sin commit")),
    true,
  );
});

test("se niega a mover una rama que ya vive en otro worktree", async (t) => {
  const repoRoot = tempDir(t);
  const workRoot = path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`);
  const otherPath = path.join(repoRoot, "..", "otro-worktree");
  mkdirSync(otherPath, { recursive: true });
  t.after(() => rmSync(otherPath, { recursive: true, force: true }));
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));

  const exec = makeExec(
    baseHandlers({
      repoRoot,
      issues: [issue(7)],
      worktrees: [
        {
          path: otherPath.replace(/\\/g, "/"),
          branch: "refs/heads/hackathon/issue-7",
        },
      ],
    }),
  );

  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    { exec, cwd: repoRoot, registry: registry(), log: () => {} },
  );

  assert.equal(result.exitCode, 1);
  assert.equal(result.report.processed[0].stage, "worktree");
  assert.equal(
    exec.calls.some((call) => call.program === "opencode"),
    false,
  );
});

test("un worktree sucio no bloquea a los demas issues", async (t) => {
  const repoRoot = tempDir(t);
  const workRoot = path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`);
  const dirtyPath = path.join(workRoot, "issue-7");
  const cleanPath = path.join(workRoot, "issue-8");
  mkdirSync(dirtyPath, { recursive: true });
  mkdirSync(cleanPath, { recursive: true });
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));

  const handlers = [
    (program, args, options) => {
      if (
        program === "git" &&
        args[0] === "branch" &&
        args[1] === "--show-current"
      ) {
        return {
          stdout: `${path.basename(options.cwd).replace("issue-", "hackathon/issue-")}\n`,
        };
      }
      if (
        program === "git" &&
        args[0] === "status" &&
        args[1] === "--porcelain"
      ) {
        return { stdout: options.cwd === dirtyPath ? " M x\n" : "" };
      }
      if (program === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: "abc\n" };
      }
      if (program === "git" && args[0] === "rev-list") {
        return { stdout: args[2]?.includes("abc..HEAD") ? "1\n" : "0\n" };
      }
      if (program === "gh" && args[0] === "issue" && args[1] === "view") {
        return { stdout: JSON.stringify(issue(8, { body: "cuerpo" })) };
      }
      if (program === "opencode" && args[0] === "--version")
        return { stdout: "1.0.0\n" };
      if (program === "opencode" && args[0] === "run" && args[1] === "--help") {
        return {
          stdout:
            "opencode run [message..]\n-m, --model\n-f, --file\n--dir\n--title\n",
        };
      }
      if (program === "opencode" && args[0] === "run") return { status: 0 };
      return undefined;
    },
    ...baseHandlers({
      repoRoot,
      issues: [issue(7), issue(8)],
      worktrees: [
        {
          path: dirtyPath.replace(/\\/g, "/"),
          branch: "refs/heads/hackathon/issue-7",
        },
        {
          path: cleanPath.replace(/\\/g, "/"),
          branch: "refs/heads/hackathon/issue-8",
        },
      ],
    }),
  ];
  const exec = makeExec(handlers);

  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    { exec, cwd: repoRoot, registry: registry(), log: () => {} },
  );

  assert.equal(result.exitCode, 1);
  const stages = result.report.processed.map((entry) => entry.stage);
  assert.deepEqual(stages, ["dirty", "run"]);
  assert.equal(result.report.processed[1].commits, 1);
  assert.equal(result.report.pushed, false);
  const agentCalls = exec.calls.filter(
    (call) =>
      call.program === "opencode" &&
      call.args[0] === "run" &&
      call.args[1] !== "--help",
  );
  assert.equal(agentCalls.length, 1);
  assert.equal(agentCalls[0].args.includes("--push"), false);
});

// ---------------------------------------------------------------------------
// Publicacion automatica
// ---------------------------------------------------------------------------

function publicationExec({ repoRoot, worktreePath, prs = [], testExit = 0 }) {
  const normalized = worktreePath.replace(/\\/g, "/");
  return makeExec([
    (program, args, options) => {
      if (
        program === "git" &&
        args[0] === "rev-parse" &&
        args[1] === "--show-toplevel"
      ) {
        return { stdout: `${options.cwd}\n` };
      }
      if (program === "git" && args[0] === "worktree" && args[1] === "list") {
        return {
          stdout: `worktree ${normalized}\nHEAD abc\nbranch refs/heads/hackathon/issue-7\n`,
        };
      }
      if (
        program === "git" &&
        args[0] === "branch" &&
        args[1] === "--show-current"
      ) {
        return { stdout: "hackathon/issue-7\n" };
      }
      if (
        program === "git" &&
        args[0] === "status" &&
        args[1] === "--porcelain"
      ) {
        return { stdout: "" };
      }
      if (program === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: "abc123\n" };
      }
      if (program === "git" && args[0] === "rev-list") {
        return { stdout: args[2]?.includes("abc123..HEAD") ? "1\n" : "2\n" };
      }
      if (program === "git" && args[0] === "push") return { status: 0 };
      if (program === "git" && args[0] === "ls-remote") {
        return { stdout: "ref: refs/heads/main\tHEAD\n" };
      }
      if (program === "gh" && args[0] === "api" && args[1] === "user") {
        return { stdout: JSON.stringify({ login: USER }) };
      }
      if (program === "gh" && args[0] === "repo" && args[1] === "view") {
        return {
          stdout: JSON.stringify({
            nameWithOwner: REPO,
            viewerPermission: "WRITE",
          }),
        };
      }
      if (program === "gh" && args[0] === "issue" && args[1] === "list") {
        return { stdout: JSON.stringify([issue(7)]) };
      }
      if (program === "gh" && args[0] === "issue" && args[1] === "view") {
        return { stdout: JSON.stringify(issue(7, { body: "cuerpo con ñ" })) };
      }
      if (program === "gh" && args[0] === "issue" && args[1] === "comment") {
        return { stdout: "" };
      }
      if (program === "gh" && args[0] === "pr" && args[1] === "list") {
        return { stdout: JSON.stringify(prs) };
      }
      if (program === "gh" && args[0] === "pr" && args[1] === "create") {
        return { stdout: "https://github.com/joseulloa18/firesync/pull/99\n" };
      }
      if (program === "pnpm") return { status: testExit };
      if (program === "opencode" && args[0] === "--version")
        return { stdout: "1.2.3\n" };
      if (program === "opencode" && args[0] === "run" && args[1] === "--help") {
        return {
          stdout:
            "opencode run [message..]\n-m, --model\n-f, --file\n--dir\n--title\n",
        };
      }
      if (program === "opencode" && args[0] === "run") return { status: 0 };
      return undefined;
    },
  ]);
}

async function runPublication(t, options = {}) {
  const repoRoot = tempDir(t);
  const workRoot = path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`);
  const worktreePath = path.join(workRoot, "issue-7");
  mkdirSync(worktreePath, { recursive: true });
  t.after(() => rmSync(workRoot, { recursive: true, force: true }));
  const exec = publicationExec({ repoRoot, worktreePath, ...options });
  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id]),
      repo: REPO,
      workRoot,
      model: "opencode/big-pickle",
    },
    { exec, cwd: repoRoot, registry: registry(), log: () => {} },
  );
  return { result, exec };
}

test("publica con pruebas OK: push sin force, PR borrador y comentario", async (t) => {
  const { result, exec } = await runPublication(t);
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.pushed, true);
  assert.equal(result.report.merged, false);

  const push = exec.calls.find(
    (call) => call.program === "git" && call.args[0] === "push",
  );
  assert.deepEqual(push.args, ["push", "-u", "origin", "hackathon/issue-7"]);

  const create = exec.calls.find(
    (call) =>
      call.program === "gh" &&
      call.args[0] === "pr" &&
      call.args[1] === "create",
  );
  assert.equal(create.args.includes("--draft"), true);
  assert.equal(create.args.at(-1), "-");

  const comment = exec.calls.find(
    (call) =>
      call.program === "gh" &&
      call.args[0] === "issue" &&
      call.args[1] === "comment",
  );
  assert.match(comment.options.input, /pnpm lint: OK/);
  assert.match(comment.options.input, /pnpm typecheck: OK/);
  assert.match(comment.options.input, /pnpm test: OK/);
  assert.match(comment.options.input, /pull\/99/);
  assert.equal(
    exec.calls.some((call) => call.args.includes("merge")),
    false,
  );
});

test("no duplica PR ni comentario si la rama ya tiene PR", async (t) => {
  const { result, exec } = await runPublication(t, {
    prs: [
      {
        number: 99,
        url: "https://github.com/joseulloa18/firesync/pull/99",
        isDraft: true,
        state: "OPEN",
      },
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.processed[0].publish.prCreated, false);
  assert.equal(
    exec.calls.some(
      (call) =>
        call.program === "gh" &&
        call.args[0] === "pr" &&
        call.args[1] === "create",
    ),
    false,
  );
  assert.equal(
    exec.calls.some(
      (call) =>
        call.program === "gh" &&
        call.args[0] === "issue" &&
        call.args[1] === "comment",
    ),
    false,
  );
});

test("si lint falla no hace push, ni PR, ni comentario", async (t) => {
  const { result, exec } = await runPublication(t, { testExit: 1 });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.pushed, false);
  assert.equal(
    exec.calls.some(
      (call) => call.program === "git" && call.args[0] === "push",
    ),
    false,
  );
  assert.equal(
    exec.calls.some((call) => call.program === "gh" && call.args[0] === "pr"),
    false,
  );
  assert.equal(
    exec.calls.some(
      (call) =>
        call.program === "gh" &&
        call.args[0] === "issue" &&
        call.args[1] === "comment",
    ),
    false,
  );
});

test("lee el registro del equipo desde origin/main", async (t) => {
  const repoRoot = tempDir(t);
  const exec = makeExec([
    ...baseHandlers({ repoRoot, issues: [] }),
    (program, args) => {
      if (program === "git" && args[0] === "fetch") return { status: 0 };
      if (program === "git" && args[0] === "show") {
        return { stdout: JSON.stringify(registry()) };
      }
      return undefined;
    },
  ]);
  const result = await runWorker(
    {
      ...parseArgs(["--station", STATION.id, "--dry-run"]),
      repo: REPO,
      workRoot: path.join(repoRoot, "..", `${path.basename(repoRoot)}-wt`),
      model: "opencode/big-pickle",
    },
    { exec, cwd: repoRoot, log: () => {} },
  );
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.planned, []);
  assert.equal(
    result.report.registryPath,
    "origin/main:orquestacion/equipo.json",
  );
});
