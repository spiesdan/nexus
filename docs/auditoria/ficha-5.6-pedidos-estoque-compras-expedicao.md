# Ficha 5.6 — Pedidos, estoque, compras e expedição

> **Régua:** `docs/auditoria/PROMPT-MESTRE-AAA.md` §5. Recorte de **estado/UX**
> do Agente D. Regra de negócio **não é inventada**: o que aparece como "regra
> observada" é o que o código faz, com `arquivo:linha`. Fiscal e financeiro
> **não foram tocados**.
>
> Medido em 18/11/2026 contra `aa4020a3` + as correções desta ficha.

## 1. Propósito

É a **cadeia do pedido até a entrega**: a lista de pedidos e o detalhe (itens,
timeline, impressão), o estoque (saldo e razão de movimentos), as compras
(pedido a fornecedor e recebimento) e a expedição (cargas, roteirização, modo
motorista e fechamento). Quem usa: `agent` (operação), `manager` (aprovação e
configuração), entregador (modo motorista, login próprio).

## 2. Rotas e telas

| Rota | Tela | Observação |
| --- | --- | --- |
| `/app/pedidos` | lista por dia, filtros de período/status/vendedor | server-rendered, `limit(200)` |
| `/app/pedidos/[id]` | detalhe: itens, timeline, status, edição de itens | `_detalhe.tsx` |
| `/app/pedidos/novo` | editor de pedido (cliente, itens, autosave) | `_editor.tsx`, `_autosave.ts` |
| `/app/pedidos/imprimir` | lote de impressão (50 por carga) | `_imprimir.tsx` |
| `/app/estoque` | saldo, movimentos e sugestões de reposição | 3 tabelas (`NexusDataTable`) |
| `/app/compras` · `/app/compras/[id]` | pedidos a fornecedor e recebimento | `podeEscrever` por papel |
| `/app/expedicao` · `/app/expedicao/nova` | cargas e montagem | `_client.tsx` |
| `/app/expedicao/[id]` (+ `/motorista`, `/fechamento`, `/rota`) | detalhe, cabine do motorista, fechamento, roteirizador | `_motorista.tsx` tem fila offline |

## 3. Estados — o que existe, onde, e o que faltava

| Estado | Pedidos | Estoque/Compras | Expedição |
| --- | --- | --- | --- |
| **carregando** | `loading.tsx` do segmento + skeleton | `NexusDataTable state="loading"` | skeleton na montagem |
| **erro + retry** | `error.tsx` do segmento (`SegmentError`, com `reset`) e `erroInicial` na lista (`page.tsx:257`) | `NexusErrorState` **com `onRetry`** nas 5 tabelas (`estoque:289/455/582`, `compras:273/409`) | estados por seção |
| **vazio** | explicação própria (F-28) | `NexusEmptyState` com ação de criar movimento/pedido | `NexusEmptyState` por aba |
| **permissão** | RBAC na rota; ação escondida por papel | `podeEscrever` (agent+) desabilita escrita, não a tela | idem |
| **offline** | detecção de rede na lista (F-28) | **faltava a mensagem** — ver §6 | fila offline do motorista (`lib/entregas/outbox`) com retomada |
| **retry** | sim (segmento) | sim (5 tabelas) | sim |

## 4. Regras de negócio observadas (não inventadas)

1. **A lista de pedidos é ordenada pelo número**, do maior para o menor; o filtro
   de período usa `created_at` (`app/app/pedidos/page.tsx:92-97`). O número é
   único por organização — não precisa de desempate.
2. **O nome do cliente exibido vem do contato vinculado**, não do snapshot do
   pedido; o histórico não é reescrito (`page.tsx:107-118`). Sem vínculo, vale o
   snapshot.
3. **Falha de leitura não vira lista vazia**: o erro é logado e a tela recebe
   `erroInicial` (`page.tsx:101-106, 257`) — o conserto do F-28.
4. **Escrita exige `agent`+** em estoque e compras (`estoque/page.tsx:23-24`,
   `compras/page.tsx:20-21`); a leitura é aberta ao papel de leitura.
5. **O motorista tem fila offline própria** (`_motorista.tsx:95,137-140`): o
   desfecho fica em `pendentesDaCarga` e é reenviado quando a internet volta; o
   que está na fila vale como desfecho até o servidor confirmar
   (`_motorista.tsx:374`).
6. **Impressão em lote é limitada a 50 pedidos por carga** e o limite é dito na
   tela (`_client.tsx:763`).

## 5. Riscos

| Risco | Por que importa | Situação |
| --- | --- | --- |
| "Failed to fetch" na tela | erro de rede aparecia em inglês; o operador não sabe se o problema é a rede ou o dado | **corrigido nesta ficha** |
| Recebimento e estoque mexem em dinheiro/quantidade | qualquer mudança aqui é fiscal/financeira | **não tocado** (fora do escopo) |
| Fila offline do motorista só existe no app | no navegador, enviar sem rede não enfileira | observado; decisão de produto |
| Lista de pedidos limitada a 200 sem paginação | pedido antigo exige filtro de período | observado; não é defeito de estado |

## 6. O que foi corrigido nesta ficha (com prova)

### 6.1 A tela mostrava `e.message` cru — `lib/ui/erros.ts` + 8 pontos

Estoque, compras e recebimento faziam `setErro(e instanceof Error ? e.message :
"Erro ao carregar …")`. Em erro de rede, `apiClient` repassa o `TypeError` do
`fetch` depois das três tentativas — e a tabela exibia **"Failed to fetch"** em
inglês, no lugar do texto que explica o que houve. É a mesma classe da V-22/V-43
(o estado afirmando uma coisa quando o problema é outro).

| Arquivo | Antes | Depois |
| --- | --- | --- |
| `app/app/estoque/_client.tsx` | `e.message` (4 pontos) | `mensagemDeErro(e, "Erro ao carregar …")` |
| `app/app/compras/_client.tsx` | `e.message` (4 pontos) | idem |

`mensagemDeErro` decide: rede/offline → frase em português; `ApiError` → o texto
do servidor; validação local (`throw new Error("Adicione ao menos um item.")`) →
a própria mensagem; resto → o padrão da tela. O toast já era tratado por
`showApiError`; o estado embutido, não.

Prova: `tests/unit/mensagem-de-erro-nao-vaza-tecnico.test.ts` (7 casos) — cobre
`Failed to fetch`, `Load failed`, `NetworkError`, navegador offline, `ApiError`,
validação local e fallback.

## 7. O que não foi tocado, e por quê

- **Fiscal/financeiro**: nada. Recebimento, preço, comissão, nota e estoque
  contábil seguem intocados.
- **RBAC**: `podeEscrever` e os guards continuam a fonte.
- **Tokens/design global**: nenhum. Os textos usam os componentes canônicos
  (`NexusErrorState`, `NexusEmptyState`, `AvisoSemConexao`).
- **Fluxo de status do pedido** e **CAS do recebimento**: são regra de negócio
  (com testes próprios) — a ficha só os observa.

## 8. Pendências que exigem decisão

1. **Fila offline no navegador** para o recebimento/pedido (hoje só o motorista
   tem outbox): decidir se o web reusa `lib/entregas/outbox` ou fica só com o
   aviso.
2. **Paginação da lista de pedidos** (limite 200 com filtro de período): é
   decisão de produto, não defeito de estado.
3. **Estados das subtelas de expedição** merecem ficha própria se o módulo
   crescer (roteirizador/fechamento já têm estados, mas não foram medidos em
   navegador nesta rodada).
