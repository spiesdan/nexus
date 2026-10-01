# 18-spec — Venda Automática diária por cidade + Radar

> **Fonte**: prompt do dono do produto (2026-09-30), preservado VERBATIM abaixo.
> Este arquivo é o guia de execução do módulo. Cada etapa marcada aqui foi
> implementada e validada conforme a Definição de Done do projeto.
> O bloco "DECISÕES DE IMPLEMENTAÇÃO" no fim registra as escolhas que o prompt
> deixou em aberto ("tomar as melhores decisões").

---

# IMPLEMENTAÇÃO — VENDA AUTOMÁTICA DIÁRIA POR CIDADE + RADAR

Você está trabalhando no sistema Nexus Comercial.

Implemente exclusivamente o módulo de **Venda Automática**, integrado ao **Radar** e ao **Inbox**.

O objetivo é permitir que a equipe configure uma rotina diária de prospecção comercial escolhendo:

* Cidade
* Categorias de empresas
* Quantidade diária de empresas
* Produtos/serviços que serão ofertados
* Horário/período de execução
* Responsável pela campanha

O sistema deverá encontrar empresas compatíveis com os filtros do Radar, identificar os contatos disponíveis e iniciar uma abordagem comercial pelo Inbox.

---

## 1. CONCEITO

Criar dentro do Radar uma funcionalidade chamada:

**Venda Automática**

Fluxo:

```text
RADAR
 ↓
Escolher cidade
 ↓
Escolher categorias de empresas
 ↓
Definir quantidade diária
 ↓
Definir produtos/serviços
 ↓
Sistema encontra empresas
 ↓
Filtra empresas já existentes/prospectadas
 ↓
Identifica telefone/WhatsApp disponível
 ↓
Cria/atualiza Lead
 ↓
Abre conversa no INBOX
 ↓
IA gera abordagem específica para aquela empresa
 ↓
Mensagem é enviada conforme regras da campanha
 ↓
IA acompanha a conversa
 ↓
Interessado?
 ├── SIM → oportunidade/pedido
 ├── TALVEZ → follow-up
 ├── NÃO → encerra
 └── SEM RESPOSTA → follow-up automático
```

A implementação deve aproveitar a arquitetura existente do Nexus.

**Não criar um segundo CRM.**

Radar, Leads, Customer 360, Inbox, Campanhas e Pedidos devem continuar utilizando os mesmos dados.

---

## 2. CONFIGURAÇÃO DA VENDA AUTOMÁTICA

Criar uma tela:

`/app/venda-automatica`

A tela deve permitir criar e administrar campanhas.

Exemplo:

```text
VENDA AUTOMÁTICA

Campanha
[ Prospecção Canoinhas - Restaurantes ]

Status
● Ativa

LOCALIZAÇÃO
Cidade
[ Canoinhas - SC ]

CATEGORIAS
[x] Restaurantes
[x] Lanchonetes
[x] Pizzarias
[ ] Mercados
[ ] Hotéis
[ ] Padarias

META DIÁRIA

Empresas por dia
[ 30 ]

HORÁRIO

Início
[ 09:00 ]

Fim
[ 17:30 ]

OFERTA

[x] Produtos de limpeza
[x] Higiene profissional

Perfil de abordagem
[ Restaurante ]

[ SALVAR CAMPANHA ]
```

---

## 3. RADAR COMO FONTE DA PROSPECÇÃO

A Venda Automática deve utilizar o Radar como fonte de empresas.

Não duplicar a lógica de descoberta.

O Radar deverá fornecer:

* nome da empresa
* categoria
* endereço
* cidade
* telefone
* WhatsApp quando disponível
* website
* localização
* dados públicos disponíveis
* origem do lead

Registrar a origem:

```text
Origem:
RADAR_AUTOMATICO
```

---

## 4. FILTROS

Antes de colocar uma empresa na fila de prospecção, verificar:

### Localização

A empresa pertence à cidade configurada?

### Categoria

A categoria está entre as categorias selecionadas?

### Duplicidade

Verificar se a empresa:

* já é cliente
* já é lead
* já foi prospectada
* já recebeu mensagem recentemente
* possui conversa ativa
* já recusou contato
* já possui pedido em andamento

Evitar mensagens duplicadas.

---

## 5. FILA DIÁRIA

Cada campanha deve possuir uma fila.

Exemplo:

