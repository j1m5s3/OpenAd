[CmdletBinding()]
param(
    [switch]$SkipDocker
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

function Test-OnPath {
    param([Parameter(Mandatory = $true)][string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Assert-Prereqs {
    $missing = @()
    if (-not (Test-OnPath 'uv')) { $missing += 'uv' }
    if (-not (Test-OnPath 'node')) { $missing += 'node' }
    if (-not (Test-OnPath 'npm')) { $missing += 'npm' }
    if (-not $SkipDocker) {
        if (-not (Test-OnPath 'docker')) { $missing += 'docker' }
    }
    if ($missing.Count -gt 0) {
        throw "Missing on PATH: $($missing -join ', '). Install the missing tools and retry."
    }

    $nodeVersion = (& node -v)
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "node is installed but could not report its version."
    }
    $major = [int](($nodeVersion.TrimStart('v')).Split('.')[0])
    if ($major -lt 20) {
        throw "Node.js >= 20 is required (found $nodeVersion)."
    }

    if (-not $SkipDocker) {
        docker info > $null 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker Desktop does not appear to be running. Start it and retry."
        }
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

Assert-Prereqs

Invoke-Step 'copy .env from .env.example if missing' {
    $envPath = Join-Path $RepoRoot '.env'
    $examplePath = Join-Path $RepoRoot '.env.example'
    if (-not (Test-Path -LiteralPath $envPath)) {
        if (-not (Test-Path -LiteralPath $examplePath)) {
            throw ".env.example is missing; cannot create .env."
        }
        Copy-Item -LiteralPath $examplePath -Destination $envPath
        Write-Host "Created .env (values not printed)."
    } else {
        Write-Host ".env already exists; leaving it unchanged."
    }
}

if (-not $SkipDocker) {
    Invoke-Step 'docker compose up -d' {
        docker compose up -d
    }
    Invoke-Step 'wait for anvil and postgres healthchecks' {
        Wait-ComposeHealthy
        Wait-AnvilRpc
    }
} else {
    Write-Host ""
    Write-Host "==> skipping docker ( -SkipDocker )"
}

Invoke-Step 'uv sync (contracts)' {
    Push-Location (Join-Path $RepoRoot 'contracts')
    try {
        uv sync
    } finally {
        Pop-Location
    }
}

Invoke-Step 'uv sync (api)' {
    Push-Location (Join-Path $RepoRoot 'api')
    try {
        uv sync
    } finally {
        Pop-Location
    }
}

Invoke-Step 'mox compile' {
    Push-Location (Join-Path $RepoRoot 'contracts')
    try {
        uv run mox compile
    } finally {
        Pop-Location
    }
}

Invoke-Step 'mox run deploy --network anvil' {
    $anvilKey = Get-AnvilPrivateKey
    Push-Location (Join-Path $RepoRoot 'contracts')
    try {
        # Foundry Anvil account #0 (public, local-only). Read from docker-compose.yml
        # comments so setup never prompts -- Cursor agent terminals cannot accept paste.
        uv run mox run deploy --network anvil --private-key $anvilKey
    } finally {
        Pop-Location
    }
}

Invoke-Step 'alembic upgrade head' {
    Push-Location (Join-Path $RepoRoot 'api')
    try {
        uv run alembic upgrade head
    } finally {
        Pop-Location
    }
}

Invoke-Step 'npm install (repo root)' {
    npm install
}

Invoke-Step 'sync web deployments' {
    npm run sync:deployments -w web
}

Write-Host ""
Write-Host "Setup complete."
Write-Host ""
Write-Host "Protocol contracts are deployed on Anvil (CreativeRegistry, AdSlot, Marketplace, CampaignVault, MockUSDC)."
Write-Host "  - Artifact: contracts/deployments/31337.json (git-ignored)."
Write-Host "  - Demo: two slots, terms, one approved creative, one purchased period."
Write-Host ""
Write-Host "Next: .\scripts\dev-up.cmd"
