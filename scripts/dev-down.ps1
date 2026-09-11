[CmdletBinding()]
param(
    [switch]$Reset
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )
    Write-Host ""
    Write-Host "==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Step failed: $Name (exit code $LASTEXITCODE)."
    }
}

if ($Reset) {
    Invoke-Step 'docker compose down -v' {
        docker compose down -v
    }

    $artifactPath = Join-Path $RepoRoot 'contracts\deployments\31337.json'
    if (Test-Path -LiteralPath $artifactPath) {
        Remove-Item -LiteralPath $artifactPath -Force
        Write-Host "Removed contracts/deployments/31337.json"
    } else {
        Write-Host "contracts/deployments/31337.json already absent."
    }

    $cachePath = Join-Path $RepoRoot 'api\.cache'
    if (Test-Path -LiteralPath $cachePath) {
        Remove-Item -LiteralPath $cachePath -Recurse -Force
        Write-Host "Removed api/.cache/"
    } else {
        Write-Host "api/.cache/ already absent."
    }
} else {
    Invoke-Step 'docker compose down' {
        docker compose down
    }
    Write-Host "pgdata volume kept. Use -Reset to drop it and local deploy artifacts."
}

Write-Host ""
Write-Host "Docker services stopped. This script does not kill app processes."
Write-Host "Stop api/indexer/web/embed by closing each openad-* window or pressing Ctrl+C inside it."
