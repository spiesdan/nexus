# Ficha 5.4 — Inbox, atendimento e campanhas

> **Régua:** `docs/auditoria/PROMPT-MESTRE-AAA.md` §5 (todos os módulos), com o
> recorte de estado/UX do Agente D. **Regra de negócio não é inventada aqui:** o
> que está escrito como "regra observada" é o que o código faz, com
> `arquivo:linha`. O que é decisão de produto fica marcado como **pendente**.
>
> Medido em 18/11/2026 contra `8e65b527` + as correções desta ficha. Nada foi
> deployado.

## 1. Propósito

O módulo é o **dia de trabalho do atendente**: ler e responder conversas de
WhatsApp (Inbox), decidir quem atende o quê (Radar), cobrar o próximo passo
(Follow-ups), marcar o compromisso (Agenda), responder com texto pronto
(Respostas rápidas) e falar com a base por região (Campanhas/Prospecção).

Quem usa: `agent` (atende), `manager` (distribui e configura), `admin` (política
da organização). Permissão lida no registro de navegação e nos guards de rota —
a ficha não reimplementa RBAC.

## 2. Rotas e telas

| Rota | Tela | Papel mínimo (registro) |
| --- | --- | --- |
| `/app/inbox` · `/app/inbox?id=<conv>` · `/app/inbox/[id]` | lista + thread + painel de CRM | agent |
| `/app/radar` | fila/atribuição e supervisão | manager |
| `/app/ai/followups` · `/app/ai/followups/[id]` | fila de follow-ups e dossiê | agent (fila) / manager (dossiê) |
| `/app/agenda` | grade de compromissos | agent |
| `/app/templates` | respostas rápidas | agent |
| `/app/campanhas` (`?aba=campanhas\|prospeccao\|empresas\|mercado\|config`) | campanha por região + prospecção B2B | agent (buscar) / manager (gerenciar) |
| `/app/prospeccao` | **redirect** para `/app/campanhas?aba=…` (link salvo sobrevive) | — |

Peças do Inbox: `components/inbox/` (InboxLayout, ConversationList/Item,
ChatThread, Composer, InboxFilters, CRMSidePanel, ReassignDialog,
InboxKeyboardShortcuts, RetentionNotice, JanelaFechadaAviso, JanelaSelo,
SecoesComerciais, NoteCard…).

## 3. Estados — o que existe, onde, e o que faltava

| Estado | Inbox | Campanhas |
| --- | --- | --- |
| **carregando** | `app/app/inbox/loading.tsx` (esqueleto de duas colunas) + `NexusTableSkeleton` na lista (`ConversationList.tsx:119`) e na thread (`ChatThread.tsx:326`) | servidor entrega `buscasIniciais`; a subtela de prospecção carrega sob demanda |
| **erro** | lista: `NexusErrorState` com **retry** (`ConversationList.tsx:129`); thread: mensagem + botão "Tentar novamente" (`ChatThread.tsx:336`) | cada busca mostra `ultimo_erro` e status |
| **vazio** | **dois** vazios distintos: sem conversa × filtro sem resultado (`ConversationList.tsx:146`) — o segundo manda ajustar o filtro | vazio por aba (pesquisas/empresas) |
| **permissão** | a rota exige sessão+org (`page.tsx`); sem org ativa mostra explicação em vez de tela branca | `podeOperar`/`podeGerenciar` desabilitam ação, não a tela |
| **retry** | sim, nos dois lados (lista e thread) | nova busca substitui a anterior |
| **offline** | **faltava** nas duas paginas — ver §6 | prospecção já trata a pausa da query |

Estados que **não** existem por decisão: o Inbox não tem "sem conexão" na
abertura da tela porque a lista vem do cache do TanStack Query e continua
legível; o que faltava era a *ação* (carregar mais) parecer viva sem rede.

## 4. Regras de negócio observadas (não inventadas)

1. **A janela de atendimento barra a RESPOSTA, não a nota interna**
   (`Composer.tsx:105-110`): nota não chega ao cliente, então a política não a
   alcança. Barrar a nota tiraria do atendente o único lugar onde ele registra
   por que a conversa esfriou.
2. **O texto do composer é limpo antes do resultado** e restaurado no erro
   (`Composer.tsx:119-152`) — para permitir digitar a próxima mensagem sem
   esperar a API.
3. **A lista diferencia "caixa vazia" de "filtro sem resultado"**
   (`ConversationList.tsx:146-160`): a primeira fala de mensagens futuras, a
   segunda manda ajustar o filtro.
4. **A thread pagina para trás** (`ChatThread.tsx:399`) com sentinela de
   rolagem + botão como caminho alternativo (teclado/navegador sem
   IntersectionObserver).
