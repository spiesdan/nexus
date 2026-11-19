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

- **agora:** *#594 no rebase e merge* — `feat/mercos-catalogo-todos` com os 14 checks
  verdes; só falta rebase em `nexus/main`. Aceite: rebase sem perder os dois lados,
  gates de migration/fragmento verdes e merge nos 5 checks.
- **próximo:** *decisão dos inativos* — o número já foi entregue ao dono
  (**22 dos 69; 194 dos 616; 55 nascem inativos; 143 não desativam**); o `--aplicar`
  depende de o coletor novo estar em produção. Aceite: decisão registrada + deploy.
- **depois:** *estados das subtelas de expedição (5.6b)* — vazio, carregando, erro,
  permissão e retry em carga, rota e romaneio, com captura. Aceite: cada subtela
  provada e ficha marcada.

## F — mobile/jornadas/qualidade

- **agora:** *jornada de navegador como gate* — a prova de J6/J13/J14 existe; falta
  declará-la no conjunto certo do CI (`critical`/`full`, nunca smoke) e provar
  estabilidade em duas execuções. Aceite: `e2e-cobertura-completa` e
  `e2e-suices-aderentes` verdes + evidência das duas rodadas (ou bloqueio de
  ambiente escrito).
- **próximo:** *J6/J13/J14 em homologação* — fluxo fiscal com nota em homologação,
  nunca SEFAZ real; erro e recuperação. Aceite: prova visual/log.
- **depois:** *regressão local da 1.58.1* — smoke + critical no commit da tag.
  Aceite: ambos verdes com log.

## G — Sentinel

- **agora:** *Sentinel ignora organização suspensa* — 20 das 23 ocorrências eram de
  `E2E Test Org`. Excluir da seleção da varredura, preservar histórico e voltar a
  incluir se reativada. Aceite: teste com ativa × suspensa e reexecução sem mudança.
- **próximo:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis (sem dinheiro/fisco), com risco, CAS e rollback; não executar.
  Aceite: documento aprovado pelo dono antes de código.
- **depois:** *painel de rejeição por fornecedor* — por CNPJ/cStat, read-only,
  escopado por organização. Aceite: teste de componente com dois tenants.

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