```text
VENDA AUTOMÁTICA
30 empresas/dia

HOJE

✓ 01 Restaurante Sabor Caseiro
✓ 02 Lanchonete Central
✓ 03 Pizzaria Itália
✓ 04 Restaurante Bom Prato

● 05 Restaurante do Vale
   aguardando envio

○ 06 Restaurante X
   aguardando

...

30 / 30
```

Status possíveis:

```text
DISCOVERED
QUALIFIED
QUEUED
CONTACTING
CONTACTED
RESPONDED
QUALIFIED_LEAD
OPPORTUNITY
ORDER
NO_RESPONSE
NOT_INTERESTED
INVALID_CONTACT
FAILED
```

---

## 6. CONTROLE DE LIMITE DIÁRIO

Nunca ultrapassar a quantidade configurada.

Se:

```text
limite = 30
```

o sistema pode processar no máximo 30 novos contatos naquele dia.

O limite deve considerar apenas **novos contatos iniciados**, e não mensagens de acompanhamento de conversas existentes.

Exemplo:

```text
30 novos contatos
+
follow-ups de contatos anteriores
```

---

## 7. PERSONALIZAÇÃO DA OFERTA

A IA não deve enviar a mesma mensagem para todas as empresas.

A categoria determina o contexto comercial.

Exemplo:

### Restaurante

Produtos relevantes: detergentes, desengraxantes, detergentes para cozinha, sanitizantes, papel, produtos para limpeza profissional, sacos de lixo.

### Hotel

Produtos relevantes: produtos para lavanderia, limpeza de quartos, papel higiênico, papel toalha, produtos de higienização, sacos de lixo.

### Mercado

Produtos relevantes: limpeza de piso, limpeza de banheiros, desinfetantes, detergentes, papel, sacos de lixo.

A IA deve escolher os produtos relevantes a partir do catálogo existente.

**Não inventar produtos, preços, marcas ou condições comerciais.**

---

## 8. GERAÇÃO DA PRIMEIRA MENSAGEM

A mensagem deve ser gerada pela IA utilizando: nome da empresa, categoria, cidade, produtos relevantes, perfil comercial, nome da empresa Bill, contexto da prospecção.

Exemplo conceitual:

```text
Olá! Tudo bem?

Encontrei o Restaurante Sabor Caseiro aqui em Canoinhas.

Nós trabalhamos com produtos de higiene e limpeza profissional para empresas e atendemos restaurantes da região.

Para restaurantes normalmente conseguimos ajudar principalmente com produtos para cozinha, limpeza e higienização.

Posso te mostrar algumas opções?
```

A mensagem deve ser: curta, natural, comercial, personalizada, sem parecer spam, sem texto excessivamente genérico, sem inventar informações sobre a empresa.

---

## 9. INBOX

Toda prospecção deve aparecer no Inbox.

Criar identificação visual:

```text
🤖 VENDA AUTOMÁTICA
Radar • Restaurante • Canoinhas
```

O vendedor deve conseguir assumir a conversa manualmente.

Quando um humano assumir:

```text
AI → HUMAN
```

a automação daquela conversa deve ser interrompida.

---

## 10. IA DURANTE A CONVERSA

Depois da primeira mensagem, a IA poderá continuar a conversa. Porém deve obedecer regras.

**Pode**: responder dúvidas simples, apresentar produtos, explicar aplicações, identificar necessidade, perguntar quantidade, entender frequência de compra, coletar informações, identificar interesse, sugerir próximos passos.

**Não pode**: inventar preço, inventar estoque, inventar prazo, conceder desconto não autorizado, prometer entrega, confirmar pedido sem autorização, emitir informação fiscal falsa.

Quando precisar de intervenção: `🤖 IA precisa de vendedor` e enviar para atendimento humano.

---

## 11. DETECÇÃO DE INTERESSE

A IA deve classificar a conversa:

```text
ALTO   — "Pode mandar os preços"
MEDIO  — "Quais produtos vocês têm?"
BAIXO  — "Agora não preciso"
RECUSOU — "Não temos interesse"
```

Essa classificação deve ser estruturada no banco.

---

## 12. LEAD QUALIFICADO

Quando identificar interesse comercial: `Lead → QUALIFICADO`, registrando categoria, cidade, necessidade, produtos de interesse, volume estimado se informado, frequência de compra se informada, observações, origem, campanha, data do contato, vendedor responsável.

---

## 13. CONVERSÃO PARA PEDIDO

