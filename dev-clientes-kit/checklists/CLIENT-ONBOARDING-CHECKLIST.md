# Checklist de Onboarding por Cliente

Use este fluxo para subir um novo cliente de terapia/fisio com isolamento total de dados.

## 1) Preparacao

- [ ] Definir tipo do site: `terapia` ou `fisio`.
- [ ] Definir identificador curto do cliente (ex.: `clinica-vida`).
- [ ] Definir dominio final (ex.: `agenda.clinicavida.com.br`).
- [ ] Definir WhatsApp comercial do cliente.

## 2) Projeto e repositorio

- [ ] Duplicar o template base para uma pasta nova.
- [ ] Opcional: gerar plano automatico do cliente:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-client-plan.ps1 -ClientName "Nome Cliente" -SiteType terapia -Domain dominio.com.br`
- [ ] Nomear pasta/repo com padrao: `site-<tipo>-<cliente>`.
- [ ] Criar repositorio Git remoto do cliente.
- [ ] Subir branch `main`.

## 3) Branding e conteudo

- [ ] Trocar logo principal.
- [ ] Trocar imagens de destaque (hero e cards).
- [ ] Ajustar nome da marca em `site-config.js` (e `fisiosaude/site-config.js` quando aplicavel).
- [ ] Revisar textos principais de vitrine.

## 4) Configuracao de ambiente

- [ ] Criar `.env.local` a partir de `ops/env.client.template`.
- [ ] Definir `ADMIN_PASSWORD` forte e unico.
- [ ] Definir `PUBLIC_SITE_URL` com dominio de producao.
- [ ] Definir `FRONTEND_ORIGIN` com o mesmo dominio.
- [ ] Definir `DATABASE_URL` exclusivo do cliente.
- [ ] Definir `MERCADO_PAGO_ACCESS_TOKEN` (se houver MP API).

## 5) Banco e persistencia

- [ ] Criar banco PostgreSQL exclusivo do cliente.
- [ ] Testar `GET /api/health` e validar `persistence = postgres`.
- [ ] Confirmar que nao existe compartilhamento de `DATABASE_URL` entre clientes.

## 6) Deploy

- [ ] Criar projeto novo na Vercel para este cliente.
- [ ] Conectar o repo correto.
- [ ] Cadastrar todas as variaveis de ambiente.
- [ ] Deploy em producao.
- [ ] Vincular dominio customizado.

## 7) Teste final obrigatorio

- [ ] Testar agendamento completo (data, horario, servico).
- [ ] Testar pagamento Pix.
- [ ] Testar fluxo com cartao/MP quando configurado.
- [ ] Testar painel admin por URL:
  - Terapia: `/admin`
  - Fisio: `/fisiosaude/admin`
- [ ] Testar exportacao de agendamentos no admin.
- [ ] Validar que o site publico nao exibe botao de admin.

## 8) Entrega

- [ ] Entregar URL publica.
- [ ] Entregar URL de admin.
- [ ] Entregar senha admin inicial.
- [ ] Agendar troca da senha admin no primeiro acesso do cliente.
- [ ] Registrar dados de suporte (repo, Vercel, banco e dominio).
