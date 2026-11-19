# Ficha 5.6b — Subtelas de expedição (motorista, fechamento, rota)

> **Régua:** `PROMPT-MESTRE-AAA.md` §5, recorte de estado/UX.
> Complementa a [`ficha 5.6`](ficha-5.6-pedidos-estoque-compras-expedicao.md),
> que cobriu a lista de cargas. Aqui são as **três subtelas profundas**.
> Nada de regra fiscal/financeira foi tocado; esta ficha **não alterou código** —
> mediu e registrou.

## 1. Propósito e rotas

As três rotas montam o mesmo componente com `secao` diferente
(`app/app/expedicao/[id]/{rota,fechamento,motorista}/page.tsx`, cada uma
`<CargaClient … secao="…" />`). O contexto (carga, permissões, 404) vem de
`_contexto.ts`, que verifica sessão, organização e papel **antes** de renderizar:

| Rota | Tela | Permissão observada |
| --- | --- | --- |
| `/app/expedicao/[id]/rota` | roteirizador: ordem das paradas, capacidade, mapa | `agent`+ (`_contexto.ts:22`) |
| `/app/expedicao/[id]/fechamento` | fechamento: resumo financeiro **lido**, cobrança por parada | `manager`+ (`_contexto.ts:27`) |
| `/app/expedicao/[id]/motorista` | cabine imersiva do entregador (sem casca) | `agent`+; carga inexistente → `notFound()` (`_contexto.ts:36`) |

Links antigos (`?aba=rota|fechamento|motorista`) continuam válidos
(`_client.tsx:148-157`).

## 2. Matriz de estados

| Estado | Motorista (`_motorista.tsx`) | Fechamento (`_fechamento.tsx`) | Rota (`_roteirizador.tsx`) |
| --- | --- | --- | --- |
| **carregando** | dados vêm do contexto; ação mostra `sincronizando` | prévia calculada no cliente a partir dos dados do servidor | esqueleto + "Carregando rota…" (`_roteirizador.tsx:456-461`) |
| **erro** | `showApiError` nas ações; desfecho fica na fila até confirmar | avisos com `nivel: "erro"` viram toast e linha em vermelho (`:207,222-223,607`) | `showApiError`; parada sem coordenada é avisada, não bloqueada (`:465-470`) |
| **vazio** | carga sem paradas: a cabine mostra o próximo destino ou o estado final | resumo zerado é um resumo, não um vazio | rota sem paradas → lista vazia com o aviso de "sem coordenada" |
| **permissão** | `podeOperar`/`podeFechar` vêm do contexto | fechamento exige `manager`+ | `agent`+ |
| **offline** | **fila própria** (`lib/entregas/outbox`): `pendentesDaCarga`, reenvio automático ao voltar (`:95,137-168,321-325`) e o que está na fila **vale como desfecho** até o servidor confirmar (`:374-376`) | formulário calcula localmente; envio usa `apiClient` (erro vira toast) | ordenação local; envio ao servidor usa `apiClient` |
| **retry** | reenvio automático + botão; `sincronizando` evita reentrada | reenvio manual pelo próprio botão | recalcular rota é a ação |

**O que merece registro:** o motorista é a única superfície do produto com
**outbox de verdade** — e ele não é chat: são desfechos de entrega
(`em_atendimento`, `entregue`, `devolvido`) com chave por pedido, o que torna o
reenvio idempotente por natureza (o pedido tem um desfecho, não uma sequência
de mensagens). É a razão pela qual esse padrão **não** se copia para o Inbox web
sem idempotência na rota de mensagens (ver ficha 5.4, §8).

## 3. Regras observadas (não inventadas)

1. O contexto de carga resolve **permissão e existência antes** de renderizar
   (`_contexto.ts:19-36`); carga de outra organização cai em `notFound()`.
2. O fechamento mostra o resumo financeiro **lido do servidor, nunca editável**
   (`_fechamento.tsx:16`); o que se digita é a cobrança por parada.
3. Avisos de fechamento têm **nível** (`erro`/`aviso`): erro bloqueia com toast,
   aviso informa (`_fechamento.tsx:207-249`).
4. Parada sem coordenada **não some** da rota: é contada e avisada
   (`_roteirizador.tsx:465-470`).
5. A fila do motorista reenvia sozinha na volta da rede e não duplica: o
   desfecho é por pedido (`_motorista.tsx:137-168`).

## 4. Riscos

| Risco | Situação |
| --- | --- |
| Fechamento mexe em dinheiro (cobrança por parada) | **não tocado** — regra financeira |
| Cabine sem estados de erro visíveis para o motorista | observado: erro de envio vira toast e o item **fica na fila** (o motorista não perde o registro) |
| Rota com muitas paradas sem coordenada | avisado; decisão de cadastro, não de tela |
| Offline no fechamento (diferente do motorista) | não há outbox: erro de envio é toast — mesmo tratamento do resto do app; decisão registrada abaixo |

## 5. O que não foi corrigido, e por quê

- **Nada foi alterado nesta ficha.** Os três estados que a operação sente
  (carregando, erro de envio e offline) já têm tratamento: esqueleto, toast com
  a mensagem do servidor e — no motorista — fila com reenvio.
- O que **faltaria** para "fechamento offline" é outbox com idempotência na rota
  de fechamento; é a mesma decisão pendente do Inbox web (ficha 5.4 §8), e
  mexer nela agora seria regra financeira, fora do escopo.

## 6. Pendências

1. **Fechamento offline**: decidir junto com a fila do Inbox (uma decisão sobre
   outbox no web, não duas).
2. **Erro de envio na cabine**: hoje é toast; um selo persistente "1 desfecho na
   fila" já existe pelo contador da fila — medir em aparelho real fica para a
   frente mobile.