5. **Campanhas**: a tela é uma porta só com subtelas; `/app/prospeccao`
   redireciona preservando `?aba=` (`app/app/prospeccao/page.tsx`).

## 5. Riscos

| Risco | Por que importa | Situação |
| --- | --- | --- |
| Envio offline perder o texto | o atendente perde um parágrafo inteiro sem aviso; e a mensagem sairia sozinha quando a rede voltasse | **corrigido nesta ficha** |
| "Carregar mais" mudo offline | botão que não faz nada é lido como "não há mais" | **corrigido nesta ficha** (lista e thread) |
| Janela fechada confundida com falha | o aviso existe (`JanelaFechadaAviso`), mas depende do cálculo de janela vir do servidor | observado, sem ação |
| Follow-ups: fila vs dossiê têm papéis diferentes | `agent` vê a fila e não o dossiê; link direto cai em `/403` | coberto por RBAC (não tocado) |
| Campanhas: custo por busca | a tela mostra `custo_estimado_cents`; disparo é ação de manager | observado, sem ação (regra financeira — fora do escopo) |

## 6. O que foi corrigido nesta ficha (com prova)

### 6.1 Envio offline apagava o texto — `components/inbox/Composer.tsx`

O TanStack Query **pausa mutations** sem rede (modo `online`, o padrão): não há
erro nem sucesso, e o `onError` que restaura o texto nunca dispara. Como o campo
é limpo antes, o parágrafo desaparecia — e a mensagem sairia sozinha quando a
rede voltasse.

Correção: guarda `navigator.onLine === false` **antes** de limpar o campo, com
aviso (`nexusToast.warning`) e o texto preservado. Wi-Fi sem internet
(`onLine: true`) segue o caminho normal: a API falha e o `onError` restaura.

Prova: `tests/unit/composer-offline-nao-perde-texto.test.tsx` (2 casos). O
primeiro falha se a guarda sair — **verificado por sabotagem** (removendo o
bloco, o envio é chamado e o teste reprova).

### 6.2 "Carregar mais" mudo offline — `ConversationList.tsx` e `ChatThread.tsx`

As duas paginas do Inbox não tinham o ramo de pausa que as outras listas do
produto já tinham desde a V-42 (contatos, audit, fila de follow-ups). Sem ele, o
botão continua escrito "Carregar mais" e o clique não dispara requisição.

Correção: `q.isPaused ? <AvisoSemConexao /> : <Button …>`, o mesmo componente e
o mesmo texto das outras telas.

Prova: o componente é único e já é coberto por `AvisoSemConexao`; a mudança é de
ramo, e o `typecheck`/`lint` cobrem o resto. **Não medido em navegador nesta
ficha** — a captura exigiria sessão + `next dev` e o comportamento offline do
TanStack é o mesmo já verificado na V-42 para as outras listas.

## 7. O que não foi tocado, e por quê

- **Regra fiscal/financeira**: nada. O Inbox mostra pedido na ficha do contato,
  mas a ficha não altera emissão, preço ou comissão.
- **RBAC**: os guards de rota e o registro de navegação continuam a fonte.
- **Tokens/design global**: nenhum token novo; os avisos usam os componentes
  canônicos (`AvisoSemConexao`, `NexusErrorState`, `nexusToast`).
- **Campanhas**: os estados existentes foram lidos e registrados; não havia
  defeito de estado a corrigir sem entrar em regra de disparo/custo (fronteira
  do meu escopo).

## 8. Pendências que exigem decisão

1. **Envio offline com fila no Inbox web — DECIDIDO: não nesta fase.**
   O composer **bloqueia** o envio sem rede e **preserva o texto** (§6.1); não
   há outbox de mensagens no web. Por quê, com o que está medido:
   - a rota de envio (`app/api/v1/messages/route.ts`) **não lê
     `Idempotency-Key`** — reenviar em retry pode duplicar a mensagem, e o único
     outbox que existe hoje (`lib/entregas/outbox`) é de **desfecho de entrega**
     (um por pedido, idempotente por natureza), não de sequência de mensagens;
   - mensagem não é o caso de "reenviar até dar certo": ordem, `reply_to` e
     janela de atendimento entram na conta, e um envio tardio pode chegar fora
     de contexto;
   - a alternativa barata — bloquear e avisar — está entregue e testada
     (`composer-offline-nao-perde-texto`).
   Revisitar exige, nesta ordem: idempotência na rota de envio, dedupe no
   cliente e política de expiração da fila. Enquanto isso, **não** prometemos
   entrega offline no web.
2. **"Sem conexão" na abertura do Inbox**: a lista vem do cache e continua
   legível, mas o produto não diz que está mostrando cache. Um selo discreto
   ("mostrando o que já carregou") é decisão de produto.
3. **Radar/Agenda/Follow-ups** entram nas fichas 5.6/5.8 (próximas), com a mesma
   régua.
