# P0-4 — a trilha do run de IA: entrada, contexto, fontes e saída

> Medido em 17/11/2026 no checkout `nexus/main`. Fecha a lacuna que a Fase 5.9
> registrava como "run trace" e que a Fase 8 apontava como ausência de inspeção:
> "por que o agente respondeu isso?" não tinha resposta em lugar nenhum.

## 1. O que estava faltando, medido

| Peça | Antes | Consequência |
|---|---|---|
| `llm_calls` | tokens, custo, modelo, latência, erro | explicava **quanto**, não **o quê** |
| prompt enviado (system + histórico + entrada) | descartado depois da chamada | impossível reconstruir o contexto que o modelo viu |
| saída do modelo | usada para enviar e descartada | a resposta que o cliente recebeu não podia ser auditada |
| ferramentas/fontes | só o custo | "de onde ele tirou isso?" sem resposta |
| `ai_agent_runs` | **0 linhas em produção** | o motor de produção (`lib/agent-engine`) não escreve nela; a própria rota de execuções lê `llm_calls` no lugar |

O último ponto é o que impedia o conserto óbvio: guardar a trilha em
`ai_agent_runs` seria construir a tela sobre uma tabela que o motor não usa —
uma tela que promete registro e responde "nada aconteceu" a quem investiga.

## 2. O que foi feito

### 2.1 Schema (migration 0312 + baseline + MANIFEST)

`llm_calls` ganhou cinco colunas **nullable**:

| Coluna | O que é |
|---|---|
| `prompt_system` | o system **efetivo** do turno, com o prefixo estável da org (playbook + tools) já aplicado |
| `prompt_messages` | as mensagens enviadas ao modelo — **o contexto que ele viu**, não só a entrada do cliente |
| `output_text` | o texto final; `NULL` em erro/abort (a resposta não existiu) |
| `tool_calls` | `[{tool, input, output}]` com o retorno de cada ferramenta — a trilha das **fontes consultadas** |
| `sources` | citações que o provedor devolveu (`result.sources`), quando devolve |

Nullable de propósito: linha anterior à 0312 não tem trilha, e inventar `''`
seria afirmar que o modelo respondeu nada.

### 2.2 Escrita (o seam único)

Toda chamada de LLM passa por `lib/agent-engine/edge/llm/run-model-call.ts`.
A montagem da trilha vive em `trilha.ts` (funções puras, testadas) e é gravada
no **mesmo INSERT** que já registrava tokens/custo — sem transação nova, sem
caminho paralelo.

Recorte **visível**: ferramenta/fonte a 2 000 caracteres, cada mensagem a
20 000, system a 100 000, com sufixo `…`. Telemetria não derruba turno
(`recortar` nunca lança) e o corte não é silencioso.

No **erro**, a entrada é justamente o que se precisa inspecionar (prompt grande
demais, histórico corrompido, payload inválido): `registrarFalha` grava
`prompt_system`/`prompt_messages` e deixa `output_text` nulo.

### 2.3 Leitura

`GET /api/v1/ai/runs/:id` (manager+, mesma guarda da lista) devolve a trilha e
`tem_trilha` — `false` para linha anterior à 0312, para a tela explicar a
ausência em vez de desenhar painel vazio. Rota separada: prompt + mensagens
somam dezenas de KB por turno, e a lista de 100 execuções não pode baixar
megabytes para mostrar latência.

### 2.4 LGPD — a trilha é uma CÓPIA da conversa

A cascata de anonimização (`fn_lgpd_cascade_redact_contact`) anonimiza
`contacts`/`messages`, mas não conhece `llm_calls`: sem um passo novo, a pessoa
"anonimizada" continuaria no prompt e na saída, palavra por palavra. A cascata
agora zera as cinco colunas das chamadas do contato — o mesmo raciocínio do
avatar órfão, em outra forma. Falha nesse passo **não** é engolida: o texto
original não pode sobreviver à anonimização.

## 3. O que foi medido

| Medida | Resultado |
|---|---|
| Migration 0312 aplica em banco com o baseline | exit 0; 5 colunas criadas |
| Re-aplicar 0312 | idempotente (5 `already exists, skipping`) |
| `lib/agent-engine/edge/llm/trilha.test.ts` | **10 casos** verdes (recorte visível, contexto ≠ entrada, ferramenta+resultado, fonte sem chamada, vazio → null) |
| `app/api/v1/ai/runs/[id]/route.test.ts` | **5 casos** verdes (trilha completa, linha antiga `tem_trilha:false`, 404 cross-org/inexistente, 400 id, 403 viewer) |
| `tests/unit/lgpd-redact-avatar.test.ts` | **9 casos** verdes (2 novos: zera as 5 colunas; passo **depois** da RPC) |
| `pnpm typecheck` | limpo |

## 4. O que NÃO foi feito (declarado)

- **UI**: a trilha está legível por API, não há drawer na tela de execuções.
  É a próxima fatia de 5.9, com prova visual;
- **`ai_agent_runs` continua sem escritor de produção**. Não foi "consertada"
  para não duplicar a fonte: `llm_calls` é onde o motor grava, e a rota já lê de
  lá. Unificar as duas tabelas é decisão de arquitetura, não conserto de P0;
- **retenção própria da trilha**: as colunas herdam a retenção de `llm_calls`.
  Se a política mudar para texto de conversa, é decisão de produto (a janela de
  retenção atual está em `lib/retencao/politica.ts`);
- **recorte de ferramenta é por peça**, não por turno: um turno com 20
  ferramentas pode chegar a ~40 KB em `tool_calls`. Cabe na linha; não cabe
  numa resposta de lista — por isso a trilha é rota separada.
