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

- **agora:** *#594 no rebase (sem redesenho) + merge* — `feat/mercos-catalogo-todos`
  está `dirty`; rebase em `nexus/main`, conflito preservando os dois lados, gates de
  migration/fragmento e merge nos 5 checks. Aceite: PR mergeado.
- **próximo:** *design aplicado em expedição (carga/rota/romaneio)* — identidade
  pelos tokens existentes, sem sistema paralelo e sem regra de negócio; captura
  antes/depois + estados. Aceite: uma subtela por PR, axe sem violação crítica.
- **depois:** *design aplicado em estoque/compras e faturamento* — mesma régua.
  Aceite: idem, com captura.

## F — mobile/jornadas/qualidade

- **agora:** *matriz de cobertura reconciliada* — `41-cobertura-reconciliada.md`
  cruzando inventário × código (`find app/app app/admin -name page.tsx`), com
  linha por rota/subtela/aba/modal/drawer, estado e exceção com dono. Aceite:
  contagem por comando × linhas da matriz, diferença explicada, checagem que não
  envelhece.
- **próximo:** *Android real* — registrar `[!]` com motivo e método de teste
  (aparelho), sem diluir em "mobile ok". Aceite: linha no quadro + passos.
- **depois:** *jornadas J1–J16 na matriz* — onde cada uma é provada (Vitest/E2E/
  manual) e o que falta. Aceite: tabela fechada.

## G — Sentinel

- **agora:** *#596 (organização suspensa) + desempenho/SLO* — fechar o PR nos 5
  checks e produzir `42-desempenho-e-slo.md` com baseline medido (bundle, latência
  p50/p95 das fontes reais, erros/retries) e SLI/SLO propostos com alvo
  justificado. Aceite: números com data e comando reproduzível.
- **próximo:** *remedição do Sentinel pós-#596* — distribuição de ocorrências por
  organização/regra, FP e dedup com número. Aceite: tabela antes/depois.
- **depois:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis, com risco/CAS/rollback; não executar. Aceite: aprovação do dono.

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
