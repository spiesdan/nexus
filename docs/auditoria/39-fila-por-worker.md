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

- **agora:** *#592 no rebase + verde + merge* — `fix/mercos-produtos-rota` está `dirty`
  e com `verify` vermelho; rebase em `nexus/main`, conserto do teste e merge nos 5
  checks. Aceite: PR mergeado e CI verde.
- **próximo:** *o número "traz X dos 69"* — medir com o modo `--todos` (somente
  leitura) quantos dos 69 códigos inativos faltantes o coletor enxerga; se não
  houver acesso, entregar o comando exato. Aceite: número ou comando, sem escrita.
- **depois:** *estados das subtelas de expedição (5.6b)* — vazio, carregando, erro,
  permissão e retry em carga, rota e romaneio, com captura. Aceite: cada subtela
  provada e ficha marcada.

## F — mobile/jornadas/qualidade

- **agora:** *#589 no verde + merge* — matriz das 3 specs fora do CI com `verify`
  vermelho; corrigir a declaração (não o gate) e mergear nos 5 checks. Aceite: PR
  mergeado e `verify` verde.
- **próximo:** *J6/J13/J14 na camada de navegador* — sucesso, erro e recuperação;
  fiscal em homologação, nunca SEFAZ real. Aceite: prova visual/log das três.
- **depois:** *regressão local da 1.58.1* — smoke + critical no commit da tag.
  Aceite: ambos verdes com log anexado.

## G — Sentinel

- **agora:** *Sentinel ignora organização suspensa* — 20 das 23 ocorrências eram
  de `E2E Test Org` (fixture suspensa). Excluir organização suspensa da seleção da
  varredura, preservando histórico e voltando a incluir se reativada. Aceite: teste
  com duas organizações (ativa varre, suspensa não) e reexecução sem mudança de
  histórico.
- **próximo:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis (sem dinheiro/fisco), com risco, CAS e rollback; não executar.
  Aceite: documento aprovado pelo dono antes de código.
- **depois:** *painel de rejeição por fornecedor* — agrupar por CNPJ/cStat,
  read-only, escopado por organização. Aceite: teste de componente com dois tenants.

## Coordenação (fora dos 3 slots)

- Fechar **#580** (este quadro) e verificar a 1.58.0 pós-deploy: `to_regclass`
  das quatro tabelas, funções da correção e rotação de imagens.
- Quando o deploy do dono terminar: disparar o **`--dry-run`** do catálogo do
  Mercos e levar o relatório (criados/atualizados/divergentes/sem_codigo) para
  aprovação — nada é aplicado sem ela.
