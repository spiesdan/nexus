# 39 — Fila por worker (viva)

> **Regra do dono (18/11/2026):** quando um worker termina, **o coordenador
> delega a próxima** — e a fila tem sempre **agora + próximo + depois**, escrita
> aqui. O `próximo` nunca depende do `agora`; se a fila esvaziar, a falha é do
> coordenador.
>
> Item só entra com **critério de aceite** e tamanho de fatia. O quadro geral do
> DoD é [`33-relatorio-rodada.md`](33-relatorio-rodada.md) §7; esta fila é a
> tradução dele para cada slot.

## D — design/módulos

- **agora:** *estudo C do criador de pedidos (somente medição)* — wizard de 5
  etapas × tela única com resumo persistente: medir cliques, tempo, erro, teclado
  e viewport **no estado atual**, sem tocar `_editor/_cliente/_itens` (são do F
  nesta rodada). Aceite: comparativo com números e recomendação.
- **próximo:** *aplicar o desenho vencedor* — só depois que o F fechar a fatia
  funcional e avisar; arquivos liberados na ordem. Aceite: fluxo com o desenho
  aprovado, estados e captura antes/depois.
- **depois:** *design em expedição (retomar)* — #607 em revisão; seguir nas
  subtelas restantes. Aceite: uma tela por PR com captura.

## F — mobile/jornadas/qualidade

- **agora (topo, P0):** *criador de pedidos — funcional* — fechar o bug do botão
  "Criar pedido" (`?contato=` lido no servidor, cliente preenchido), com teste; e
  a auditoria funcional (validação, crédito, permissão, offline) no mesmo PR ou em
  PRs pequenos. **Dono dos arquivos `_editor/_cliente/_itens` nesta rodada.**
  Aceite: bug reproduzido e corrigido com prova; riscos nomeados.
- **próximo:** *testes de regressão do fluxo* — criar, editar item, salvar,
  retomar; offline sem perder texto. Aceite: testes dirigidos verdes.
- **depois:** *benchmark D* — tempo/cliques do fluxo contra o estado anterior.
  Aceite: números com método.

> #606/#601 (jornada no CI) seguem em revisão; ao entrarem, não competem com esta
> fatia.

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