```text
CONVERSA → OPORTUNIDADE → PEDIDO
```

Não criar um pedido automaticamente apenas porque houve interesse. Antes do pedido, coletar os dados necessários e permitir confirmação.

---

## 14. FOLLOW-UP AUTOMÁTICO

Criar regras configuráveis:

```text
Primeira mensagem → 24h sem resposta → Follow-up 1 → 48h sem resposta → Follow-up 2 → encerra
```

Nunca ficar enviando mensagens indefinidamente. O sistema deve respeitar limites de contato e regras da plataforma de mensagens utilizada.

---

## 15. PROTEÇÃO CONTRA SPAM / DUPLICIDADE

Obrigatório implementar: cooldown por empresa, cooldown por número, bloqueio de contatos que recusaram, bloqueio de clientes já atendidos quando apropriado, deduplicação por telefone, deduplicação por empresa, limite diário, limite por campanha, limite global, registro de todas as mensagens, auditoria.

Nunca enviar várias campanhas simultaneamente para o mesmo contato.

---

## 16. PAINEL DA VENDA AUTOMÁTICA

Mostrar métricas de Hoje (encontradas, selecionadas, enviadas, respostas, interessados, oportunidades, pedidos, taxa de resposta/interesse/conversão) e POR CATEGORIA.

---

## 17. VISÃO POR CIDADE

Acompanhar por cidade (30/dia, enviados, respostas). A campanha pode ser criada para uma cidade por vez. Posteriormente, deixar preparada a arquitetura para múltiplas cidades.

---

## 18. AÇÕES MANUAIS

Na fila: Enviar agora, Pausar, Ignorar, Bloquear, Assumir conversa, Ver Customer 360. Também permitir alterar cidade, categoria, limite diário, produtos, horário, status.

---

## 19. CUSTOMER 360

Ao abrir uma empresa prospectada, utilizar o Customer 360 existente, mostrando categoria, cidade, origem Radar, primeiro contato, campanha, última mensagem, histórico, interesse, status.

---

## 20. BANCO DE DADOS

Antes de criar tabelas novas, analisar o schema atual. Reutilizar entidades existentes sempre que possível. Criar apenas o necessário para:

```text
AutomaticSalesCampaign
AutomaticSalesQueue
AutomaticSalesContact
AutomaticSalesEvent
```

ou adaptar os nomes à arquitetura existente. Não criar dados duplicados de clientes, empresas ou contatos.

---

## 21. WORKER / PROCESSAMENTO

A automação não deve depender da página aberta. Processamento em background com a infraestrutura existente:

```text
Scheduler → Busca campanhas ativas → Verifica horário → Verifica limite diário
→ Busca empresas no Radar → Deduplica → Cria fila → Processa contatos
→ Envia pelo Inbox → Registra evento
```

O processo deve ser idempotente. Se reiniciar: não duplicar mensagens, não duplicar leads, não duplicar empresas.

---

## 22. LOG E AUDITORIA

Registrar timeline de eventos: empresa encontrada/selecionada/ignorada, motivo de rejeição, contato encontrado, mensagem criada/enviada/falhou, resposta recebida, IA respondeu, humano assumiu, lead criado, oportunidade criada, pedido criado.

---

## 23. UX

Design seguindo o Nexus atual. Central de vendas automatizada: visual moderno, informação clara, poucos cliques, status em tempo real, filtros, tabela/fila de contatos, métricas, timeline, ações rápidas.

---

## 24. INTEGRAÇÃO COM O RADAR

No Radar, adicionar ação `[ 🚀 Criar venda automática ]` que cria a campanha a partir do filtro atual (cidade + categorias + quantidade).

---

## 25. INTEGRAÇÃO COM O INBOX

No Inbox, adicionar filtros: Todos, Humanos, IA, Venda Automática, Radar, Interessados, Sem resposta, Oportunidades.

---

## 26. REGRAS IMPORTANTES

Não fazer: sistema separado do CRM, banco duplicado, cadastro duplicado de empresas, mensagens genéricas para todos, envio infinito, pedidos automáticos sem confirmação, preços inventados, produtos inexistentes, alteração do ERPNext core sem necessidade, processos que dependam da interface aberta, execução duplicada após restart.

---

## 27. ANTES DE IMPLEMENTAR

