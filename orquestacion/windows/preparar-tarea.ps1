$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program termino con codigo $LASTEXITCODE."
    }
}

try {
    $agent = $args[0]
    if ($agent -notin @('OpenCode', 'Antigravity')) {
        throw 'Selecciona el lanzador de OpenCode o Antigravity.'
    }

    Set-Location -LiteralPath $PSScriptRoot
    $repo = Invoke-Checked git @('rev-parse', '--show-toplevel')
    Set-Location -LiteralPath $repo

    if ($args[1] -ne '--sesion') {
        $numbers = @($args | Select-Object -Skip 1)
        if ($numbers.Count -eq 0) {
            $numbers = (Read-Host 'Numeros de issue separados por espacios').Trim() -split '\s+'
        }
        foreach ($number in $numbers) {
            if ($number -cnotmatch '^[1-9][0-9]{0,9}$') {
                throw "Numero de issue invalido: $number"
            }
        }
        # Prepare each worktree serially before the consoles begin editing.
        foreach ($number in ($numbers | Select-Object -Unique)) {
            & $PSCommandPath $agent '--sesion' $number '--preparar'
        }
        foreach ($number in ($numbers | Select-Object -Unique)) {
            Start-Process powershell.exe -ArgumentList @(
                '-NoProfile', '-File', ('"{0}"' -f $PSCommandPath),
                $agent, '--sesion', $number
            )
        }
        return
    }

    $number = $args[2]
    if ($number -cnotmatch '^[1-9][0-9]{0,9}$') { throw 'Numero de issue invalido.' }
    $branch = "hackathon/issue-$number"
    $parent = Split-Path -Parent $repo
    $repoName = Split-Path -Leaf $repo
    $folder = Join-Path $parent "$repoName-worktrees\issue-$number"

    if ($args[3] -eq '--preparar') {
        if (Test-Path -LiteralPath $folder) {
            $expected = (Get-Item -LiteralPath $folder).FullName
            $root = Invoke-Checked git @('-C', $folder, 'rev-parse', '--show-toplevel')
            $actual = (Get-Item -LiteralPath $root).FullName
            $currentBranch = Invoke-Checked git @('-C', $folder, 'branch', '--show-current')
            $repoGit = Invoke-Checked git @('rev-parse', '--path-format=absolute', '--git-common-dir')
            $folderGit = Invoke-Checked git @('-C', $folder, 'rev-parse', '--path-format=absolute', '--git-common-dir')
            if ($actual -ne $expected -or $currentBranch -ne $branch -or $repoGit -ne $folderGit) {
                throw "Revisa la carpeta existente: $folder"
            }
            return
        }

        $null = Invoke-Checked gh @('issue', 'view', $number, '--json', 'number')
        Invoke-Checked git @('fetch', 'origin')
        & git show-ref --verify --quiet "refs/heads/$branch"
        if ($LASTEXITCODE -eq 0) {
            Invoke-Checked git @('worktree', 'add', $folder, $branch)
            return
        }
        & git show-ref --verify --quiet "refs/remotes/origin/$branch"
        if ($LASTEXITCODE -eq 0) {
            Invoke-Checked git @('worktree', 'add', '--track', '-b', $branch, $folder, "origin/$branch")
            return
        }

        $base = $env:HACKATHON_BASE_BRANCH
        if (-not $base) {
            $head = Invoke-Checked git @('ls-remote', '--symref', 'origin', 'HEAD')
            $line = $head | Select-String '^ref: refs/heads/(.+)\s+HEAD$' | Select-Object -First 1
            if (-not $line) { throw 'Configura HACKATHON_BASE_BRANCH con la rama base.' }
            $base = $line.Matches[0].Groups[1].Value
        }
        Invoke-Checked git @('worktree', 'add', '--no-track', '-b', $branch, $folder, "refs/remotes/origin/$base")
        return
    }

    Set-Location -LiteralPath $folder
    $json = Invoke-Checked gh @('issue', 'view', $number, '--json', 'title,body,url,comments')
    $issue = ($json -join "`n") | ConvertFrom-Json
    $comments = foreach ($comment in $issue.comments) {
        "@$($comment.author.login): $($comment.body)"
    }
    $context = @"
Trabaja en el issue #${number}: $($issue.title)
$($issue.url)
Carpeta de trabajo: $folder
Rama: $branch
Lee las instrucciones del repositorio y revisa el avance local antes de editar.
Usa la asignacion y el relevo vigentes. Confirma dudas con el operador.

$($issue.body)

Comentarios del issue:
$($comments -join "`n`n")
"@
    Write-Host "$agent | Issue #$number | $($issue.url)"
    Write-Host "Abre esta carpeta en el agente: $folder"
    while ((Read-Host 'C para copiar el contexto al portapapeles. Enter para continuar') -eq 'C') {
        Set-Clipboard -Value $context
        Write-Host 'Contexto copiado. Pegalo en la sesion del agente.'
    }
} catch {
    if ($args[3] -eq '--preparar') { throw }
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($args[1] -eq '--sesion') { $null = Read-Host 'Enter para cerrar' }
    exit 1
}
