# 66 — Backlog vivo do programa NEXUS AAA

> Fila viva ao lado do [`39-fila-por-worker.md`](39-fila-por-worker.md). Uma linha
> por item: **id · item · estado · dono · evidência · próximo passo**.
> Estados: `[x]` fechado · `[~]` em curso · `[!]` bloqueado · `[ ]` não iniciado.
> **Nada sem dono.** Worker que termina recebe a próxima tarefa na mesma mensagem;
> coordenação não deixa slot vazio.

## P0

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P0-1 | Reauditoria de service role (223 rotas/294 arquivos vs revisão de 42 cadeias em 18/11) | `[~]` | G | contagem do dono + gates `handlers-service-role-filtram-organizacao` | concluir varredura e provar filtro no ponto de uso |
| P0-2 | Registrar verificação do deploy 1.62.3 no `40` (o doc para na 1.62.2) | `[~]` | coordenação | 7 containers, health 1.62.3, `/login` 200, `URI too long` 0, Sentinel 5 reafirmados | item novo no `40` com números e a lição do `exit 124` |
| P0-3 | Motor laya: subir (a) ou limpar `LAYA_URL` (b) | `[!]` | **BLOQUEADO — dono** | `40` §19: 50 qualificações/17 risk/17 radar em 6h | dono escolhe (a) serviço na VPS ou (b) env limpo |
| P0-4 | Reconciliar 119 vs 124 orçamentos Mercos + superfície “Orçamentos parados” | `[~]` | coordenação (recorte) + D (tela) | 124 rascunhos `origem=mercos`, R$ 218.003,63; medição antiga dizia 119 | registrar recorte com data/filtro; D projeta tela com idade/valor/próximo passo |
| P0-5 | Confirmação de rota transacional (atomicidade) | `[~]` | G | falha de gravação parcial observada no passe de rotas | CAS/transação + teste de concorrência |

## P1

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P1-1 | 96 telas `app/app` por concentração + contraste por token | `[~]` | D | varredura fatiada de 99 rotas; tenent-switcher 82 rotas | terminar fatias, consertar por concentração |
| P1-2 | `rota_versao_confirmada` (0334) + escrita pelo app | `[~]` | G | migration reservada 0334 | migration + escrita transacional ligada ao P0-5 |
| P1-3 | Mapa↔lista sincronizados + pino por precisão | `[~]` | D | PRs de rotas do passe de expedição | seleção no mapa reflete na lista e vice-versa |
| P1-4 | GPS “sem sinal há N min” + `PHOTON_URL` no env/template | `[~]` | G | `08-mobile-offline`, docs de expedição | estado explícito no painel + env documentado |
| P1-5 | E2E 17/18/19: GPS ausente, mobile real, fila offline com retry/conflito | `[ ]` | G (próximo) | specs em `tests/e2e/`; Android real nunca rodou | escrever specs e marcar bloqueio de dispositivo |
| P1-6 | 24 rotas dinâmicas sem id: criar fixture local e medir | `[ ]` | D (próximo) | `41`: 24 inválidas com motivo | fixture com id real; re-medir e baixar `pendente` |
| P1-7 | F-04: token canônico (`#67885d` vs `#7e77f0`) com medição | `[ ]` | D (próximo) | dois hex em arquivos de design | escolher token, medir contraste, documentar |
| P1-8 | Workbench de expedição no mobile em abas/drawer (hoje empilha) | `[ ]` | D (próximo) | capturas do passe de expedição | protótipo + medição 390 px |
| P1-9 | Matriz única de capacidades de expedição (hoje dispersa em handoffs) | `[ ]` | coordenação | handoffs em `docs/frentes/` | consolidar em matriz com dono/estado |
| P1-10 | 10 `.in()` sem teto restantes (doc 51) — priorizar os de cron | `[ ]` | G (próximo) | `docs/auditoria/51-postgrest-in-sem-teto.md` | teto explícito nos de cron primeiro |
| P1-11 | `anon` com GRANT em 58/179 tabelas no descartável (limite F-09) | `[ ]` | G | gate F-09; medição do descartável | investigar se intencional; revoke se não for |
| P1-12 | `Idempotency-Key` em `POST /messages` (pré-requisito do outbox web) | `[ ]` | F (próximo) | contrato em `lib/api/idempotencia.ts` | reivindicação antes do efeito + teste de replay |
| P1-13 | SLO p95 real quando a série acumular (hoje 1 amostra = 1428 ms) | `[~]` | G | `42-desempenho-e-slo.md`: 1 amostra não é p95 | aguardar série e publicar p95 medido |
| P1-14 | 5 leads duplicados reais | `[!]` | **BLOQUEADO — dono (merge)** | Sentinel 5 reafirmadas; sem merge automático | dono decide mesclar; ferramenta só linka |
| P1-15 | Android físico / iOS | `[!]` | **BLOQUEADO — dono** | iOS fora por decisão; Android real nunca executado | dispositivo + decisão de escopo |
| P1-16 | Recontar inventário vivo (440 rotas hoje vs 419 em 18/11) com delta explicado | `[ ]` | coordenação | contagem do dono + `inventario-rotas.md` | comando de contagem + delta por módulo |

## P2

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P2-1 | `prompt-mestre.sha256` inválido (registra `ee40a0a2…`, arquivo mede `c37217c4…`) | `[ ]` | coordenação | hashes fornecidos pelo dono | recalcular hash e corrigir registro |
| P2-2 | Docs com contagens antigas (F-11) | `[ ]` | coordenação | F-11 em `docs/auditoria/` | trocar número por comando onde couber |
| P2-3 | Reclassificar fragmento `observabilidade-sonda`? | `[!]` | **BLOQUEADO — dono** | fragmento `capacidade_nova` definou 1.62.0 | dono decide; mudança só com reclassificação honesta |
