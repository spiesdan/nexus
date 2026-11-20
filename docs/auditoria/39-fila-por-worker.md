# 39 — Fila por worker (viva)

## TURNO — protocolo noturno (20/11/2026, ordem do dono)

1. **Fila nunca vazia**: cada worker tem **≥3 tarefas escritas à frente** aqui;
   quando uma termina, a próxima já está na seção dele.
2. **Ninguém para sem entregar**: fim de fatia = **PR aberto** ou **bloqueio com
   pergunta exata**. O coordenador responde **sempre com a próxima tarefa na mesma
   mensagem** — nunca “aguarde”.
3. **Decisão reversível se decide sozinho**: nome, ordem, microcopy, densidade,
   estado vazio → decide, registra **uma linha no PR** e segue. Só para se for
   **irreversível** (migration destrutiva, fiscal/financeiro, exclusão de dado,
   regra de negócio) — aí vira proposta e o worker pega outra da fila.
4. **PR verde é mergeado pelo coordenador**; `dirty` → rebase. Não acumular PR.
5. **Release**: bloco fechado (rotas 1–3 + verdes) → **congelar merges**, cortar,
   mergear o PR de release e avisar o dono com a tag. **Deploy é do dono**.
6. **Nada pesado em paralelo**: um build/Playwright por vez; produção em **1.61.1**
   intocada até o próximo deploy.

## AGORA

- **D:** #673 com `verify` vermelho → corrigir e mergear; depois rotas fatia 2/3 e o **cartão agrupado** do `pedido_preso`.
- **F:** (5) `sessionStorage` e (6) custo no resumo → (3) `ignorar_*` só gerente → (1) baixa atômica → (2) reprecificação.
- **G:** (A) regra do `pedido_preso` por `created_by` + links na evidência de lead.
- **Coord:** PR das decisões de 20/11; despacho e `## AGORA` a cada relatório.

## PRÓXIMA TAREFA — D

1. **#673**: corrigir o `verify` (é o mapa/rotas), sem afrouxar gate, e mergear.
2. **Rotas, fatia 2/3**: estado de falha (geocodificação que não resolve, endereço
   ausente, rota vazia) — antes/depois, claro/escuro × 1440/390, contraste,
   overflow/console, linha da matriz `41`.
3. **`pedido_preso` — apresentação**: agrupar as ocorrências da mesma regra num
   **cartão com contagem** ("121 rascunhos antigos"), sem mudar a regra (a regra
   por `created_by` é do G). PR de UI, com teste de componente.

## PRÓXIMA TAREFA — F

Na ordem decidida: **(5)** `sessionStorage` como segunda tentativa no rascunho
(avisar só quando as duas falharem) → **(6)** custo no resumo de
recebimento/faturamento (quantidade **e** valor; não recalcular preço) →
**(3)** `ignorar_estoque`/`ignorar_credito` na UI **só para gerente**, motivo
obrigatório e auditoria → **(1)** baixa de estoque na transação do pedido, com
override de gerente como escape → **(2)** reprecificação ao trocar tabela, com
confirmação linha a linha. Cada um com teste dirigido e PR próprio.

## PRÓXIMA TAREFA — G

**(A)** `operacao.pedido_preso`: implementar a decisão — abrir só com
`created_by IS NOT NULL` e manter os importados fora do ruído (sem coluna, sem
migration). **(B)** `lead_duplicado`: painel **identifica e linka** (nome →
telefone → e-mail → id), **sem merge automático**, e a evidência passa a levar os
links. Testes: autor humano × importado; lead com dois ids linkados.

## PRÓXIMA TAREFA — Coordenação

PR `docs/decisoes-2026-11-20` (decisões A/B/C com justificativa e reversão),
merge do #673 quando D fechar, e `## AGORA` atualizado a cada relatório.

## Regras de encerramento e despacho (20/11/2026)

1. **Nenhum worker encerra fatia sem PR ou bloqueio com pergunta exata.** “Terminei
   e parei” não é estado válido: ou entrega, ou pergunta.
