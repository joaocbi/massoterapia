param(
  [Parameter(Mandatory = $true)]
  [string]$ClientName,

  [ValidateSet("terapia", "fisio")]
  [string]$SiteType = "terapia",

  [string]$Domain = "",

  [string]$OutputDir = ".\dev-clientes-kit\client-plans"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-ToSlug {
  param([string]$Value)
  $normalized = $Value.ToLowerInvariant().Trim()
  $normalized = $normalized -replace "[^a-z0-9]+", "-"
  $normalized = $normalized.Trim("-")
  if (-not $normalized) {
    throw "Nao foi possivel gerar slug para o nome informado."
  }
  return $normalized
}

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$clientSlug = Convert-ToSlug -Value $ClientName
$repoName = "site-$SiteType-$clientSlug"
$vercelProject = "$clientSlug-$SiteType"
$dbName = "db_$($clientSlug -replace '-', '_')"
$domainValue = if ([string]::IsNullOrWhiteSpace($Domain)) { "SEU-DOMINIO.com.br" } else { $Domain.Trim() }
$adminPath = if ($SiteType -eq "fisio") { "/fisiosaude/admin" } else { "/admin" }
$publicPath = if ($SiteType -eq "fisio") { "/fisiosaude" } else { "/" }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$outputAbs = Join-Path $root $OutputDir
New-Item -ItemType Directory -Path $outputAbs -Force | Out-Null

$fileName = "client-plan-$clientSlug-$SiteType.md"
$outputFile = Join-Path $outputAbs $fileName

$content = @"
# Plano de Implantacao - $ClientName

## Identificacao

- Tipo: $SiteType
- Cliente: $ClientName
- Slug: $clientSlug
- Repositorio sugerido: $repoName
- Projeto Vercel sugerido: $vercelProject
- Banco sugerido: $dbName
- Dominio publico: https://$domainValue$publicPath
- URL admin: https://$domainValue$adminPath

## Checklist de Provisionamento

- [ ] Criar repositorio `$repoName`
- [ ] Rodar bootstrap:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-client.ps1 -ClientSlug $clientSlug -SiteType $SiteType -DestinationRoot .\clientes`
- [ ] Ajustar branding (logo, nome e imagens)
- [ ] Configurar `.env.local` com base em `dev-clientes-kit/templates/env.client.template`
- [ ] Criar projeto na Vercel com nome `$vercelProject`
- [ ] Configurar variaveis de ambiente na Vercel
- [ ] Configurar banco Postgres exclusivo (`$dbName`)
- [ ] Configurar dominio final
- [ ] Validar fluxo completo de agendamento

## Variaveis de Ambiente (preencher)

- `ADMIN_PASSWORD=`
- `FRONTEND_ORIGIN=https://$domainValue`
- `PUBLIC_SITE_URL=https://$domainValue`
- `DATABASE_URL=`
- `MERCADO_PAGO_ACCESS_TOKEN=`

## Entrega para o Cliente

- [ ] URL do site enviada
- [ ] URL do admin enviada
- [ ] Senha inicial enviada
- [ ] Recomendacao de troca de senha no primeiro acesso
"@

$content | Out-File -FilePath $outputFile -Encoding utf8

Write-Step "Plano gerado com sucesso"
Write-Host "Arquivo: $outputFile" -ForegroundColor Green
Write-Host ""
Write-Host "Sugestao de proximo passo:" -ForegroundColor Yellow
Write-Host "1) Abrir o markdown e preencher os campos pendentes"
Write-Host "2) Iniciar bootstrap com o comando recomendado"
