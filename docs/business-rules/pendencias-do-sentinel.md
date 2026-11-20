# Pendências de regra — Sentinel

> Itens medidos em produção que **não** podem virar regra por suposição. Cada um
> traz as opções medidas e o custo; a escolha é do dono.

## 1. `operacao.pedido_preso` — 121 rascunhos antigos, ruído de operação em lote

**Medido em 20/11/2026:** 121 rascunhos com mais de 7 dias. Mas:

```
121 rascunhos presos
120 com o MESMO updated_at: 2026-11-09 19:38:13.052684
 20 com total_cents = 0
121 têm updated_at > created_at  ← "nunca editado" NÃO discrimina (um backfill tocou todos)
```

A hipótese "nunca editado = artefato de importação" **caiu**: um backfill atualizou
`updated_at` de todos. A única assinatura de operação em lote que resta é o
**timestamp idêntico em 120 registros** — e isso é frágil como regra (o próximo
backfill muda o valor).

### Opções medidas (escolha do dono)

| Opção | Efeito medido hoje | Custo |
|---|---|---|
| **(a)** sinalizar só rascunho com valor (`total_cents > 0`) | 121 → **101** ocorrências | baixo: uma condição no detector; continua ruído de 101 |
| **(b)** sinalizar só o que teve edição **humana** após a importação | reduz ao que é de fato abandono | alto: exige marca de origem/edição que **não existe** — coluna nova + backfill |
| **(c)** manter a regra e resolver por **apresentação** (agrupar as N da mesma regra num cartão "121 rascunhos antigos") | 121 ocorrências viram **1 cartão** | baixo: só UI do painel; a regra não muda |

**Recomendação registrada (não decisão):** (c) + (a) juntas — o cartão resolve o
ruído visual e o corte por valor elimina os 20 sem valor. A palavra final é do dono.

**Não implementar antes da decisão.** O detector segue como está.
