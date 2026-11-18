# 33 — Fichas de módulo · Agente E (módulos e jornadas)

> **Frente:** `front/modulos` (worktree `aaa-front-modulos`) · **Agente E**.
> **Base reconciliada:** `bb2b058c` (main após #504/#505) · **18/11/2026**.
> **Método:** releitura do código + testes de componente/rota executados localmente.
> O que exige execução com dados reais está marcado **não medido** — nunca como aprovado.
> Escopo desta frente: **5.4** (inbox/campanhas), **5.6** (pedidos/estoque/compras/expedição),
> **5.8** (fiscal **de UI**), **5.10/5.11** (configurações/equipe/LGPD/admin).
> Fora do escopo por decisão do coordenador: tokens/design global (D), schema/migrations e
> regra fiscal/financeira (A/C), nome automático de campanha (D-01/D-02, #498).

## 0. O que esta rodada mudou (mergeado ou em PR)

| Fatia | Mudança | Estado | Evidência |
|---|---|---|---|
| **Inbox 5.4** | **Reenviar** mensagem que falhou, pelo POST canônico; linha original preservada; recusa inbound/queued/sending/apagada/template | **PR #503** (`cf9370ad` + fix de tokens `0d8c1917`) | `lib/inbox/reenvio.test.ts` + `tests/unit/inbox-reenvio.test.tsx` — 18 ✓ |
| **Pedidos 5.6** | Confirmação em **concluir, faturar, marcar entregue e cancelar em massa**; recusar não chama a API | **mergeado** #504 (`bb2b058c`) | `_detalhe.test.tsx` — 6 ✓ |
| **Fiscal/UI 5.8** | **Tentar de novo** para nota travada em `em_emissao` (a porta que faltava para a recuperação por CAS do Agente C); confirmação em cancelar pendente/emitindo/erro, inutilizar faixa, manifestar desconhecimento/não realizada, ignorar e importar entrada | **mergeado** #505 (`4fb93801`) | `notas-reemitir-emissao` (4) + `fiscal-entrada-confirmacoes` (5) + `notas-importar-xmls` (3) ✓ |
| **Fiscal/UI 5.8 (F6)** | Teto de lista **declarado**: “Mostrando X de Y” em eventos, manifestações, produtos, fornecedores e sincronizações | **nesta fatia** | `tests/unit/fiscal-recorte-da-lista.test.tsx` — 3 ✓ |
| **Fiscal/UI 5.8** | Erro de leitura deixou de virar “Nenhum evento/fornecedor…”: as cinco listas lançam para a error boundary com retry e registram a organização | **nesta fatia** | `lib/fiscal/erro-de-leitura.test.ts` — 2 ✓ |
| **Faturamento 5.6** | Janela truncada em 2.000 deixa de parecer o período: \`meta.amostra_parcial\` + aviso na tela (A10) | **PR #510** | \`tests/unit/faturamento-amostra.test.tsx\` — 2 ✓ |
| **Equipe 5.10** | Erro de leitura com **retry** e vazio com **CTA de convite** (antes: frase vermelha sem saída / frase morta) | **nesta fatia** | `TeamMembersClient.test.tsx` — 7 ✓ |
| **Tokens 5.10** | Falha deixou de virar “nenhum token”; **Expirado ≠ Ativo**; “Não expira” explícito; revogação com confirmação | **nesta fatia** | `tests/unit/api-tokens-estados.test.tsx` — 5 ✓ |

---

## 1. Inbox e atendimento (5.4)

**Propósito.** Receber, atribuir, responder, adiar e encerrar conversas de WhatsApp; é a tela
de trabalho do atendente.
**Rotas/subtelas.** `/app/inbox` (`?id=`), deep-link `/app/inbox/[id]` → redirect; colunas
lista · conversa · ficha (Sheet abaixo de `xl`); abas Fila/Minhas/Todas/Fechadas/Automático.
**Ações.** Assumir, liberar, transferir, encerrar, adiar (snooze), tags, nota interna, anexos
(8 tipos), responder/citar, pausar/retomar IA, dossiê do contato.
**Regras preservadas.** Janela de 24h, bloqueio de contato, isolamento por organização,
assinatura do atendente, handoff IA↔humano.
**Estados.** Lista: skeleton, erro com retry, vazio real × vazio de filtro, “carregar mais”.
Conversa: “Selecione uma conversa”, “não encontrada/fora do acesso”, falha de envio com motivo
**e agora reenvio**. Realtime exposto por `data-realtime-status`/`data-refetch-divergencias`.
**Riscos abertos.** Sem prioridade, SLA, macros, presença/typing — **capacidades ausentes**
(exigem decisão de produto e schema; não são regressão). Reenvio de template é recusado de
propósito: os valores do modelo não são persistidos na linha — o caminho é o composer.
**Teste.** `pnpm exec vitest run lib/inbox/reenvio.test.ts tests/unit/inbox-reenvio.test.tsx` → 18 ✓.
**Classificação.** Existente com melhoria necessária (prioridade/SLA/macros dependem de decisão).

## 2. Campanhas (5.4)

**Propósito.** Falar com clientes por cidade (região), garimpar empresas (prospecção) e
recuperar inativos (Radar) — um motor, três públicos.
**Rotas.** `/app/campanhas` (`?subtela=prospeccao|prospeccao&aba=`), `/app/prospeccao/*`
(alias), `/app/radar` (recuperação), wizard e diálogo por região.
**Regras preservadas.** Audiência recalculada no servidor, consentimento/opt-out via
`contatoPodeReceber`, reserva de contato por campanha, cota diária (menor entre campanha e
número), uma mensagem por minuto, janelas e período.
**Achados desta rodada.** Nome automático por cidade é **D-01/D-02** (#498, dono
Coordenador) — esta frente **não editou** `lib/prospeccao/nome-da-campanha.ts`, wizard nem API.
**Aberto (P2).** A prévia não mostra **quantos ficaram de fora por consentimento/opt-out**:
a função filtra e devolve só quem pode receber. Exige contar os excluídos em
`lib/comercial/clientes-por-regiao.ts` e exibir na prévia — melhoria de honestidade, sem regra
nova. A lista já exibe as cidades de origem (“Região: …”).
**Classificação.** Existente validada; UI de consentimento/opt-out **incompleta**.

## 3. Pedidos (5.6)

**Propósito.** Criar, aprovar, faturar, expedir e entregar o pedido; imprimir e acompanhar.
**Rotas.** `/app/pedidos`, `/novo`, `/[id]`, `/imprimir`; APIs `commercial-orders/**`.
**Regras preservadas.** Teto de desconto/alçada no servidor, crédito, tabela de preço, estoque,
idempotência por `chave_sincronizacao`, máquina de estados (`transicoes-do-pedido.ts`),
devolução de estoque no cancelamento.
**Estados.** Lista com erro inicial explícito, vazio/vazio de filtro, barra de massa; ficha com
timeline, financeiro e nota que **não** convertem erro em “sem dado”.
**Mudança desta rodada.** Concluir/faturar/entregar e cancelar em massa pedem confirmação com o
efeito escrito; aprovar e expedir seguem em um clique. Recusar não chama a API.
**Aberto.** `desconto_pct` em `duplicar` já corrigido (A5); fornecedor sem editar/desativar (A14,
P2); histórico de preço é capacidade nova (P3). O teto de 2.000 do faturamento agora se declara
(PR #510), mas a paginação continua F-30. **Não medido:** impressão real em impressora térmica e
o comportamento com Mercos lento.
**Teste.** `pnpm exec vitest run app/app/pedidos/[id]/_detalhe.test.tsx` → 6 ✓.
**Classificação.** Existente com melhoria necessária (o que resta é P2/P3).

## 4. Estoque, compras e fornecedores (5.6)

**Propósito.** Saldo e razão de estoque; repor via compras; receber e devolver; cadastro de
fornecedores das notas.
**Rotas.** `/app/estoque` (3 abas), `/app/compras`, `/app/compras/[id]`,
`/app/fiscal/fornecedores`.
**Regras preservadas.** Saída > saldo recusa; compra nasce rascunho; receber só `enviado`;
CAS em `recebido_qtd` antes do estoque (P0-09); devolução compensa; custo BR em `centavosDeBr`.
**Estados.** Skeleton/vazio/erro+retry nas duas primeiras; fornecedores agora declara o teto da
lista (F6).
**Aberto.** Recebimento em múltiplas escritas (P0 de arquitetura, com C/A); catálogo truncado em
500 no seletor (A7/F-30); fornecedor sem editar/desativar (A14). **Não medido:** recebimento
concorrente em banco real (coberto por `test:db`, não por esta frente).
**Classificação.** Existente com melhoria necessária; o risco de atomicidade está com A/C.

## 5. Expedição e frota (5.6)

**Propósito.** Montar carga, distribuir/roteirizar (VRPTW), sair para rota, entregar e fechar.
**Rotas.** `/app/expedicao`, `/nova`, `/[id]`, `/rota`, `/motorista`, `/fechamento`;
`/app/frota`.
**Regras preservadas.** Carga só com pedido embarcável; snapshot do destino; iniciar exige
separação; finalizar exige zero pendência; distribuição versiona com `versao_base`.
**Estados.** OSRM fora → “Ordem aproximada” com distância em reta ×1,3; sem coordenada →
parada não roteirizável nomeada; navegação 503 com motivo. Confirmações de iniciar rota,
entregar e tirar pedido já mergeadas (`b43f54f4`).
**Aberto.** `cancelada` inalcançável na UI; lista de cargas com teto de 200 sem paginação
(A15/F-30). Ambos P2; paginação depende de decisão de UI (não é regressão).
**Classificação.** Existente validada no caminho principal; P2 de volume.

## 6. Notas e fiscal (UI, 5.8)

**Propósito.** Emitir, acompanhar, cancelar, corrigir e inutilizar NF-e/NFC-e; importar
entradas e manifestar.
**Rotas.** `/app/notas` (6 abas), `/app/fiscal/**` (13 telas), `/app/faturamento`.
**Fora do escopo.** Regra fiscal, transmissão, idempotência (Agente C) e schema (Coordenador).
**Mudanças desta rodada.**
1. **Tentar de novo em `em_emissao`**: a API recupera o job travado por CAS (teto de 15 min,
   409 enquanto processa); a grade não tinha a porta. A confirmação explica o teto e a recusa;
   não existe segunda ação concorrente — `erro` continua com o mesmo endpoint.
2. **Confirmações**: cancelar pendente/emitindo/erro (avisa que o erro diagnóstico some),
   inutilizar faixa digitada, manifestar desconhecimento/não realizada, ignorar e importar
   entrada (estoque + contas a pagar). Ciência (210210) segue direta.
3. **Teto de lista declarado** (F6) em eventos, manifestações, produtos, fornecedores e
   sincronizações — `RecorteDaLista` usa o `count` da mesma consulta.
4. **Erro de leitura não é lista vazia**: as cinco listas passam pelo
   `exigirLeituraDeLista` e a falha chega à error boundary da rota (com retry) em vez de
   renderizar “Nenhum…”.
**Aberto.** Sincronização sem retry por linha (F7, P2); `ignorar` exige só `agent` (F8,
simetria de permissão — decisão de B); limite principal de `/app/notas` (200) ainda silencioso
no KPI. **Não medido:** sidecar fiscal real, SEFAZ, 656 ao vivo.
**Teste.** 4 + 5 + 3 + 3 + 2 ✓ (ver §0).
**Classificação.** Existente com melhoria necessária; UI das ações críticas agora fecha o
caminho sem confirmação.

## 7. Equipe e configurações (5.10)

**Propósito.** Convidar e gerir membros/papéis/setores/números; conta, empresa, marca,
notificações, segurança, tokens de API.
**Rotas.** `/app/team` (`?aba=membros|atendimento`), `/app/team/invite`,
`/app/settings/**` (12 telas).
**Permissões.** Convite exige admin (redirect `/403`); tokens exigem admin; marca e billing
exigem admin/platform; atendimento exige manager. A página de Equipe **não** tem guarda de
página — viewer vê membros/e-mails. **Decisão pendente (B/dono):** restringir a página inteira
ou esconder e-mails; não alterado aqui para não sobrepor a frente de autorização.
**Mudanças desta rodada.**
- Equipe: erro de leitura com **retry** (era frase vermelha), vazio com **CTA de convite**
  (admin) em vez de frase morta; viewer não recebe o CTA.
- Tokens: falha deixou de ser “Nenhum token criado ainda”; **Expirado** deixou de pintar
  **Ativo**; “Não expira” explícito; **revogar** pede confirmação (para automações e agentes).
**Aberto (decisão).** Expiração opcional = token imortal por padrão (P1 de segurança, B/dono);
escopo é string livre; billing é placeholder no menu (shell é D).
**Teste.** `TeamMembersClient.test.tsx` 7 ✓ · `api-tokens-estados.test.tsx` 5 ✓.
**Classificação.** Existente com melhoria necessária; guarda da página e expiração dependem de
decisão.

## 8. LGPD e administração de plataforma (5.10/5.11)

**Propósito.** Atender titulares (exportar/anonimizar), medir SLA, administrar tenants, uso,
incidentes, impersonação e saúde.
**Rotas.** `/app/lgpd/requests` (admin), `/admin/**` (platform admin + AAL2).
**Estados medidos.** LGPD: skeleton, erro com retry, vazio explicativo, paginação de 25 com
total. Admin: tabelas com filtros e estados próprios; impersonação com TTL/audit.
**Aberto (não desta frente).** `platform_admins.scope` lido e não aplicado; impersonação de
tenant suspenso; ações durante impersonação sem `acting_as_platform_admin`; billing placeholder.
Todos são segurança/autorização → **B/Coordenador**, não UI.
**Classificação.** Existente; riscos de autorização registrados fora desta frente. LGPD com
gate de consentimento no pedido é **INFERIDO** (não escrito no repositório) — decisão de produto.

---

## 9. Estados que continuam ausentes e por quê

| Item | Módulo | Por que não foi feito |
|---|---|---|
| Prioridade, SLA, macros e presença do atendente | Inbox | Capacidade nova: exige schema, regra de negócio e decisão de produto. Registrado, não inventado. |
| Contagem de opt-out/consentimento na prévia da campanha | Campanhas | Exige mudar o retorno de `listarClientesPorRegiao`; P2 de honestidade, sem regra nova. |
| Paginação de cargas (200) e catálogo truncado (500) | Expedição/Estoque | F-30; decisão de UI/volume. |
| Guarda da página de Equipe e expiração padrão de token | Equipe/Tokens | Autorização/segurança pertencem a B; UI já mostra o estado real. |
| Retry por linha na sincronização fiscal | Fiscal | P2; regra de operação fiscal (C). |

## 10. Limitações da medição

- **Não medido** nesta frente: render real em 390/834/1440 das telas tocadas, SEFAZ/sidecar ao
  vivo, importação Mercos lenta, impressão térmica, banco real com dados de cliente.
- Testes de componente usam jsdom e fakes; eles provam o contrato da **tela** (pergunta antes,
  chama a rota certa, não duplica), não a transação no banco.
- Nenhuma operação real de emissão, cancelamento, pagamento, campanha ou mensagem foi executada.
