# Pendências de regra — Sentinel

> Itens medidos em produção que **não** podem virar regra por suposição. Cada um
> traz as opções medidas e o custo; a escolha é do dono.

## 1. `operacao.pedido_preso` — DECIDIDO (delegado pelo dono, 2026-11-20)

**Medição:** 121 rascunhos > 7 dias; **119 são `origem='mercos'`**, **118 sem
`created_by`**, 20 com valor zero, 99 com itens. Dos 126 rascunhos totais, **apenas
1 tem autor humano**.

**Decisão:** a regra abre **só rascunho com `created_by IS NOT NULL`** (autor
humano). Rascunho importado e nunca tocado é **resíduo de importação**, não
trabalho abandonado. **Sem coluna nova e sem migration** — `created_by` já existe.
Apresentação: ocorrências repetidas da mesma regra viram **um cartão com
contagem** ("121 rascunhos antigos"), não 15 linhas.

**Justificativa:** o discriminador confiável não é `updated_at` (um backfill tocou
todos os 121) nem "nunca editado"; é **quem começou**. Autor humano separa trabalho
abandonado de resíduo de importação.

**Reversão:** uma linha de SQL no filtro (voltar a abrir sem `created_by`).

**Pergunta ao dono (observação, não alerta):** existem **119 rascunhos vindos do
Mercos que ninguém nunca abriu** — não é falha do Sentinel; é a importação criando
rascunho para pedido que talvez devesse entrar em outro estado. A resposta não foi
inventada e a decisão de mudar a importação é do dono.

## 2. `operacao.lead_duplicado` — DECIDIDO (delegado pelo dono, 2026-11-20)

**Decisão:** **nenhum merge automático.** Mesclar funil é operação comercial —
perde histórico e muda dono. O painel passa a **identificar** (nome → telefone →
e-mail → id) e **linkar** cada lead; a decisão é humana. Fechar lead duplicado é
ação de pessoa, não do vigia.

**Justificativa:** as 5 ocorrências medidas são reais (mesmo contato, dois leads
abertos) e a ação tem consequência comercial irreversível — automação aqui seria
poder invisível.

**Reversão:** remover os links/identificação do painel; nenhum dado é tocado.
