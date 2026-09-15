[CmdletBinding()]
param(
    [switch]$Embed
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
    throw "Timed out waiting for anvil and postgres to become healthy (docker compose ps)."
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
    throw "Timed out waiting for Anvil JSON-RPC on http://127.0.0.1:8545 (host)."
}

function Get-AnvilPrivateKey {
    $composePath = Join-Path $RepoRoot 'docker-compose.yml'
    if (-not (Test-Path -LiteralPath $composePath)) {
        throw "docker-compose.yml is missing; cannot read the Anvil account #0 key comment."
    }
    foreach ($line in (Get-Content -LiteralPath $composePath)) {
        if ($line -match 'private key\s+(0x[0-9a-fA-F]{64})') {
            return $Matches[1]
        }
    }
    throw "Could not find the Anvil account #0 private key comment in docker-compose.yml."
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

function Test-LocalPortOpen {
    param([Parameter(Mandatory = $true)][int]$Port)
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $waited = $async.AsyncWaitHandle.WaitOne(400)
        if (-not $waited) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        if ($null -ne $client) {
            $client.Close()
        }
    }
}

function Write-PortStatus {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Role,
        [switch]$ExpectedOpen
    )
    $open = Test-LocalPortOpen -Port $Port
    if ($open) {
        if ($ExpectedOpen) {
            Write-Host ("  port {0}: in use ({1}; expected)" -f $Port, $Role)
        } else {
            Write-Host ("  port {0}: in use ({1}; not killed; the new window may fail to bind)" -f $Port, $Role)
        }
    } else {
        if ($ExpectedOpen) {
            Write-Host ("  port {0}: free ({1}; expected anvil/postgres to be listening)" -f $Port, $Role)
        } else {
            Write-Host ("  port {0}: free ({1})" -f $Port, $Role)
        }
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
    throw "contracts/deployments/31337.json is missing. The indexer hard-fails without it. Run .\scripts\setup.cmd first."
}

if (-not (Get-Command 'docker' -ErrorAction SilentlyContinue)) {
    throw "docker is not on PATH. Install Docker Desktop and retry."
}
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop does not appear to be running. Start it and retry."
}

$anvilOk = Test-ComposeServiceHealthy -Service 'anvil'
$postgresOk = Test-ComposeServiceHealthy -Service 'postgres'
if (-not ($anvilOk -and $postgresOk)) {
    Invoke-Step 'docker compose up -d' {
        docker compose up -d
    }
    Invoke-Step 'wait for anvil and postgres healthchecks' {
        Wait-ComposeHealthy
        Wait-AnvilRpc
    }
}

if (-not (Test-UsdcCodePresent -ArtifactPath $artifactPath)) {
    Write-Host ""
    Write-Host "Anvil has no MockUSDC at the last artifact address (chain is empty after compose down)."
    Invoke-Step 'mox run deploy --network anvil' {
        $anvilKey = Get-AnvilPrivateKey
        Push-Location (Join-Path $RepoRoot 'contracts')
        try {
            uv run mox run deploy --network anvil --private-key $anvilKey
        } finally {
            Pop-Location
        }
    }
}

Write-Host ""
Write-Host "==> port check (nothing is killed)"
Write-PortStatus -Port 8000 -Role 'api'
Write-PortStatus -Port 5173 -Role 'web'
Write-PortStatus -Port 8545 -Role 'anvil' -ExpectedOpen
Write-PortStatus -Port 15432 -Role 'postgres' -ExpectedOpen
if ($Embed) {
    Write-PortStatus -Port 5174 -Role 'embed'
}

$apiDir = Join-Path $RepoRoot 'api'

Invoke-Step 'start openad-api' {
    Start-TitledWindow -Title 'openad-api' -WorkingDirectory $apiDir -Command 'uv run uvicorn openad.main:app --reload'
}

Invoke-Step 'start openad-indexer' {
    Start-TitledWindow -Title 'openad-indexer' -WorkingDirectory $apiDir -Command 'uv run python -m openad.indexer'
}

Invoke-Step 'start openad-settler' {
    Start-TitledWindow -Title 'openad-settler' -WorkingDirectory $apiDir -Command 'uv run python -m openad.settler'
}

Invoke-Step 'start openad-web' {
    Start-TitledWindow -Title 'openad-web' -WorkingDirectory $RepoRoot -Command 'npm.cmd run dev:web'
}

if ($Embed) {
    Invoke-Step 'start openad-embed' {
        Start-TitledWindow -Title 'openad-embed' -WorkingDirectory $RepoRoot -Command 'npm.cmd run dev:embed'
    }
}

$started = 'openad-api, openad-indexer, openad-settler, openad-web'
if ($Embed) {
    $started = 'openad-api, openad-indexer, openad-settler, openad-web, openad-embed'
}

Write-Host ""
Write-Host "Started titled windows: $started."
Write-Host "  API health:  http://localhost:8000/v1/health"
Write-Host "  Web:         http://localhost:5173"
if ($Embed) {
    Write-Host "  Embed demo:  http://localhost:5174/demo/"
} else {
    Write-Host "  Embed demo:  .\scripts\dev-up.cmd -Embed  (http://localhost:5174/demo/)"
}
Write-Host ""
Write-Host "Stop: close each openad-* window or press Ctrl+C inside it."
Write-Host "      .\scripts\dev-down.cmd stops docker. The next .\scripts\dev-up.cmd starts it again."
Write-Host ""
Write-Host "Optional live marketplace activity: .\scripts\sim-up.cmd"