2. **Todo relatório de worker recebe a próxima tarefa na mesma resposta** —
   nunca “aguarde”.
3. Se a próxima depende de decisão do dono, o coordenador **dá outra** da fila:
   worker não fica parado por pendência de terceiro.
4. `## AGORA` é o **ponto de retomada único** — primeiro lugar que qualquer
   agente lê ao voltar.

> **Regra do dono (18/11/2026):** quando um worker termina, **o coordenador
> delega a próxima** — e a fila tem sempre **agora + próximo + depois**, escrita
> aqui. O `próximo` nunca depende do `agora`; se a fila esvaziar, a falha é do
> coordenador.
>
> Item só entra com **critério de aceite** e tamanho de fatia. O quadro geral do
> DoD é [`33-relatorio-rodada.md`](33-relatorio-rodada.md) §7; esta fila é a
> tradução dele para cada slot.

## D — design/módulos

- **agora:** *aguardando liberação* — estudo C fechado (#610): página única
  mantida; a próxima fatia é **coluna persistente no desktop + barra fixa no
  celular**. **Não editar** `_editor/_cliente/_itens` até o F avisar.
- **próximo:** *coluna + barra fixa no criador* — total visível 6/6 no desktop,
  rolagem do celular sem piorar, `/` e 320 px preservados. Aceite: os mesmos
  números do estudo + captura antes/depois.
- **depois:** *design em expedição (retomar #607)* — subtelas restantes.

> Ambiente: o `next dev` da 3021 foi derrubado ao fim da medição; Chromium não
> ficou de pé.

## F — mobile/jornadas/qualidade

- **agora (topo, P0):** *criador de pedidos — funcional* — #609 (botão do perfil
  abre o editor com o cliente) e o **defeito herdado do rascunho**:
  `descontoTexto` é salvo e não volta na restauração. Aceite: ambos com teste;
  avisar o coordenador ao fechar para liberar os arquivos ao D.
- **próximo:** *testes de regressão do fluxo* — criar, editar item, salvar,
  retomar, offline sem perder texto. Aceite: testes dirigidos verdes.
- **depois:** *benchmark D* — tempo/cliques contra o estado anterior.

## G — Sentinel

- **agora:** *fechar desempenho/SLO (#608) e a reativação do Sentinel (#600)* —
  SLO com baseline medido (bundle, p50/p95, erros) e teste de reativação verde.
  Aceite: ambos nos 5 checks e mergeados.
- **próximo:** *remedição do Sentinel pós-#596* — distribuição por
  organização/regra, FP e dedup com número. Aceite: tabela antes/depois.
- **depois:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis com risco/CAS/rollback; não executar. Aceite: aprovação do dono.

## Coordenação (fora dos 3 slots)

- Fechar **#580** (este quadro) e verificar a 1.58.0 pós-deploy: `to_regclass`
  das quatro tabelas, funções da correção e rotação de imagens.
- Quando o deploy do dono terminar: disparar o **`--dry-run`** do catálogo do
  Mercos e levar o relatório (criados/atualizados/divergentes/sem_codigo) para
  aprovação — nada é aplicado sem ela.

## Restrição de ambiente (ordem do dono, 19/11/2026)

A máquina já reiniciou três vezes hoje (load 10/26/37; 7,8 GB de swap). **O
coordenador responde por isso na fila e nos despachos**, e todo worker recebe
estas regras no prompt:

1. **Um `next build` por vez, nunca dois em paralelo.** Se precisar de build,
   espera o outro terminar — ou usa teste dirigido. Medido nesta rodada: **dois**
   `e2e-build.sh` rodavam em worktrees diferentes; o duplicado foi morto e o swap
   caiu de 7,8 GB para 5,8 GB.
2. **Nada de suíte completa** (`test:unit`, `test:db`, e2e inteiro) por rotina —
   só teste dirigido ao arquivo/fatia.
3. **Dev server sobe só enquanto precisa** e é derrubado no fim (3000/3021/3022).
4. **Emulador Android só com prova de aparelho a fazer**, e `adb emu kill` depois.
5. **Docker local**: `supabase stop` quando nenhuma fatia depende dele.
6. **Build de imagem Docker só no CI**, nunca local em paralelo com `next build`.

**Serialização:** quando um worker pedir algo pesado, o coordenador diz quem roda
primeiro e quem espera — e registra aqui. Nesta rodada: F ficou com o único build
(e2e da jornada); D e G seguem em teste dirigido, sem build.

## Contrato da matriz de cobertura (`41-cobertura-reconciliada.md`)

**A matriz é o backlog único do design.** O D não avança por impressão: avança
por linha, marcando cada uma.

### Formato obrigatório por linha

| caminho | módulo | redesign? | estados (o que existe) | evidência | dono |
|---|---|---|---|---|---|
| `/app/pedidos` | 5.6 | `aplicado` / `já conforme` / `pendente` / `fora de escopo (motivo)` | vazio · carregando · erro · permissão · offline · limite | captura + commit | D |

- **Linha sem veredito é pendência visível** — não pode desaparecer.
- **Estados**: dizer quais existem hoje e quais só existem no papel; "não se
  aplica" também é resposta, com motivo.
- **Ordem**: risco de uso — pedidos, inbox, fiscal, expedição, financeiro;
  depois configurações; depois admin.

### Reconciliação numérica (fechar no topo da matriz)

Contagem por comando, não por memória:

```bash
find app/app -name page.tsx | wc -l          # 111 na main de 19/11
find app -name page.tsx | wc -l              # 158
grep -c 'href: "/app' lib/navigation/registry.ts   # 78 (rotas de menu)
find app/admin -name 'page.tsx' | wc -l      # 21
```

A soma dos estados da matriz **tem que fechar** com essas contagens; diferença
explicada (rota dinâmica, tela fora do menu, redirecionamento). Se a contagem
mudar no código, a matriz muda no mesmo PR — o número não envelhece.

## Janela de build — serialização manual pelo orquestrador (19/11/2026)

**Aberta às 19/11, ~12 minutos.** Motivo: o D perdeu **dois** `next build`
(SIGTERM 143 e restart) e, sem build, a prova visual do #613 fica impossível.

Regras da janela:

- **Nenhum** `next build`, Playwright, suíte (`test:unit`/`test:db`/e2e) ou
  emulador nos três workers; só leitura, edição e teste unitário curto.
- O **orquestrador** roda o build do D no worktree dele; ninguém mais builda.
- Processo pesado que aparecer durante a janela **é morto** (feito com dois `tsc`
  que estavam rodando) e o worker refaz depois.
- Ao fim, o orquestrador confirma que não sobrou `next`/Chromium e **libera** os
  agentes.

Estado no momento da abertura: `load 12,6`, swap 4,9 GB, **zero** `next-build`,
`next-server`, Chromium ou emulador.

### Resultado da janela — usada com sucesso

- O build do D foi concluído com **`EXIT=0`**, 52 páginas estáticas e `.next/BUILD_ID`
  presente. Antes da serialização ele tinha morrido **duas vezes** (SIGTERM 143 e
  restart por concorrência).
- **Violações mortas durante a janela:** um **segundo `next build`** (screen
  `matriz-e`, 448 MB, 92% CPU) e três `tsc --noEmit` que subiram por conta própria.
  Com isso o swap caiu de **7,6 GB → 2,6 GB** e sobrou só o `next start` + Chromium
  **do D** para as capturas.
- Prova de que a regra **um-pesado-por-vez** funciona: mesmo build, mesma máquina,
  `EXIT=0` quando ninguém compete. A regra continua.

### Segunda janela — captura “depois” do #620 (19/11/2026)

**Custo da primeira janela, registrado:** matei **1 `next build`** concorrente e
**3 `tsc --noEmit`** que subiram sozinhos; com isso o swap caiu de 7,6 → 2,6 GB e o
build do D fechou com `EXIT=0`. **A regra continua valendo** — um pesado por vez,
sempre.

**Abertura da segunda:** matei um **build pendurado de 20 min** (screen `matriz-e2`,
636 MB, 65% CPU, worktree `pedidos-criador`) e **1 `tsc`** do G; swap caiu de
**7,8 → 6,0 GB** e não sobrou `next`, Chromium, emulador, suíte ou `tsc` rodando.
A janela é para **um** build (o do `front/pedidos-design`, já com o #620) e **uma**
captura “depois”; F e G ficam em trabalho leve até a liberação.

### Duas janelas, duas bem-sucedidas — a regra vira dado

| Janela | O que foi morto | Resultado |
|---|---|---|
| **1ª** (build do D/#613) | **1 `next build`** concorrente + **3 `tsc --noEmit`** | `EXIT=0`, 52 páginas; swap 7,6 → 2,6 GB |
| **2ª** (build do #620) | **1 `next build`** do G (`/private/tmp/nexus-g`) + **1 `next start` de 315 MB** + **Chromium** | `EXIT=0`; `<h1>` 12 → **499 px**, barra 964 px/8 → **465 px/4**, cruzamento h1×ações **sim → não**, overflow 0 em 1440 e 390 |

**Conclusão com dados:** o mesmo build, na mesma máquina, falhou duas vezes sob
concorrência e passou duas vezes quando ninguém competiu. **Um pesado por vez é
regra permanente** — e processo pesado que aparecer durante a janela é morto.

**Confirmado na `main`:** #619 (`2d395fc7`, erro único de anúncio) e #620 (ações
do criador em “Mais opções”) entram com o CI fechado.


## Regra permanente — congelar ANTES de cortar (20/11/2026)

Três cortes ficaram defasados porque o merge entrou depois do disparo. O processo
correto, agora escrito:

1. **Congelar merges primeiro** — coordenador avisa os três workers, e ninguém
   mergeia (nem o coordenador), só commita na branch.
2. **Confirmar o congelamento** (nenhum merge em voo, fila de CI sem PR recém-aberto).
3. **Só então** disparar o workflow de `release` do topo da `main`.
4. Mergear o **PR de release** quando verde — é a única exceção ao congelamento.
5. Depois da tag, **descongelar** e retomar a fila.

Cortar antes de congelar produz release que persegue merge e obliga fechar PR de
release (aconteceu com #639 e #664).

## Regra de release e deploy (20/11/2026)

- **Congelar merges primeiro**, confirmar, e só então disparar o corte; o PR de
  release é a única exceção ao congelamento.
- **Deploy não espera mais “pode”**: subir versão publicada (`update.sh --to vX.Y.Z`)
  tem autorização permanente do dono desde 20/11/2026 (“pode sempre! grave isso”),
  com escopo e limites no `40` §0.
- **Continua exigindo**: backup, `update.sh` (nunca compose na mão), verificação
  com números, rollback armado e **item novo no `40`**. Autorização não dispensa
  prova — operação fiscal/financeira, provedor, exclusão de dado e migration
  destrutiva seguem pedindo “pode” caso a caso.

## Fila de reserva (≥3 por worker)

**D:** 1) #673 (corrigir verify e mergear) · 2) rotas fatia 2/3 (estado de falha do
mapa/rota) · 3) rotas fatia 3/3 (publicar/enviar) · 4) cartão agrupado do
`pedido_preso` · 5) contatos/clientes · 6) configurações/equipe.

**F:** 1) #679 (`sessionStorage`) e #680 (custo no resumo) — mergear · 2)
`ignorar_*` só gerente com motivo/auditoria · 3) baixa atômica com override · 4)
reprecificação com confirmação · 5) matriz E §9 na 1.61.1 (se ainda aberta) · 6)
as 24 de público/auth na `41`.

**G:** 1) as 22 telas de `admin` (uma por PR) · 2) p95 quando a série acumular ·
3) varredura do Sentinel com a lente “1:N assumido como 1:1” · 4) evidência de
lead com links (feito no #678) → próximos detectores.

**Coordenação:** mergear #673/#679/#680 quando verdes; congelar e cortar quando o
bloco fechar; relatório único ao amanhecer (entregas por worker, aberto com dono,
decisões autônomas com reversão, estado de produção).