Analisar o código atual do Nexus: Radar, Inbox, Customer 360, Leads, Empresas, Contatos, Campanhas, Produtos, Pedidos, WhatsApp/mensageria, Jobs/Workers, Banco de dados, Autenticação, Permissões. Identificar o que já existe. **Não recriar funcionalidades existentes.**

---

## 28. IMPLEMENTAÇÃO POR ETAPAS

1. Analisar arquitetura atual.
2. Definir modelo de dados mínimo.
3. Criar campanha de Venda Automática.
4. Integrar Radar → fila.
5. Integrar fila → Inbox.
6. Implementar geração da mensagem pela IA.
7. Implementar controle diário.
8. Implementar classificação das respostas.
9. Implementar follow-up.
10. Integrar Lead → Oportunidade → Pedido.
11. Criar dashboard.
12. Criar auditoria.
13. Testar idempotência e duplicidade.

---

## 29. TESTES

Criar testes para: campanha ativa, campanha pausada, limite diário, troca de dia, duplicidade de empresa, duplicidade de telefone, cliente existente, empresa sem telefone, telefone inválido, empresa fora da categoria, empresa fora da cidade, mensagem enviada, mensagem falhou, resposta recebida, IA assumindo conversa, humano assumindo conversa, follow-up, bloqueio, restart do worker, execução simultânea de workers.

Garantir principalmente:

```text
30 contatos configurados → exatamente 30 novos contatos no máximo
worker reiniciado → nenhuma mensagem duplicada
```

---

## 30. RESULTADO_FINAL

O vendedor configura uma vez a estratégia comercial do dia e o Nexus executa a prospecção de forma controlada, enquanto o vendedor acompanha as conversas realmente relevantes no Inbox.

---

# DECISÕES DE IMPLEMENTAÇÃO (abertas no prompt, fechadas aqui)

_Registrar as escolhas tomadas conforme "tomar as melhores decisões"._

| # | Decisão |
|---|---|
| D1 | Fonte de empresas = `business_prospects` do módulo de prospecção (o Radar de tela já nasce dele); a Venda Automática NÃO chama provedores externos novos. |
| D2 | Nomes das tabelas no padrão do schema: `automatic_sales_campaigns`, `automatic_sales_queue`, `automatic_sales_events`. Contato/empresa = `contacts` existente (nada de tabela de contato duplicada). |
| D3 | Origem `RADAR_AUTOMATICO` = valor novo de `contacts.source` + tag `venda-automatica` na conversa (filtro do Inbox aproveita o filtro por tag que já existe). |
| D4 | Filtros do Inbox (§25) = filtros auxiliares por tag/status sobre as abas existentes — nenhuma aba nova (evita quebrar `inbox-abas-espelham-o-comando`). |
| D5 | Interesse estruturado mora na fila (`interest_level`), com lead qualificado indo para `crm_leads` (entidade existente) — nada de segundo CRM. |
| D6 | Follow-up reutiliza `followup_enrollments` quando possível; senão, escalonamento próprio com teto (2 follow-ups e para). |
| D7 | Limite diário conta SÓ contatos novos iniciados (`status` entrando em CONTACTING no dia), com trava única por `(campaign_id, dia)` para idempotência de worker duplicado. |
| D8 | Pedido NUNCA é criado automaticamente (§13): a conversa vira oportunidade; o pedido segue o fluxo manual existente de Pedidos. |
| D9 | Horário da campanha é validado pelo cron (início/fim), fuso da organização. |
| D10 | Catálogo real = `catalog_products` existente; prompt da IA só enxerga produtos dessa tabela (nada inventado). |

---

# CHECKPOINT DE EXECUÇÃO

- [x] ETAPA 1 — análise do repositório (apresentada ao dono)
- [x] ETAPA 2 — modelo de dados (migration 0246 + baseline + MANIFEST + RLS)
- [x] ETAPA 3 — campanha (API + tela)
- [x] ETAPA 4 — Radar → fila
- [x] ETAPA 5 — fila → Inbox
- [x] ETAPA 6 — 1ª mensagem IA
- [x] ETAPA 7 — controle diário
- [x] ETAPA 8 — classificação de respostas
- [x] ETAPA 9 — follow-up
- [x] ETAPA 10 — Lead → Oportunidade → Pedido
- [x] ETAPA 11 — dashboard
- [x] ETAPA 12 — auditoria
- [x] ETAPA 13 — testes de idempotência/duplicidade
- [x] Validação (typecheck, lint, gov:verify, test:db)
- [x] Release + deploy VPS
