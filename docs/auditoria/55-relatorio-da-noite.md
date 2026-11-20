# 55 — Relatório da noite (20→21/11/2026)

> Número, dono, próxima ação. Sem enfeite.

## 1. Entregas por agente

| Agente | Entregas (PR · commit) |
|---|---|
| **D** | rotas fatia 1 (#673), fatia 2 (#685/#692), fatia 3 (#694/#698), docs das fatias (#706), matriz/expedição (#718) |
| **F** | sessionStorage (#679), custo no resumo (#680/#682), override com motivo (#683), reprecificação (#687), estoque atômico (#691), harness E2E (#701), matriz fiscal (#711), matriz financeiro (#720) |
| **G** | lead links (#678), pedido_preso por autor (#674), motor visível (#700), risk fatiado (#695/#697), embed do stage (#712), admin: matriz/instrumento (#707), audit design (#703), tenants (#714), users (#715), audit ficha (#719) |
| **Coord** | autorização permanente de deploy (#667), protocolo/janelas (#681/#690), decisões A/B/C (#675), fragmentos da 1.62.0 (#704), registros do `40` (#696/#702/#708/#713), releases 1.62.0 (#705) e 1.62.1 (#717) |

## 2. Aberto com dono

| Item | Dono | Próxima ação |
|---|---|---|
| Matriz `41` — 96 de `app/app` | D | linha a linha, ordem de uso |
| Matriz `41` — 25 de público/auth | F | restam 24; login/signup primeiro |
| Matriz `41` — 22 de admin | G | restam ~17 |
| Motor `laya` | Dono | escolher (a) subir laya-serve ou (b) limpar `LAYA_URL` |
| Orçamentos parados (R$ 218 mil) | Dono | definir régua 30/60/90 e superfície |
| `ORDER_STOCK_ATOMIC` | Dono | ligar após `test:db` em produção |
| 119 orçamentos Mercos | Dono | decidir estado de importação |
| Android físico | Dono | aparelho + passos; TalkBack acústico `[~]` |

## 3. Decisões autônomas (uma linha, com reversão)

- `pedido_preso` abre só com `created_by` — reversão: uma linha no filtro.
- `lead_duplicado` **sem merge automático**; painel identifica/linka — reversão: remover links.
- Seis do criador decididas (baixa atômica com override; reprecificação com confirmação; `ignorar_*` só gerente; inteiro mantido; `sessionStorage`; custo no resumo) — reversões descritas em `business-rules/pendencias-do-criador-de-pedidos.md`.
- `1.62.0` mantido (não 1.61.2) porque há `capacidade_nova` — reversão: só com reclassificação honesta do fragmento.
- `LAYA` **não tocado** (decisão do dono) — reversão: (a) subir serviço ou (b) limpar env.
- Janela de build = recurso exclusivo; um pesado por vez; swap >4 GB para — reversão: nenhuma (política).
- Quatro fragmentos criados para PRs sem `.changes` — reversão: apagar os arquivos antes do corte (já foi cortado).

## 4. Produção

**1.62.1**, 7 containers healthy, `/health` 1.62.1. Três provas: `coletas_truncadas=[]`,
5 leads reafirmados, `URI too long` 0 em 70 min.

## 5. Decisões que continuam do dono

Motor `laya` (a/b) · régua dos orçamentos parados · ligar `ORDER_STOCK_ATOMIC` ·
119 orçamentos Mercos · Android físico.
