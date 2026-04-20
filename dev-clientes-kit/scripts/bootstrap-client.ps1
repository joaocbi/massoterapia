param(
  [Parameter(Mandatory = $true)]
  [string]$ClientSlug,

  [ValidateSet("terapia", "fisio")]
  [string]$SiteType = "terapia",

  [string]$DestinationRoot = "..\\clientes"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$destinationRootAbs = Resolve-Path -Path $DestinationRoot -ErrorAction SilentlyContinue
if (-not $destinationRootAbs) {
  $destinationRootAbs = Join-Path $projectRoot $DestinationRoot
  New-Item -ItemType Directory -Path $destinationRootAbs -Force | Out-Null
} else {
  $destinationRootAbs = $destinationRootAbs.Path
}

$targetName = "site-$SiteType-$ClientSlug"
$targetPath = Join-Path $destinationRootAbs $targetName
$targetPathAbs = [System.IO.Path]::GetFullPath($targetPath)
$projectRootAbs = [System.IO.Path]::GetFullPath($projectRoot)

if (Test-Path $targetPath) {
  throw "A pasta de destino ja existe: $targetPath"
}

Write-Step "Copiando template para $targetPath"
New-Item -ItemType Directory -Path $targetPath -Force | Out-Null

$excludePatterns = @(
  ".git",
  "node_modules",
  ".vercel",
  "database.sqlite",
  "tmp-settings-payload.json"
)

Get-ChildItem -Path $projectRoot -Force | ForEach-Object {
  if ($excludePatterns -contains $_.Name) {
    return
  }
  $sourceItemAbs = [System.IO.Path]::GetFullPath($_.FullName)
  if ($targetPathAbs.StartsWith($sourceItemAbs, [System.StringComparison]::OrdinalIgnoreCase)) {
    return
  }
  if ($sourceItemAbs.StartsWith($targetPathAbs, [System.StringComparison]::OrdinalIgnoreCase)) {
    return
  }
  Copy-Item -Path $_.FullName -Destination $targetPath -Recurse -Force
}

Write-Step "Criando env local do cliente"
$envTemplate = Join-Path $projectRoot "ops\\env.client.template"
$envTarget = Join-Path $targetPath ".env.local"
Copy-Item -Path $envTemplate -Destination $envTarget -Force

Write-Step "Resumo"
Write-Host "Projeto criado: $targetPath" -ForegroundColor Green
Write-Host "Arquivo env:   $envTarget" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos sugeridos:" -ForegroundColor Yellow
Write-Host "1) cd `"$targetPath`""
Write-Host "2) git init && git add . && git commit -m `"chore: bootstrap cliente $ClientSlug`""
Write-Host "3) Ajustar branding e site-config.js"
Write-Host "4) Configurar env e Vercel"
