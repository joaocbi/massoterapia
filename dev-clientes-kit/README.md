# Dev Clientes Kit

Pasta central para operacao comercial dos novos clientes.

## Estrutura

- `checklists/CLIENT-ONBOARDING-CHECKLIST.md`
  - Checklist completo de onboarding por cliente.
- `templates/env.client.template`
  - Template padrao de variaveis de ambiente.
- `scripts/bootstrap-client.ps1`
  - Duplica o template para um novo cliente.
- `scripts/generate-client-plan.ps1`
  - Gera plano automatico em markdown com nomes sugeridos.

## Fluxo recomendado

1) Gerar plano do cliente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dev-clientes-kit\scripts\generate-client-plan.ps1 -ClientName "Nome Cliente" -SiteType terapia -Domain dominio.com.br
```

2) Criar copia do projeto para o cliente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\dev-clientes-kit\scripts\bootstrap-client.ps1 -ClientSlug cliente-slug -SiteType terapia -DestinationRoot .\clientes
```

3) Preencher env do cliente com base em:

- `dev-clientes-kit/templates/env.client.template`

4) Seguir checklist:

- `dev-clientes-kit/checklists/CLIENT-ONBOARDING-CHECKLIST.md`
