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

- **agora (despachado pelo dono, passa na frente):** *Mercos "todos os
  produtos"* — rodar o coletor em modo `--todos`, **medir ativos × inativos** e
  provar que importar inativo **não desativa ativo** no banco (o upsert não pode
  rebaixar `ativo=true` para `false` por causa de uma linha inativa). Trazer o
  número "**traz X dos 69**" códigos que faltam para os 616 itens **antes de
  qualquer escrita**. Aceite: medição + teste do upsert + número apresentado.
- **próximo:** *estados das subtelas de expedição (ficha 5.6b)* — vazio,
  carregando, erro, permissão e retry em carga, rota e romaneio, com captura.
  Aceite: cada subtela com os estados provados e a ficha 5.6b marcada.
- **depois:** *consistência de formulários de cadastro* — contatos e produtos com
  erro por campo, `aria-describedby` e foco no primeiro inválido. Aceite: teste
  de componente em cada formulário e axe sem violação crítica.

> Histórico: outbox, paginação de pedidos, ficha 5.6b, axe fora do recorte
> (14 rotas) e aria-sort fecharam no #581/#583.

## F — mobile/jornadas/qualidade

- **agora (bug do dono, passa na frente):** *filtro de cidade em Clientes* — a
  lista traz `AGROCOMERCIAL SCHULTZ LTDA ME` para uma cidade que não é a dele, e
  a **mesma cidade aparece em 3 grafias** (caixa/acento/espaço). Corrigir a
  comparação no servidor e a lista distinta (dedupe por `lower(trim())`, casing
  da primeira ocorrência, ordem pt-BR). Aceite: teste de API com acento/caixa,
  cross-tenant zero e render com cidade escolhida.
- **próximo:** *#586 — `verify` por spec sem declaração* — a spec nova não está
  em `SPECS_PARTE_*`/`JORNADAS`; declarar no lugar certo e provar que o gate
  reconhece. Aceite: `verify` verde sem afrouxar o gate.
- **depois:** *matriz das 3 specs fora do CI* — veredito por spec (entra /
  continua fora com dono e data / morre). Aceite: tabela publicada e
  `FORA_DO_CI` coerente.

> A camada de navegador de J6/J13/J14 fica na sequência depois da matriz; nada
> foi perdido, só reordenado.

## G — Sentinel

- **agora:** *#582 (rebase) — claim de conversa parada* — liberar o claim sem
  perder histórico, com motivo e auditoria; reexecução não duplica. Aceite: teste
  de rota + invariante de claim e PR verde.
- **próximo:** *retenção/LGPD provada* — retenção só alcança ocorrências
  terminais e a purga é idempotente. Aceite: `test:db` com dois casos (terminal
  apaga, aberta não) e reexecução sem efeito.
- **depois:** *proposta do 2º caso de correção aprovada* — três candidatos
  reversíveis (sem dinheiro/fisco), com risco, CAS de reversão e rollback; não
  executar. Aceite: documento aprovado pelo dono antes de código.

## Coordenação (fora dos 3 slots)

- Fechar **#580** (este quadro) e verificar a 1.58.0 pós-deploy: `to_regclass`
  das quatro tabelas, funções da correção e rotação de imagens.
- Quando o deploy do dono terminar: disparar o **`--dry-run`** do catálogo do
  Mercos e levar o relatório (criados/atualizados/divergentes/sem_codigo) para
  aprovação — nada é aplicado sem ela.
