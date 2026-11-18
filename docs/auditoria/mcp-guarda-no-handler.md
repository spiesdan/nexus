# MCP — a guarda de organização mora NO handler

> Medido em 18/11/2026 por execução, em Postgres descartável com o `baseline.sql`
> aplicado. Evidência bruta: [`evidencias/mcp/guarda-no-handler-2026-11-18.txt`](evidencias/mcp/guarda-no-handler-2026-11-18.txt).
> Nenhum banco remoto/VPS foi tocado.

## 1. O problema que este gate fecha

O servidor MCP injeta `createAdminClient()` — service role, que **bypassa RLS**
(`lib/mcp/server.ts`). As mesmas funções de handler são chamadas por dois
caminhos com garantias opostas:

- pela **rota HTTP**, com client de sessão — a RLS protege sozinha;
- pelas **ferramentas do agente**, com service role — só o filtro escrito no
  handler protege.

As catracas estáticas existentes respondem duas perguntas: *"o arquivo menciona a
organização?"* e *"o arquivo tem porta de entrada?"*. Nenhuma responde a
pergunta certa para o service role: **o handler comparou a organização DO
RECURSO com a do CHAMADOR?** Foi essa distância que deixou passar o envio
cross-tenant de `sendMessageHandler` (corrigido em `messages/_handler.ts`).

## 2. O que passou a existir

`tests/invariants/mcp-nao-alcanca-outro-tenant.test.ts` cresceu de **4 handlers
de lead** para **todos os módulos que o MCP chama**, com dois tenants de verdade
e o client de service role (`pgComoSupabase`, sem RLS — é assim que o MCP vê o
banco):

| Módulo | Handler | Prova |
|---|---|---|
| leads | `getLeadHandler` | 404 |
| | `listLeadsHandler` | lista de A não contém o lead de B; tem o de A |
| | `updateLeadHandler` | estado: título de B intacto |
| | `moveLeadHandler` | estado: etapa de B intacta |
| contatos | `getContactHandler` | 404 cross; o da própria org volta |
| | `patchContactHandler` | estado: nome de B intacto; o de A é editado |
| mensagens | `listMessagesHandler` | conversa de B devolve `[]`; a de A devolve a mensagem |
| pipelines | `listPipelinesHandler` | funil de B fora; funil de A dentro |
| agenda | `alterarAgendamentoHandler` | estado: nota de B intacta; a de A muda |
| | `cancelarAgendamentoHandler` | estado: status de B intacto |

Cada caso cross-org tem um **controle positivo** ao lado — sem ele, "não
alcançou" seria indistinguível de "a função não funciona".

## 3. O buraco que o teste achou

`patchContactHandler` buscava o contato por id **sem filtro de organização** e
só checava `!existing` e `is_anonymized`; o `UPDATE` também não filtrava. Com o
client de sessão a RLS escondia a linha; com service role, o contato de outra
organização era buscado e **reescrito**.

Prova antes/depois, com o teste novo:

```
× NÃO é editável por `patchContactHandler` — o nome de B continua o mesmo
  AssertionError: o agente de A reescreveu o contato de B:
  expected 'INVADIDO' to be 'Contato b'
```

Correção: `organization_id` entra no **SELECT** e no **UPDATE** — o mesmo par
que `updateLeadHandler` já usava, com a mesma razão escrita lá: entre ler e
escrever há uma janela, e defesa que depende da leitura anterior some quando
alguém reordena o código.

## 4. O instrumento também foi medido

O adaptador `tests/pg-como-supabase.ts` estoura em método não implementado — e
estourou em `.in`, usado por `withConversas` (que `getContactHandler` chama).
Implementado como `in ($n, $n+1, …)` (e não `= ANY($n)`, porque array JS chega
ao driver com tipo desconhecido), com caso no teste do próprio adaptador:

- `in` casa só os valores da lista;
- **lista vazia não vira "tudo"** (`in (null)`).

## 5. Limites declarados

- `sendMessageHandler` **não** é exercitado aqui: o caminho toca o adapter de
  canal e o select da conversa tem relações embutidas, que o adaptador de `pg`
  não reproduz. A prova dele é unitária
  (`tests/unit/messages-envio-nao-atravessa-org.test.ts`), com par cross/positivo.
- `getConversationHandler` idem (select com relações embutidas). O filtro está no
  código e é coberto pelos testes de rota de conversas.
- O papel é `ai_agent` (o ator do MCP); gates de papel `viewer`/`manager` são dos
  arquivos `gov-*` e dos testes de rota.
- Isto mede o **handler**; não mede a tool do MCP que o chama. Uma tool que
  passasse o recurso errado por engano continua sendo defeito da tool — mas o
  handler agora recusa.

## 6. Reproduzir

```bash
pnpm test:db -- tests/invariants/mcp-nao-alcanca-outro-tenant.test.ts
pnpm test:db -- tests/invariants/pg-como-supabase.test.ts
```
