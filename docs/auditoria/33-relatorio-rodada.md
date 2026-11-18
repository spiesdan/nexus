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
| **Coletor do catálogo lê zero em produção** | `[!]` **crítico** | D | DOM real de `/produtos/` + parser/rota corretos + fail-loud com 0 páginas + 1 coleta real com `produtos_lidos > 0` (sem escrever) | log do `crm-mercos-1` em 1.58.0 (`cabecalho: []`, `paginas: 0`) | O parser não vê `<table>`/`<thead>`: medir a página e corrigir; hoje termina com código 0 |
| **Pareamento do catálogo** | `[!]` | D + Dono | após o coletor: `--dry-run` → relatório aprovado | #559, #578 | Depende do coletor acima e do deploy da 1.58.0 (em curso) |
| **A11y nas telas restantes** | `[~]` | D | axe sem violação crítica nas telas cobertas | #491/#516/#531/#535 | Cobertura além das 10 telas do `axe-telas-principais` |
| **iOS** | `[!]` **encerrado por decisão** | Dono | decisão registrada, sem item órfão | `29-capacidades.md` item 30 | — (fora de escopo; só volta com conta Apple + aparelho + distribuição por instalação) |
| **Release 1.58.0** | `[x]` tag | Dono (deploy) | tag `v1.58.0` + imagens publicadas | `4c7cd633` | Deploy em curso pelo dono; verificar `to_regclass` depois |

### O que está fechado (para não repetir)

P0 de código inteiro (F-09, F-17 73/73, service role, financeiro, fiscal,
estoque, deploy/restore, Sentinel v1), idempotência fiscal nas quatro rotas,
nome de campanha, nome fantasia, catálogo do Mercos **em código**, Sentinel
v1.1–v1.4, fichas 5.4/5.6/5.8/5.10-5.11, B-7 e kit fail-loud.

**Produção:** 1.57.0 saudável com sidecar na mesma versão; **1.58.0 com tag
publicada e deploy aprovado**, em curso pelo dono. O deploy é o único passo que
este programa não executa.
