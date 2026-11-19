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

- **agora:** *estados das subtelas de expedição (ficha 5.6b)* — vazio, carregando,
  erro, permissão e retry em carga, rota e romaneio, com captura; nenhuma regra
  de negócio tocada. Aceite: cada subtela com os estados provados e a ficha 5.6b
  marcada.
- **próximo:** *consistência de formulários de cadastro* — contatos e produtos
  com erro por campo, `aria-describedby` ligando mensagem ao input e foco no
  primeiro campo inválido. Aceite: teste de componente em cada formulário e axe
  sem violação crítica.
- **depois:** *densidade e tabelas das listas restantes* — estoque, compras e
  faturamento com o mesmo cabeçalho/ordenação anunciada e estados de recorte.
  Aceite: captura comparando as três listas e teste de `aria-sort`.

## F — mobile/jornadas/qualidade

- **agora:** *fechar #586 e anexar a prova da regressão* — smoke 32/32 e critical
  75/75 já medidos; os 2 defeitos reais corrigidos precisam de causa escrita e
  link no quadro. Aceite: log da rodada citado e defeito com dono ou conserto.
- **próximo:** *J6/J13/J14 na camada de navegador* — sucesso, erro e recuperação;
  fiscal em homologação, nunca SEFAZ real. Aceite: três jornadas com prova visual
  e log; nada marcado "instável" sem causa.
- **depois:** *matriz das 3 specs fora do CI* — veredito por spec (entra /
  continua fora com dono e data / morre). Aceite: tabela publicada e
  `FORA_DO_CI` coerente com ela.

## G — Sentinel

- **agora:** *fechar #582 (claim de conversa parada)* — liberar o claim sem
  perder histórico, com motivo e auditoria; reexecução não duplica. Aceite: teste
  de rota + invariante de claim e PR verde.
- **próximo:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis (sem dinheiro/fisco), cada um com risco, CAS de reversão e
  rollback; **não executar**. Aceite: documento aprovado pelo dono antes de
  qualquer código.
- **depois:** *retenção/LGPD do Sentinel provada* — retenção só alcança
  ocorrências terminais e a purga é idempotente. Aceite: `test:db` com dois casos
  (terminal apaga, aberta não) e reexecução sem efeito.

## Coordenação (fora dos 3 slots)

- Fechar **#580** (este quadro) e verificar a 1.58.0 pós-deploy: `to_regclass`
  das quatro tabelas, funções da correção e rotação de imagens.
- Quando o deploy do dono terminar: disparar o **`--dry-run`** do catálogo do
  Mercos e levar o relatório (criados/atualizados/divergentes/sem_codigo) para
  aprovação — nada é aplicado sem ela.
