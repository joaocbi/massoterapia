# Operacao Flow Terapias

Este documento separa orientacoes para dois perfis:

- cliente final que faz agendamento
- administrador que configura e opera o painel

## Cartilhas e textos comerciais

Para divulgacao e explicacao detalhada ao cliente final, use tambem:

- `CLIENT-HANDBOOK.md` — comodidades do site, beneficios por massagem, agendamento e pagamentos
- `CLIENT-HANDBOOK-SHORT.md` — versao curta para WhatsApp, bio e 3 tons de escrita

## Guia do Cliente

### Como agendar sua sessao

1. Acesse o site da Flow Terapias.
2. Va ate a secao de agendamento.
3. Preencha:
   - nome completo
   - WhatsApp
   - e-mail
   - tipo de massagem
   - data
   - horario
   - forma de pagamento
4. Clique em `Confirmar agendamento`.

### Regras de disponibilidade

- Apenas datas e horarios disponiveis aparecem para selecao.
- Horarios indisponiveis ficam marcados como indisponiveis.
- Datas bloqueadas nao podem ser selecionadas.

### Confirmacao

- Apos confirmar, a tela mostra o resumo do agendamento.
- O botao do WhatsApp pode ser usado para enviar a confirmacao.

## Guia do Administrador

### Acesso ao painel

1. Abra o site.
2. Clique em `Admin` no topo.
3. Informe a senha administrativa e clique em `Entrar`.

### Configuracoes principais

No painel admin voce pode configurar:

- Servicos de massagens
- Horarios disponiveis
- Formas de pagamento
- Dias de atendimento
- Datas indisponiveis

Depois clique em `Salvar configuracoes`.

### Formatos de preenchimento

#### Servicos de massagens

Uma linha por servico no formato:

`Nome|Duracao|Preco`

Exemplo:

`Massagem Relaxante Flow|60 min|180`

#### Horarios disponiveis

Formato `HH:MM` separados por virgula.

Exemplo:

`08:00,09:00,10:00,11:00`

#### Formas de pagamento

Uma por linha.

Exemplo:

`Pix`
`Cartao de Credito`
`Cartao de Debito`

#### Dias de atendimento

Use numeros separados por virgula:

- `0` Domingo
- `1` Segunda
- `2` Terca
- `3` Quarta
- `4` Quinta
- `5` Sexta
- `6` Sabado

Exemplo:

`1,2,3,4,5,6`

#### Datas indisponiveis

Uma por linha no formato `YYYY-MM-DD`.

Exemplo:

`2026-12-25`

### Gestao de agendamentos

No painel voce consegue:

- filtrar por cliente, status e pagamento
- confirmar ou cancelar agendamentos
- marcar pagamento como pago

### Exportacoes

- `Exportar JSON`: backup geral de agendamentos
- `Exportar clientes atendidos`: lista de clientes confirmados

### Boas praticas

- Troque a senha admin periodicamente.
- Faca exportacao semanal de backup.
- Revise servicos, valores e horarios regularmente.
