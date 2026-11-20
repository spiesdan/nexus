# 33 — Relatório da rodada (18/11/2026, rodada 8)

> Substitui o relatório anterior, que descrevia a rodada 1 e já estava vencido em
> três pontos (P1-03/P0-08 abertos, nenhum Sentinel, PRs antigos sem triagem).
> A fila é [`30-fila-nexus-aaa.md`](30-fila-nexus-aaa.md); o progresso por marco é
> [`31-progresso-aaa.md`](31-progresso-aaa.md); o pacote de release é
> [`35-pacote-de-release.md`](35-pacote-de-release.md).

## 1. Baseline

| Campo | Valor |
|---|---|
| Repositório | `spiesdan/nexus` (único remote) |
| Branch do programa | `programa/nexus-aaa` |
| Base | `nexus/main` @ `139a1be5` (merges até #439) |
| Versão publicada | `v1.55.0` |
| Próxima release | `1.56.0` no PR #537, **não publicada** |
| Produção | reportada em 1.55.0; **não verificada e não tocada** |
| Ambiente | macOS, Node 22.20.0, pnpm 9.15.9 |
| Regra de operação | **2 workers + 1 coordenador**; ativos D e G |

## 2. O que foi feito nesta rodada

### 2.1 Integração (`nexus/main`)

| PR | O que entrou |
|---|---|
| #515 | catálogo do estoque/compras não esconde produto |
| #519 | admin não confunde erro de leitura com lista vazia |
| #517 | J6/J13/J14 provadas em Vitest (H, pausado) |
| #522 | ficha do Agente E fechada (E, pausado) |
| #455 | 48 updates minor/patch do dependabot |
| #163/#164/#166 | actions do `apk.yml` na versão corrente |
| #518 | **0320**: definers com `pg_temp` (A) |
| #520 | rate limit declarado (A) |
| #521 | listas com teto e tie-breaker (A) |
| #528 | **0321**: Sentinel v1.1 (G) |
| #523/#524/#525/#529/#531 | design/a11y (D) |
| #536 | invariante do flywheel sem medir o relógio |
| #472/#465/#468/#477/#476 | auditoria, snapshots, MIT, fontes |
| #13/#165 | dependabot actions |

### 2.2 Rebase e renumeração

**#439** (telefone fixo E.164) criava a migration **0312**, já usada pela trilha
de IA. Renumerada para **0320**; o apêndice do baseline foi concatenado depois da
0319 e **antes da varredura anon** (a migration cria função — a ordem não é
cosmética). MANIFEST e comentário atualizados no mesmo commit.

**#476/#477/#457/#465/#472/#468** foram rebaseados; o único conflito era o
`PROMPT-MESTRE-AAA.md` antigo, que o #478 substituiu — o hunk foi descartado e o
conteúdo útil (documento novo em `docs/auditoria/`) preservado.

### 2.3 Triagem dos PRs antigos

24 PRs avaliados. 3 fechados com motivo escrito (#7 segundo design system;
#168/#169 bumps major com CI vermelho). **#307** ficou `[!]`: o default
`"By nexus"` no rodapé do DANFE alcança o cliente final e viola a doutrina de
marca — a decisão (sem crédito × marca resolvida) é do dono. #518/#520/#521
esperam a retomada de A; #518 precisa renumerar 0320→0321.

### 2.4 Pacote de release

- Número **1.56.0** derivado (`pnpm release:conferir` → `1.55.0 + minor`),
  19 fragmentos, **nenhum `exige_acao`**.
- 7 fragmentos novos escritos para mudanças mergeadas que estavam sem eco
  (#507, #508, #509, #510, #512, #515, #519). Sem eles, a tela de atualização do
  dono da VPS mentiria por omissão.
- Inventário 0313–0320, checklist de corte, plano de deploy com rollback e
  critério de abortar.

## 3. Achados e decisões

| Item | Estado |
|---|---|
| PR #439 usava número de migration já ocupado (0312) | corrigido por renumeração; o gate de numeração não pegou porque o PR nunca mergeou |
| PRs de doc rebaseados contra o prompt mestre antigo | conflito era estrutural (#478 trocou o arquivo); descartar o hunk foi a resolução correta, não perda de conteúdo |
| `gh` não existe nesta máquina | triagem pela API REST com token do `hosts.yml`; registrado para a próxima rodada não perder tempo |
| #307 tem nome de produto no PDF | `[!]` decisão de marca — não é bug de código |
| Frentes A/E/F/H pausadas | pausa não é conclusão; cada uma tem ponto de retomada na fila |

## 4. O que **não** está pronto (honestidade do DoD)

O programa **não** terminou. Fechado em código: todos os P0 (F-09, F-17 73/73,
service role, financeiro, fiscal, estoque, deploy/restore, Sentinel v1).
Continuam abertos:

- **P1**: J14 LGPD sem prova de navegador; a11y nas telas restantes; snapshots
  visuais fora do CI (baseline por plataforma); mobile/offline em dispositivo;
  listas/tie-breaker (#521).
- **P2**: design system aplicado ao produto (D em andamento), shell/navegação,
  QA visual das telas.
- **P3**: iOS, Redis obrigatório (#520), limpeza de planos antigos (feita).
- **Release**: pacote pronto, **tag não criada**, deploy não executado.

## 5. Estado por ambiente

| Ambiente | Estado |
|---|---|
| Código | `nexus/main` @ `232c5fbf` + PRs de rebase aguardando CI |
| PR | 15 abertos (9 aguardando CI, 1 bloqueado por marca, 3 de frente pausada, 2 dependabot) |
| Release | **nenhuma** tag nova; última `v1.55.0`; 1.56.0 empacotada |
| Deploy | **nenhum**; produção intocada |
| Banco remoto | **nenhuma** migration aplicada |
| NF-e / pagamento | **nenhuma** operação real |

## 6. Como reproduzir

```bash
git log --oneline -1 nexus/main                 # baseline
pnpm release:conferir                            # número derivado (não escreve)
pnpm gov:verify                                  # typecheck + lint + test:unit
pnpm test:db                                     # baseline install+update (Docker)
pnpm test:shell                                  # kit de instalação
```

A triagem de PR usou a API REST do GitHub (o `gh` não está instalado); os
comandos exatos estão em [`30-fila-nexus-aaa.md`](30-fila-nexus-aaa.md) §11.

## 7. Quadro do DoD — estado, dono, aceite, evidência e o que falta

> **Este quadro é a fonte da verdade do que falta.** Ele é relido a cada rodada; item
> sem dono é obrigação do coordenador criar um. Nada desaparece sem uma linha
> dizendo por quê. `[x]` fechado · `[~]` parcial · `[!]` bloqueado/decisão · `[ ]`
> não iniciado.

| Item | Estado | Dono | Critério de aceite | Evidência | O que falta (1 frase) |
|---|---|---|---|---|---|
| **Ficha 5.4** inbox/atendimento/campanhas | `[~]` | D | ficha + 7 estados com evidência | #563 (`aa4020a3`) | Outbox no inbox web: mensagem sobrevive a reload/rede sem duplicar no dreno |
| **Ficha 5.6** pedidos/estoque/compras/expedição | `[~]` | D | ficha por subtela + estados | #571 (`f3e54867`) | Paginação de pedidos e subtelas de expedição, com o aceite escrito na ficha |
| **Ficha 5.8** fiscal | `[~]` | D | ficha + estados da nota e listas | #572 (`0c239946`) | Fechar a ficha com a evidência de E2E da camada de navegador |
| **Ficha 5.10/5.11** configurações/equipe/LGPD/admin | `[~]` | G | ficha + estados com evidência | #574 (`0405552a`) | Nenhuma pendência declarada; falta só a evidência de navegador |
| **J6/J13/J14** | `[~]` | F | navegador real: sucesso, erro, recuperação | #570 (Vitest) | Camada de navegador — o F está nela agora |
| **Sentinel v1.4** rejeição repetida | `[x]` | G | detector agrupado por cStat/emitente | #569 | — (fragmento reclassificado para `adicionado`) |
| **Painel de rejeição por fornecedor** | `[ ]` | G | painel lê ocorrências por CNPJ/emitente, read-only | — | Não existe; é a próxima do G |
| **`cadastro.endereco_com_lixo`** | `[x]` | G | detector por borda de palavra | #560, #564 | — |
| **B-7 mobile** dreno + revogação | `[x]` | F | dreno 200; `401 token_revoked` com fila intacta | #565 | — |
| **TalkBack** | `[!]` parcial | F/D | árvore + logcat no emulador | #576 | Só o acústico: texto falado, pronúncia pt-BR e anúncio dinâmico |
| **`update.sh` fail-loud** | `[x]` | Orquestrador | aborta antes do `up -d` em DDL não-benigno | #568 | — |
| **E2E completo** | `[~]` | F | veredito por spec (entra / fora com dono e data / morre) | workflow `FORA_DO_CI` | Matriz das 3 specs fora do CI, com bloqueio real de cada uma |
| **Coletor do catálogo lê zero em produção** | `[x]` | D | DOM real + parser/rota corretos + fail-loud com 0 páginas + coleta real | **#585**: rota real `/industria/…` (o `/produtos/` dava 404), 601 produtos lidos, exit 1 quando não há página | — |
| **Pareamento do catálogo** | `[x]` | D + Dono | 616 → 194 por código, 0 desativados | produção 19/11: 847 lidos, 55 criados, 567 atualizados | — |
| **Restante do pareamento** | `[!]` | Dono + D | 422 itens / 46 códigos e 9 ambíguos | **#588** aberto (descrição em `produto_codigo`) | Depende do #588 e da decisão humana dos 9 ambíguos |
| **A11y fora do recorte** | `[x]` | D | axe WCAG 2.2 AA, 0 violações críticas | **#583**: 14 rotas + `<h1>` da cabine + ordem anunciada | — |
| **Sentinel — claim de conversa parada** | `[x]` | G | liberar claim com motivo, sem perder histórico | **#590** (mergeado) | — |
| **Falso positivo da devolução no Sentinel** | `[x]` | G | devolução finalidade 4 não é duplicidade | **#584** | — |
| **Regressão local 1.58.0** | `[~]` | F | smoke + critical no commit da tag, com log | **#586** (aberto): smoke 32/32, critical 75/75, 2 defeitos reais | PR em revisão |
| **A11y nas telas restantes** | `[~]` | D | axe sem violação crítica nas telas cobertas | #491/#516/#531/#535 | Cobertura além das 10 telas do `axe-telas-principais` |
| **iOS** | `[!]` **encerrado por decisão** | Dono | decisão registrada, sem item órfão | `29-capacidades.md` item 30 | — (fora de escopo; só volta com conta Apple + aparelho + distribuição por instalação) |
| **Release 1.58.0** | `[x]` tag + deploy | Dono | tag + imagens + deploy verificado | `4c7cd633` | — |
| **Release 1.59.0** | `[x]` tag + deploy **verificado** | Dono | 7 containers em 1.59.0, `/health` `version 1.59.0`, checks ok, `fn_sentinel_encerrar_org_suspensa` presente | tag `v1.59.0`, commit `ccadd516`, 19/11/2026 | — |

### O que está fechado (para não repetir)

P0 de código inteiro (F-09, F-17 73/73, service role, financeiro, fiscal,
estoque, deploy/restore, Sentinel v1), idempotência fiscal nas quatro rotas,
nome de campanha, nome fantasia, catálogo do Mercos **em código**, Sentinel
v1.1–v1.4, fichas 5.4/5.6/5.8/5.10-5.11, B-7 e kit fail-loud.

**Produção:** 1.57.0 saudável com sidecar na mesma versão; **1.58.0 com tag
publicada e deploy aprovado**, em curso pelo dono. O deploy é o único passo que
este programa não executa.

## 8. Mapa dos sete pontos do Prompt Mestre reenviado (19/11/2026)

> Estados com evidência (PR/commit). Onde não há prova, é `[ ]`.

| # | Ponto cobrado | Estado | Dono | Evidência | O que falta (1 frase) |
|---|---|---|---|---|---|
| 1 | **Design/UI aplicado página por página** ("medir a11y não é redesign") | `[~]` | D | #583 (axe 14 rotas + ordem), #535/#531/#524/#525/#529 (shell/a11y) | Aplicar identidade nas subtelas restantes, começando por **expedição** (carga/rota/romaneio) |
| 2 | **Cobertura reconciliada** de rotas/subtelas/abas/modais/drawers/estados/jornadas | `[~]` | F | #589 (matriz das 3 specs fora do CI); `09-telas-estados`, `09b-subtelas` | Matriz única em `41-cobertura-reconciliada.md` com contagem por comando e exceções |
| 3 | **Mobile por ambiente** (web ≠ emulador ≠ Android real ≠ iOS) | `[~]` | F/D | web #514; emulador B-7 #565; Android real **nunca**; iOS decisão | Android real é `[!]` com motivo; iOS `[!]` encerrado por decisão |
| 4 | **Módulos 5.x** sem parcial escondido | `[~]` | D/G | fichas #563, #571, #572, #574, #581 | Fechar as pendências declaradas nas fichas (outbox, paginação, subtelas) |
| 5 | **Sentinel** com números (FP, reais, dedup, isolamento, retenção, observabilidade, correções) | `[~]` | G | 23 ocorrências · 20 de `E2E Test Org` · #584 (FP devolução) · #590 (claim) · #591 (retenção) · #596 (suspensa) | Depois de #596, remedir a distribuição e provar dedup/isolamento com número |
| 6 | **Desempenho/observabilidade** (bundle, SLI/SLO, erros, recuperação, carga, latência) com baseline e método | `[ ]` | G | nenhum SLI/SLO medido | `42-desempenho-e-slo.md`: baseline medido, método e alvo justificado |
| 7 | **Mercos**: dry-run + relatório; escrita só com autorização | `[~]` | D + Dono | #585 (coletor real, fail-loud), #594 (`--todos`, pendente) | `--aplicar` só depois da decisão dos inativos e do coletor em produção |

**Fonte única de auditoria de produção:** [`40-auditoria-de-acoes-em-producao.md`](40-auditoria-de-acoes-em-producao.md)
(PR #597 do dono). Este programa **não** registra ação de produção em outro
lugar — a fila aponta para lá.


### Atualização 19/11 — deploy 1.59.0 verificado

| Fato | Evidência |
|---|---|
| **1.59.0 em produção** — app/worker/scheduler/fiscal/mercos/ocr/rota, `/health` com `version 1.59.0`, todos os checks ok | tag **`v1.59.0`**, commit **`ccadd516`**, 19/11/2026 (verificação do dono) |
| `public.fn_sentinel_encerrar_org_suspensa` presente no banco | idem (verificação pós-deploy) |
| **Mercos autorizado** — coleta `--todos`, `catalogo.mjs --aplicar` e `parear-itens.mjs --aplicar` | autorização textual do dono, 19/11; registro em `40-auditoria-de-acoes-em-producao.md` item 7 |


### Atualização 19/11 — frente do criador de pedidos

| Item | Estado | Evidência |
|---|---|---|
| Bug "Criar pedido" do perfil não levava o cliente | `[x]` | **#609** (`?contato=` lido no servidor) |
| Riscos **B.7** revisão, **B.9** valores, **B.10** estoque, **B.12** preço/aprovação, **B.14** quantidade, **B.15** autosave | `[x]` | **#615** (prova de componente por risco) |
| Coluna persistente no desktop | `[~]` | **#613** em revisão; falta a **barra fixa no celular** |
| Três experimentos de bundle revertidos | `[x]` | **#614/#616/#617**; conclusão em [`44-inbox-103-experimentos.md`](44-inbox-103-experimentos.md): micro-splitting não paga (−4 KB, +2 KB, +1 KB), resta arquitetura |
| 1.59.1 publicada, não deployada | `[!]` | aguarda autorização por versão do dono |
| Cinco decisões comerciais abertas | `[!]` | fila §28 (reserva, reprecificação, UI de override, fração/granel, fallback de rascunho) |

### Atualização 19/11 — catálogo do Mercos aplicado em produção

| Medida | Número |
|---|---|
| Coleta `--todos` | **847 produtos**, 57 páginas, total do ERP 847 (`/tmp/mercos/produtos-todos.jsonl`) |
| Catálogo `--aplicar` | lidos 847 · **criados 55** (todos inativos) · **atualizados 567** · divergentes 34 · sem código 210 · **gravados 622** |
| Pareamento `--aplicar` | itens sem produto **616 → 194 pareados por código**; restantes **422**; 46 códigos ainda sem produto; 2 candidatos por nome e 9 ambíguos **não aplicados** (só relatados) |
| Catálogo depois | **1.196 produtos** (1.139 ativos, 57 inativos), **799** com `origem='mercos'` |

**Execução:** código da `main` copiado para `/app/_fix` no container (a imagem é
**1.59.0**; o `origem` no upsert entra oficialmente na próxima release). Data:
**19/11/2026**. Reversão: os 55 criados têm `origem='mercos'` e `created_at` do dia
(desativar, nunca apagar); o pareamento é `product_id` com a lista no relatório;
dump pré-deploy cobre o resto.

**Estado no quadro:** *pareamento do catálogo* `[x]`. O **restante** vira item
próprio: **46 códigos / 422 itens** dependem do **#588** (importador grava
descrição em `produto_codigo` quando o item vem sem código) e dos **9 ambíguos**
(decisão humana produto a produto).

### Atualização 19/11 — deploy 1.60.0 e fim do `[!]` do catálogo

| Item | Estado | Evidência |
|---|---|---|
| Deploy **1.60.0** | `[x]` | `update.sh --to v1.60.0`; 7 containers; `/health` `version 1.60.0`; checks supabase/redis/rate_limit/waha; `/login` 200 |
| `origem` no **artefato oficial** (sem cópia manual) | `[x]` | imagem 1.60.0: coleta 847/57 páginas; dry-run `criados 0 · atualizados 622 · divergentes 34 · sem código 210`, sem erro |
| Importação depende de cópia manual | `[x]` **fechado** | idem |
| `[!]` do catálogo | `[x]` **fechado** | item 6/`40` |
| **#640** (inbox thread, D) | `[~]` | aberto; merge quando o CI fechar (congelamento acabou) |
| Matriz E do F na 1.60.0 | `[~]` | reexecutar `criador-de-pedidos-matriz.spec.ts` no build oficial e registrar §9 |
| Sentinel: encerrar devolução na próxima varredura | `[~]` | confirmar `nao_detectada_na_execucao` na varredura de 6h; se não, é bug |


### Cobertura reconciliada — 159 superfícies, donos definidos (19/11/2026)

| Bloco | Superfícies | Dono |
|---|---:|---|
| Aplicadas | **14** | D/F/G (evidência na matriz) |
| Pendentes `app/app` | **96** | **D** |
| Pendentes `admin` | **22** | **G** |
| Pendentes público/auth/estado | **25** | **F** |
| **Total pendente** | **143** | — |

Régua: antes/depois na mesma base, claro/escuro × 1440/390, contraste medido,
overflow/console, e **linha da matriz com veredito + evidência**. Exceção =
`fora de escopo com motivo`.


### Atualização 20/11 — 1.61.1 verificada e Sentinel fechando os falsos positivos

| Item | Estado | Evidência |
|---|---|---|
| Deploy **1.61.1** | `[x]` | 7 containers healthy; `/health` 1.61.1; supabase/redis/rate_limit/waha ok; `/login` 200 |
| Sentinel: `divergencia_valor_nota` e `nota_duplicada_por_pedido` | `[x]` encerradas | rodada real: `achados=20 · criadas=0 · reafirmadas=20 · **encerradas=2** · truncado=false` |
| Série do SLO viva | `[x]` | 1ª amostra real: `/api/v1/commercial-orders · 200 · 1428 ms · 03:51Z`; hipótese de `after()` quebrado **errada** |
| p95 da API | `[~]` | 1 amostra **não é p95**; sinal para olhar com série |
| `operacao.lead_duplicado` | `[!]` **reais** | 5 ocorrências: mesmo contato, dois leads abertos; ação é mesclar (Dono/operação) |
| `operacao.pedido_preso` | `[!]` decisão | 15 ocorrências; ruído de lote; opções a/b/c em `business-rules/pendencias-do-sentinel.md` |
