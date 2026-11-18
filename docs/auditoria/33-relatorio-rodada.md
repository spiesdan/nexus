# 33 — Relatório da rodada (18/11/2026)

> Fecha a rodada iniciada com o prompt mestre novo (#478). A fila é
> [`30-fila-nexus-aaa.md`](30-fila-nexus-aaa.md); o progresso por marco é
> [`31-progresso-aaa.md`](31-progresso-aaa.md); a análise fiscal é
> [`32-analise-fiscal-aaa.md`](32-analise-fiscal-aaa.md).

## 1. Baseline

| Campo | Valor |
|---|---|
| Repositório | `spiesdan/nexus` (único remote) |
| Branch do programa | `programa/nexus-aaa` |
| Base | `nexus/main` (a cada merge; a fila registra o commit de cada item) |
| Versão publicada | `v1.55.0` |
| Produção | reportada em 1.55.0; **não verificada e não tocada** |
| Ambiente | macOS, Node 22.20.0, pnpm 9.15.9, Docker 29.8.2 |

## 2. O que foi mergeado na `main`

| PR | Commit | Requisito | Prova |
|---|---|---|---|
| #478 | `126f4bb3` | Prompt mestre novo é a lei | CI 5/5 |
| #451 | `7385b9ad` | F-09-B com catraca (`db push` proibido) | CI 5/5 |
| #453 | `e29ecf51` | F-17: 39 tabelas provadas | CI 5/5 |
| #481 | `4a9bddc2` | F-09 provado por execução: install, update, ACL, reset, restore | `prova-f09.sh` + evidências |
| #464 | `f3ea10d6` | Índice 0313 da janela de mensagens | medição 25–54 ms → 5,7–19 ms |
| #466 | `f56c0228` | Rate limit em MFA e recuperação | testes |
| #475 | `470aac4e` | `29-capacidades.md`, runbook e gate D3 | gate verde |
| #480 | `7a498f9d` | **P0-04** teto do recebível sob concorrência | `test:db` 160/1497; CI 5/5 |
| #482 | `93109bff` | **P0-02** F-17: débito 34→0 | 67 testes + completude 152 |
| #483 | `dd515696` | **P0-03** service role revisado; vazamento de envio corrigido | 210 handlers/100 cadeias; teste cross-org |
| #484 | `f691dc06` | **P0-05** uma nota viva por pedido | `test:db` 160/1497; CI 5/5 |
| #485 | `239efd32` | **P0-09** recebimento de compra com CAS | 5 casos + CI 5/5 |
| #486 | `2e95f74f` | F-17 nos 4 eixos (SELECT/UPDATE/DELETE/INSERT) | 367 testes |
| #456 | `615de767` | Recebível avulso honra `Idempotency-Key` | testes de rota |

## 3. Em PR ao encerrar a rodada

Nenhum PR de P0 ficou aberto. O **#489** (Sentinel v1) foi mergeado em
`f644b21c` com CI 5/5; o #487 foi fechado em favor dele por colisão de versão.

O #487 foi fechado em favor do #489 porque a 0315 já era da nota-viva (#484);
a integração renumerou para 0316 e reconstruiu o baseline como `main + bloco 0316`.

## 4. Achados novos desta rodada

1. **Teto do recebível furado sob concorrência** (P0-04) — corrigido em #480.
2. **Duas notas vivas para o mesmo pedido** (P0-05) — corrigido em #484.
3. **Recebimento de compra somando estoque duas vezes** (P0-09) — corrigido em #485.
4. **Envio de mensagem atravessando organização** (P0-03) — encontrado na revisão
   dos 100 encadeamentos com service role; corrigido em #483 com prova
   cross-org e controle positivo.
5. **MANIFEST mandava reaplicar a cadeia via `db push`** — corrigido e coberto
   por gate (#480).
6. **Rebase do #464 tinha apagado o bloco 0312 do baseline** — reconstruído a
   partir da `main` + apêndice 0313; update com `ON_ERROR_STOP=1` exit 0.
7. **Duas implementações de F-17** (nossa #482/#486 e a da frente A, #479/#488)
   — a mais forte foi integrada (#486, 4 eixos); as duplicatas foram fechadas
   com referência.

## 5. Decisões pendentes (não inventadas)

| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-01 | Regra do nome automático de campanha por cidade | lista literal / primeira + contagem / prefixo | lista literal, ordenada, corte em 120 |
| D-02 | Comportamento ao editar o nome manualmente | desliga automático / sobrescreve / campo separado | desliga até "usar nome sugerido" |
| D-03 | Idempotência fiscal (`Idempotency-Key`) | devolver recurso original / 409 | devolver original (como o financeiro) |

## 5.1 Follow-ups abertos (não bloqueiam P0)

| Item | Estado | Observação |
|---|---|---|
| #490 — guarda de organização no `_handler` do MCP | CI vermelho | o teste `contato-audit-from-to` usa um fake de Supabase com `.eq` não encadeável; a correção é no fake (ou no handler), não no produto. Fora do P0 fechado. |
| #471/#468/#472/#457/#465/#476/#477/#439/#438 | abertos | P1/P2/P3 e auditoria; não foram integrados nesta rodada. |

## 6. Bloqueios reais

| Item | Bloqueio |
|---|---|
| P1-03 campanha por cidade | D-01/D-02 |
| P0-08 idempotência fiscal | D-03 |
| P1-04 mobile/offline em dispositivo | sem APK/emulador nesta máquina |
| P3-01 iOS | ausente por decisão; exige conta Apple e escopo |
| Deploy/release | proibido nesta rodada; nenhuma escrita em produção |

## 7. O que **não** está pronto (honestidade do DoD)

O programa AAA **não** terminou. Esta rodada fechou os P0 de código que estavam
ao alcance (F-09, F-17, service role, financeiro, fiscal, estoque, deploy/restore)
e entregou o Sentinel v1 em PR. Continuam abertos, no mínimo:

- **P1**: jornadas J6/J13/J14 com falhas; fiscal F1–F7 (confirmações,
  idempotência, retry, paginação); campanhas por cidade; mobile/offline em
  dispositivo; a11y nas telas restantes; rate limit em crons/MCP.
- **P2**: design system aplicado ao produto, shell/navegação, consistência de
  módulos, QA visual das telas.
- **P3**: iOS, Redis obrigatório, limpeza de planos antigos.

Nenhuma tela foi redesenhada nesta rodada, nenhum módulo foi reauditado por
completo, e o Sentinel não foi implantado. Chamar isso de "Nexus AAA" seria
contrariar o §13 do prompt mestre.

## 8. Como reproduzir a evidência

```bash
# gates de código
pnpm typecheck && pnpm lint && pnpm test:unit

# banco (Docker): install + update + invariantes
pnpm test:db

# F-09 por execução (Postgres descartável)
bash scripts/auditoria/prova-f09.sh

# Sentinel (na branch integracao/sentinel)
pnpm exec vitest run lib/sentinel
```

## 9. Estado por ambiente

| Ambiente | Estado |
|---|---|
| Código | mergeado na `main` até `f644b21c` (Sentinel v1 incluso) |
| PR | nenhum P0 aberto; #489 mergeado |
| Release | **nenhuma** tag nova nesta rodada; última `v1.55.0` |
| Deploy | **nenhum**; produção intocada |
| Banco remoto | **nenhuma** migration aplicada |
| NF-e / pagamento | **nenhuma** operação real |
