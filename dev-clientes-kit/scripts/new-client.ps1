param(
  [Parameter(Mandatory = $true)]
  [string]$ClientName,

  [Parameter(Mandatory = $true)]
  [string]$ClientSlug,

  [ValidateSet("terapia", "fisio")]
  [string]$SiteType = "terapia",

  [string]$Domain = "",

  [string]$DestinationRoot = ".\clientes"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$generatePlanScript = Join-Path $PSScriptRoot "generate-client-plan.ps1"
$bootstrapScript = Join-Path $PSScriptRoot "bootstrap-client.ps1"

if (-not (Test-Path $generatePlanScript)) {
  throw "Script nao encontrado: $generatePlanScript"
}
if (-not (Test-Path $bootstrapScript)) {
  throw "Script nao encontrado: $bootstrapScript"
}

Write-Step "Gerando plano do cliente"
if (-not [string]::IsNullOrWhiteSpace($Domain)) {
  & $generatePlanScript -ClientName $ClientName -SiteType $SiteType -Domain $Domain
} else {
  & $generatePlanScript -ClientName $ClientName -SiteType $SiteType
}

Write-Step "Executando bootstrap do cliente"
& $bootstrapScript -ClientSlug $ClientSlug -SiteType $SiteType -DestinationRoot $DestinationRoot

$targetPath = Join-Path $projectRoot $DestinationRoot
$targetPath = Join-Path $targetPath "site-$SiteType-$ClientSlug"

Write-Step "Concluido"
Write-Host "Cliente provisionado em: $targetPath" -ForegroundColor Green
Write-Host "Plano salvo em: dev-clientes-kit/client-plans/" -ForegroundColor Green
Write-Host ""
Write-Host "Proximo passo:" -ForegroundColor Yellow
Write-Host "1) Ajustar branding no projeto novo"
Write-Host "2) Configurar env e Vercel"
