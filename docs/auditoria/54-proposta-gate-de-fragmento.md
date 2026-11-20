# 54 — Proposta: gate que exige fragmento por PR

> **Proposta — não implementada.** Decisão do dono. Nasceu da 1.61.2: quatro PRs
> entraram sem `.changes/` e a versão sairia sem mencionar rotas (a prioridade do
> dono) nem o estoque atômico.

## Problema medido

| PR | Fragmento? |
|---|---|
| #698 rotas (banner + diferença pós-publicação) | **não** |
| #687 reprecificação | **não** |
| #691 estoque atômico (flag desligada) | **não** |
| #701 harness E2E | **não** |
| #700 motor visível | sim |

Quem administra a VPS decide atualizar lendo o CHANGELOG. PR sem fragmento é
mudança invisível para ele.

## Opções

| Opção | Como funciona | Custo |
|---|---|---|
| **(a) exigir por CI** | job compara os arquivos do PR com `main`: mudou código de app/lib/worker/kit e não adicionou `.changes/*.md` → reprova | médio: exceções legítimas precisam de escape (docs, testes puros, refactor sem comportamento) |
| **(b) rótulo `sem-changelog`** | PR sem fragmento só passa com o rótulo e o motivo no corpo | baixo: depende de disciplina, mas deixa rastro |
| **(c) (a) + (b)** | gate exige fragmento **ou** rótulo com motivo; o rótulo é auditável | o melhor dos dois; um pouco mais de CI |

## Recomendação

**(c)**: a catraca impede o esquecimento e o rótulo cobre o caso legítimo, com o
motivo escrito no PR. Escopo do gate: `app/`, `lib/`, `workers/`, `fiscal/`,
`hostgator-setup-kit/` — **não** docs/testes.

**Não implementar sem o dono.** Quando aprovado, entra com teste do próprio gate
(PR sem fragmento reprova; PR com rótulo passa).
