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

- **agora:** *axe nas telas que a régua não cobre* — rodar `axe-telas-principais`
  nas telas de operação ainda fora do recorte (começar por **estoque, compras,
  expedição/romaneio, faturamento e sentinel**), sem violação crítica WCAG 2.2
  AA; o que aparecer vira correção no mesmo PR ou item de fila com dono.
  Aceite: cada tela com resultado registrado (violações = 0 ou exceção escrita) e
  o recorte do instrumento atualizado.
- **próximo:** *ordenação anunciada nas tabelas* — onde há coluna ordenável sem
  `aria-sort`, o cabeçalho passa a declarar a direção e a mudança é anunciada;
  sem mudar a ordem por padrão. Aceite: `aria-sort` nos cabeçalhos ordenáveis das
  listas de pedidos, produtos e notas + teste de componente.
- **depois:** *estados das subtelas de expedição (ficha 5.6b)* — vazio,
  carregando, erro, permissão e retry em carga, rota e romaneio, com evidência de
  captura; nenhuma regra de negócio tocada. Aceite: cada subtela com os estados
  provados e a ficha 5.6b marcada.

> Histórico: os três itens anteriores (outbox do inbox web, paginação de pedidos e
> ficha 5.6b) fecharam no **#581** — fila reposta pelo coordenador, como manda a
> regra.

## F — mobile/jornadas/qualidade

- **agora:** *J6/J13/J14 na camada de navegador* — E2E de navegador para inbox,
  fiscal e LGPD, com sucesso, erro e recuperação; fiscal em homologação, nunca
  SEFAZ real. Aceite: as três jornadas com prova visual e log; nenhuma marcada
  "instável" sem causa.
- **próximo:** *Matriz das 3 specs fora do CI* — veredito por spec
  (`vps-fresh-onboarding`, `inbox-tempo-real`, `mobile-offline`): entra no CI,
  continua fora com dono e data, ou morre. Aceite: tabela publicada em
  `docs/auditoria/` + `FORA_DO_CI` coerente com ela.
- **depois:** *Regressão local da 1.58.0* — smoke + critical no commit da tag,
  com o log anexado. Aceite: ambos verdes e o log citado na fila; falha
  classifica causa (produto × instrumento).

## G — Sentinel

- **agora:** *Painel de rejeição por fornecedor* (lacuna do v1.4) — tela
  read-only que agrupa ocorrências de `fiscal.rejeicao_repetida` por CNPJ do
  emitente e por cStat, com contagem e link para a nota. Aceite: nenhuma escrita;
  dado escopado por organização; teste de componente com dois tenants.
- **próximo:** *Proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis (sem dinheiro/fisco), cada um com risco, CAS de reversão e
  rollback; **não executar**. Aceite: documento aprovado pelo dono antes de
  qualquer código.
- **depois:** *Retenção/LGPD do Sentinel provada* — teste de que a retenção só
  alcança ocorrências terminais e que a purga é idempotente. Aceite:
  `test:db` com dois casos (terminal apaga, aberta não) e reexecução sem efeito.

## Coordenação (fora dos 3 slots)

- Fechar **#580** (este quadro) e verificar a 1.58.0 pós-deploy: `to_regclass`
  das quatro tabelas, funções da correção e rotação de imagens.
- Quando o deploy do dono terminar: disparar o **`--dry-run`** do catálogo do
  Mercos e levar o relatório (criados/atualizados/divergentes/sem_codigo) para
  aprovação — nada é aplicado sem ela.
