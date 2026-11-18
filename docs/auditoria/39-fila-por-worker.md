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

- **agora:** *Outbox no inbox web* (pendência da ficha 5.4) — mensagem
  enfileirada sobrevive a reload e a queda de rede; drenar duas vezes não
  duplica; o estado (pendente/enviando/falhou/tentando) aparece na bolha.
  Aceite: teste de componente + prova de que o texto não é limpo antes do
  resultado, e nenhum envio duplicado no dreno.
- **próximo:** *Pedidos — paginação com teto declarado* (ficha 5.6) — lista
  pagina com ordem determinística (`numero` desc) e diz "mostrando X de Y"; sem
  esconder pedido antigo. Aceite: teste de rota (cursor/limite) + componente com
  o aviso, sem contar amostra como total.
- **depois:** *Expedição — subtelas com estados* (ficha 5.6) — ficha das
  subtelas (carga, rota, romaneio) com vazio/carregando/erro/permissão/retry e
  evidência de captura. Aceite: cada subtela com o estado provado; sem tocar
  regra de negócio.

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
