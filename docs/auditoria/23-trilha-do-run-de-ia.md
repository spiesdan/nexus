# P0-4 — a trilha do run de IA: auditar sem copiar a conversa

> Medido em 17/11/2026 no checkout `nexus/main`. Fecha a lacuna que a Fase 5.9
> registrava como "run trace" — **sem** violar o invariante de PII: conteúdo de
> mensagem não entra em tabela de telemetria.

## 1. O que estava faltando, medido

| Peça | Antes | Consequência |
|---|---|---|
| `llm_calls` | tokens, custo, modelo, latência, erro | explicava **quanto**, não **o quê** |
| contexto enviado (system + histórico + entrada) | descartado depois da chamada | impossível correlacionar o turno com a conversa |
| saída do modelo | usada para enviar e descartada | a resposta que o cliente recebeu não era auditável |
| ferramentas/fontes | só o custo | "de onde ele tirou isso?" sem resposta |
| `ai_agent_runs` | **0 linhas em produção** | o motor (`lib/agent-engine`) não escreve nela; a rota de execuções lê `llm_calls` |

## 2. A restrição que decidiu o desenho

O repo tem um invariante explícito — `tests/unit/llm-calls-registra-falha.test.ts`,
"o conteúdo da conversa não vai junto": **conteúdo de mensagem é PII e não entra
em log/telemetria**. A primeira versão desta trilha gravava prompt e saída crus
e foi **reprovada pelo gate** — com razão: log é o lugar de onde PII vaza em
auditoria de acesso e sobrevive à anonimização.

A trilha final mantém o que permite **auditar** sem copiar o dado.

## 3. O que é gravado (0312, nullable)

| Coluna | Conteúdo | Por que serve |
|---|---|---|
| `prompt_system_hash` | sha256 do system efetivo | prova **qual política** foi usada (o playbook é versionado) sem copiá-la |
| `prompt_messages_meta` | `{total, papeis:[{role,chars}], sha256}` | o **contexto em forma verificável**: quantas mensagens, de que papéis, com que tamanho |
| `output_text_hash` | sha256 da saída | correlaciona a resposta sem guardá-la |
| `output_chars` | tamanho da saída | distingue resposta vazia de truncada |
| `tool_calls` | `[{tool, input_hash, output_hash, output_chars}]` | **quais fontes** foram consultadas e o tamanho do retorno |
| `sources_meta` | `{total, hosts:[…]}` | citações do provedor sem título nem URL completa |

**Correlação sem cópia:** o hash do contexto casa com a linha de `messages` do
mesmo turno; quem tem direito de ler a conversa confere ali, sob a retenção e a
cascata de anonimização daquela tabela. A telemetria sozinha não devolve PII.

## 4. Escrita (o seam único)

Toda chamada de LLM passa por `lib/agent-engine/edge/llm/run-model-call.ts`. A
montagem vive em `trilha.ts` (funções puras, testadas) e é gravada no **mesmo
INSERT** que já registrava tokens/custo.

No **erro**, grava os hashes do system e do contexto (é o que se precisa
inspecionar: prompt grande demais, histórico corrompido) e deixa
`output_text_hash` nulo — a resposta não existiu.

## 5. Leitura

`GET /api/v1/ai/runs/:id` (manager+) devolve a trilha e `tem_trilha` (`false`
para linha anterior à 0312). Rota separada da lista: a lista de 100 execuções
não precisa baixar a trilha de cada uma.

## 6. LGPD

A trilha não copia texto, mas os hashes ainda correlacionam. A cascata de
anonimização zera as seis colunas das chamadas do contato — o hash sozinho não é
dado pessoal, mas o vínculo com a conversa é, e some junto.

## 7. O que foi medido

| Medida | Resultado |
|---|---|
| Migration 0312 aplica em banco com o baseline | exit 0; 6 colunas; re-aplicar idempotente |
| `llm-calls-registra-falha.test.ts` (invariante de PII) | **15/15 verde** (o caso do CPF passa a valer também para a trilha) |
| `trilha.test.ts` | 9 casos: meta sem conteúdo, hash muda com o conteúdo, ferramentas/fontes sem trecho, saída vazia → null |
| `app/api/v1/ai/runs/[id]/route.test.ts` | 5 casos; 200/404/400/403 e resposta sem texto de conversa |
| `lgpd-redact-avatar.test.ts` | 9 casos; zera as 6 colunas depois da RPC |
| `pnpm typecheck` | limpo |

## 8. O que NÃO foi feito (declarado)

- **UI**: a trilha está legível por API, não há drawer na tela de execuções —
  próxima fatia de 5.9, com prova visual;
- **leitura do texto a partir do id**: a correlação é por hash; a rota que junta
  `llm_calls` + `messages` para exibir a conversa é decisão de produto (e de
  permissão) e não foi feita;
- **`ai_agent_runs` continua sem escritor de produção** — não foi "consertada"
  para não duplicar a fonte; unificar as duas tabelas é decisão de arquitetura;
- **retenção própria**: as colunas herdam a de `llm_calls`; texto de conversa
  não é duplicado, então a política de `messages` continua sendo a única.
