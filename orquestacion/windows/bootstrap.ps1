param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('pc-1-dariana', 'pc-2-ian', 'pc-3-yariel')]
    [string]$Station,
    [switch]$Check,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program termino con codigo $LASTEXITCODE." }
}

function Refresh-TaskPath {
    $env:PATH = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User') + ';' +
        (Join-Path $env:APPDATA 'npm') + ';' + $env:PATH
}

function Ensure-Tool {
    param([string]$Command, [string]$Package)
    if (Get-Command $Command -ErrorAction SilentlyContinue) { return }
    if ($Check -or !(Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Falta $Command. Instala $Package y vuelve a ejecutar el lanzador."
    }
    Write-Host "Instalando $Package para el primer arranque..."
    Invoke-Native winget @('install', '--exact', '--id', $Package, '--silent',
        '--accept-package-agreements', '--accept-source-agreements')
    Refresh-TaskPath
    if (!(Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Cierra y vuelve a abrir el lanzador para activar $Command."
    }
}

try {
    Refresh-TaskPath
    Ensure-Tool git 'Git.Git'
    Ensure-Tool gh 'GitHub.cli'
    Ensure-Tool node 'OpenJS.NodeJS.LTS'
    $nodeVersion = (& node --version).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -lt 22) { throw 'Se necesita Node.js 22 o superior.' }

    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        if ($Check) { throw 'Falta autenticar GitHub CLI: gh auth login.' }
        Write-Host 'Primer acceso: inicia sesion con TU cuenta de GitHub.'
        Invoke-Native gh @('auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web')
    }
    $userJson = & gh api user
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar la cuenta GitHub.' }
    $user = $userJson | ConvertFrom-Json
    $accounts = @{'pc-1-dariana'='DarianaSM15'; 'pc-2-ian'='NunezIan'; 'pc-3-yariel'='yarielDR32'}
    if ($user.login -ine $accounts[$Station]) {
        throw "Cuenta incorrecta: $($user.login). Usa gh auth switch para seleccionar $($accounts[$Station])."
    }

    $taskHome = Join-Path $env:LOCALAPPDATA 'FIRESYNC'
    $repo = Join-Path $taskHome 'repo'
    $tools = Join-Path $taskHome 'tools'
    $engine = Join-Path $tools 'node_modules/@opencode/cli/bin/opencode.exe'
    $pnpm = Join-Path $tools 'node_modules/.bin/pnpm.cmd'
    if (!(Test-Path -LiteralPath $engine) -or !(Test-Path -LiteralPath $pnpm)) {
        if ($Check) { throw 'Falta preparar el motor. Ejecuta el lanzador sin --check una vez.' }
        New-Item -ItemType Directory -Force -Path $tools | Out-Null
        Invoke-Native npm @('install', '--prefix', $tools, '--no-audit', '--no-fund',
            '@opencode/cli@2.3.0', 'pnpm@10.32.1')
    }
    $env:PATH = (Join-Path $tools 'node_modules/.bin') + ';' + $env:PATH
    $env:OPENCODE_BIN = $engine
    Invoke-Native $engine @('--version')

    if (!(Test-Path -LiteralPath $repo)) {
        if ($Check) { throw 'Falta el clon local. Ejecuta el lanzador una vez.' }
        New-Item -ItemType Directory -Force -Path $taskHome | Out-Null
        Invoke-Native git @('clone', 'https://github.com/joseulloa18/firesync.git', $repo)
    }
    $origin = & git -C $repo remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $origin -notmatch '^https://github\.com/joseulloa18/firesync(?:\.git)?/?$') {
        throw "La carpeta $repo no es el clon esperado. Se conserva sin modificar."
    }
    $root = & git -C $repo rev-parse --show-toplevel
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($root) -ine [IO.Path]::GetFullPath($repo)) {
        throw 'La carpeta pertenece a otro repositorio. Se conserva sin modificar.'
    }
    if (!$Check) {
        Invoke-Native git @('-C', $repo, 'fetch', 'origin')
        $dirty = & git -C $repo status --porcelain
        $branch = & git -C $repo branch --show-current
        if (!$dirty -and $branch -eq 'main') {
            Invoke-Native git @('-C', $repo, 'merge', '--ff-only', 'origin/main')
        }
        # Solo configuracion de este clon. Las credenciales permanecen en gh.
        Invoke-Native git @('-C', $repo, 'config', 'credential.https://github.com.helper', '!gh auth git-credential')
        $gitName = & git -C $repo config user.name
        if (!$gitName) { Invoke-Native git @('-C', $repo, 'config', 'user.name', $user.login) }
        $gitEmail = & git -C $repo config user.email
        if (!$gitEmail) {
            $noreply = "$($user.id)+$($user.login)@users.noreply.github.com"
            Invoke-Native git @('-C', $repo, 'config', 'user.email', $noreply)
        }
    }
    $worker = Join-Path $repo 'orquestacion/worker/worker.mjs'
    if (!(Test-Path -LiteralPath $worker)) { throw 'El clon todavia no contiene el worker publicado.' }
    $workerArgs = @($worker, '--station', $Station, '--max-sessions', '2',
        '--repo', 'joseulloa18/firesync', '--work-root', (Join-Path $taskHome 'worktrees'))
    if ($Check) { $workerArgs += '--check' }
    if ($DryRun) { $workerArgs += '--dry-run' }
    Push-Location -LiteralPath $repo
    try { Invoke-Native node $workerArgs } finally { Pop-Location }
} catch {
    Write-Host "FIRESYNC: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
