$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )
    Write-Host ""
    Write-Host "==> $Name"
    $global:LASTEXITCODE = 0
    & $Action
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Step failed: $Name (exit code $LASTEXITCODE)."
    }
}

function Test-ComposeServiceHealthy {
    param([Parameter(Mandatory = $true)][string]$Service)
    $id = docker compose ps -q $Service
    if ([string]::IsNullOrWhiteSpace([string]$id)) {
        return $false
    }
    $status = (docker inspect --format "{{.State.Health.Status}}" $id.Trim()).Trim()
    return ($status -eq 'healthy')
}

function Wait-ComposeHealthy {
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $anvilOk = Test-ComposeServiceHealthy -Service 'anvil'
        $postgresOk = Test-ComposeServiceHealthy -Service 'postgres'
        if ($anvilOk -and $postgresOk) {
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "Timed out waiting for anvil and postgres. Run .\scripts\dev-up.cmd first."
}

function Wait-AnvilRpc {
    $deadline = (Get-Date).AddSeconds(30)
    $body = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8545' -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) {
                return
            }
        } catch {
            Start-Sleep -Seconds 1
            continue
        }
        Start-Sleep -Seconds 1
    }
    throw "Anvil RPC is not up on http://127.0.0.1:8545. Run .\scripts\dev-up.cmd first."
}

function Test-UsdcCodePresent {
    param([Parameter(Mandatory = $true)][string]$ArtifactPath)
    $artifact = Get-Content -LiteralPath $ArtifactPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $addr = $artifact.contracts.USDC.address
    if ([string]::IsNullOrWhiteSpace([string]$addr)) {
        return $false
    }
    $payload = @{
        jsonrpc = '2.0'
        method  = 'eth_getCode'
        params  = @($addr, 'latest')
        id      = 1
    } | ConvertTo-Json -Compress
    try {
        $resp = Invoke-WebRequest -Uri 'http://127.0.0.1:8545' -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing -TimeoutSec 5
        $parsed = $resp.Content | ConvertFrom-Json
        $code = [string]$parsed.result
        return ($code.Length -gt 2)
    } catch {
        return $false
    }
}

function Start-TitledWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command
    )
    $cmdLine = "title $Title && $Command"
    Start-Process -FilePath 'cmd.exe' -WorkingDirectory $WorkingDirectory -ArgumentList @('/k', $cmdLine)
}

$envPath = Join-Path $RepoRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env is missing. Run .\scripts\setup.cmd first."
}

$artifactPath = Join-Path $RepoRoot 'contracts\deployments\31337.json'
if (-not (Test-Path -LiteralPath $artifactPath)) {
    throw "contracts/deployments/31337.json is missing. Run .\scripts\setup.cmd first."
}

if (-not (Get-Command 'docker' -ErrorAction SilentlyContinue)) {
    throw "docker is not on PATH. Install Docker Desktop and retry."
}
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop does not appear to be running. Start it and retry."
}

Invoke-Step 'wait for anvil and postgres healthchecks' {
    Wait-ComposeHealthy
    Wait-AnvilRpc
}

if (-not (Test-UsdcCodePresent -ArtifactPath $artifactPath)) {
    throw "Anvil has no MockUSDC at the last artifact address. Run .\scripts\setup.cmd first (sim never deploys)."
}

Invoke-Step 'start openad-sim' {
    Start-TitledWindow -Title 'openad-sim' -WorkingDirectory $RepoRoot -Command 'npm.cmd run dev -w sim'
}

Write-Host ""
Write-Host "Started titled window: openad-sim."
Write-Host "  Control:     http://127.0.0.1:8610/status"
Write-Host "  Media:       http://127.0.0.1:8610/media/"
Write-Host ""
Write-Host "Stop: close the openad-sim window or press Ctrl+C inside it (.\scripts\sim-down.cmd)."
Write-Host "This process is not started by .\scripts\dev-up.cmd."
