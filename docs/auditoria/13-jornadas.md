# Fase 2 — Jornadas críticas: o que o produto faz, o que é provado e o que não é

> Regido por [`PROMPT-MESTRE-AAA.md`](PROMPT-MESTRE-AAA.md) — a seção "Jornadas críticas a
> mapear e validar" da Fase 2 exige as **16** jornadas mínimas, "confirme no código quais
> jornadas existem e seu estado real".
> Medido em **16/11/2026** contra o checkout auditado, em **build de produção**
> (`pnpm build` + `next start` na porta 3011), Supabase local e sessão real do seed E2E.
> A tabela de §1 é **gerada**: `pnpm exec tsx scripts/auditoria/jornadas.ts --log <log do Playwright>`.
> O mapeamento jornada → spec vive nesse script (é decisão, e é revisável); a contagem vem
> do disco; o resultado vem do log. Tabela digitada à mão envelhece na primeira spec nova.

## 0. Como cada linha foi medida — três provas, não uma

Cada jornada abaixo tem três colunas de evidência, e cada uma responde a uma pergunta
diferente:

| Prova          | Pergunta que responde             | Como foi medida                                                                                                                                                                 |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Superfície** | o produto **tem** essa jornada?   | `find`/`grep` no código, com o comando citado. Tela que não existe não pode ser auditada — e tela que existe sem rota de API é meia jornada.                                    |
| **Spec E2E**   | alguém **exercita** essa jornada? | lista de `tests/e2e/suites/full.txt` (96 specs, **264** `test()` declarados) e `playwright.mobile.config.ts`. Contagem por spec medida com regex sobre o arquivo, não estimada. |
| **Execução**   | a jornada **passa** hoje?         | `pnpm test:e2e:full` contra o build do worktree. Log bruto e recorte por spec em `evidencias/e2e-full-2026-11-16.txt`.                                                          |

**Regra de leitura, e é o ponto principal deste documento.** "Existe spec" não é "está
coberto":

- spec que **não roda em nenhuma suíte** é cobertura declarada e não executada;
- spec com `test.skip`/`test.fixme` é **cobertura parcial** — o número de pulados entra na
  conta e o motivo é o motivo do código, não uma suposição;
- spec que exercita a jornada **por dentro** (chamando a função que o worker chamaria) prova
  o mecanismo, não a tela — e isso está dito em cada caso.

Nenhuma jornada é marcada como coberta por existir um arquivo com o nome dela. A coluna
"Resultado" vem do log; a coluna "O que fica descoberto" é o que sobra depois de descontar
o que o spec realmente abre.

## 1. Mapa J1–J16

<!-- TABELA:INICIO -->

| #   | Jornada (texto do prompt)                                                                  | Specs | `test()` no arquivo | ✓   | ✘   | esperado | pulado |
| --- | ------------------------------------------------------------------------------------------ | ----- | ------------------- | --- | --- | -------- | ------ |
| J1  | login, recuperação de acesso, MFA e convite de usuário                                     | 6     | 23                  | 23  | 0   | 0        | 0      |
| J2  | onboarding do tenant, configuração de funil, equipe, WhatsApp, Nuvemshop e IA              | 2     | 14                  | 14  | 0   | 0        | 0      |
| J3  | captura, qualificação e atribuição de lead                                                 | 9     | 15                  | 14  | 1   | 0        | 0      |
| J4  | mover lead entre etapas, agendar próximo passo e registrar resultado                       | 17    | 57                  | 59  | 0   | 0        | 2      |
| J5  | buscar ou criar contato, revisar Customer 360 e histórico                                  | 2     | 3                   | 3   | 0   | 0        | 0      |
| J6  | receber, atribuir, responder, encaminhar e encerrar conversa no inbox                      | 7     | 14                  | 8   | 2   | 0        | 0      |
| J7  | transferir conversa entre IA e pessoa, com contexto, controle e auditoria                  | 2     | 3                   | 3   | 0   | 0        | 0      |
| J8  | criar/publicar/pausar/rollback de agente, editar conhecimento, testar e avaliar resposta   | 12    | 43                  | 39  | 0   | 0        | 4      |
| J9  | configurar follow-up e controlar enrollment, pausa, retomada, cancelamento, snooze e falha | 9     | 20                  | 20  | 0   | 0        | 0      |
| J10 | criar e processar pedido, aplicar políticas, verificar estoque, cobrança e comissão        | 6     | 11                  | 4   | 0   | 0        | 0      |
| J11 | compras, entrada de estoque, expedição, rota, motorista e fechamento                       | 4     | 4                   | 4   | 0   | 0        | 0      |
| J12 | financeiro, títulos, recebimentos e indicadores                                            | 3     | 3                   | 3   | 0   | 0        | 0      |
| J13 | operações fiscais e tratamento de falhas de sincronização                                  | 4     | 9                   | 4   | 1   | 0        | 0      |
| J14 | importar/exportar dados, LGPD, solicitações e trilha de auditoria                          | 4     | 9                   | 3   | 1   | 0        | 1      |
| J15 | atualizar, configurar integração, revisar erro e recuperar o serviço                       | 8     | 19                  | 18  | 0   | 1        | 0      |
| J16 | captura de pedido offline, fila, sincronização, conflito e rejeição                        | 0     | 0                   | 0   | 0   | 0        | 0      |

<!-- TABELA:FIM -->

As 107 specs do disco fecham: **87** estão em jornadas (algumas em duas, de propósito — o mesmo
teste prova a atribuição em J3/J6 e o gatilho de etapa em J4/J9), **20** são contratos
transversais e estão nomeadas em `TRANSVERSAIS` no gerador com o motivo de cada uma, e **0**
ficaram sem classificação. Esse número é impresso pelo gerador e cobrado pelo gate
`tests/unit/jornadas-fecham.test.ts`: spec no disco sem jornada e sem motivo escrito não passa.

> A contagem "Declarados" é `test()` no arquivo, incluindo os marcados `skip`/`fixme`. Os
> pulados aparecem na seção de cada jornada e no total consolidado (§3).

## 2. Jornada por jornada

### J1 · Login, recuperação de acesso, MFA e convite de usuário

**Superfície (medida).** Nove telas:

```
app/(public)/login/page.tsx            app/(public)/signup/page.tsx
app/(public)/login/forgot/page.tsx     app/team/invite/page.tsx
app/(public)/login/recovery/page.tsx   app/team/accept-invite/[token]/page.tsx
app/(public)/login/reset/page.tsx      app/onboarding/invite-team/page.tsx
app/(public)/login/mfa/page.tsx
```

**Specs.** `auth` (4), `password-recovery` (1), `reset-password-mfa` (1), `mfa-opcional` (4),
`invite-lifecycle` (12), `signup-journey` (1) — 23 testes declarados.

**O que é provado.** O ciclo inteiro, pela tela: entrar, errar a senha e ver a mensagem,
recuperar por e-mail, redefinir, e o segundo fator nos dois modos (obrigatório e opcional). O
`invite-lifecycle` é o mais denso dos seis (12 testes) e é adversarial, não só caminho feliz:
ciclo feliz (convite → aceite → vira agent → cai no inbox), escopo e permissão **depois** do
aceite (agent não convida: 403), reuso do token idempotente sem membership duplicada,
`already_member`, token expirado, token com **HMAC adulterado**, e-mail que não corresponde, e
não autenticado vendo CTA de login em vez do formulário.

**O que fica descoberto.** Nada de estrutural. A tela `/login/mfa` **não** é auditada
visualmente na varredura de rotas porque, com a sessão do seed, ela redireciona para
`/app/inbox` — o que se mediria ali é a tela de destino. A cobertura funcional existe; a
visual, não.

### J2 · Onboarding do tenant, configuração de funil, equipe, WhatsApp, Nuvemshop e IA

**Superfície (medida).** Nove passos do wizard + a página de convite da equipe:

```
app/onboarding/page.tsx              app/onboarding/setup-ai/page.tsx
app/onboarding/welcome/page.tsx      app/onboarding/testar/page.tsx
app/onboarding/funil/page.tsx        app/onboarding/connect-whatsapp/page.tsx
app/onboarding/invite-team/page.tsx  app/onboarding/connect-nuvemshop/page.tsx
app/onboarding/done/page.tsx
```

**Specs.** `wizard-do-funcionario` (13) e `troca-de-organizacao-tem-volta` (1) dentro do CI.
A jornada de instalação fresca de verdade é `vps-fresh-onboarding`, que está em `FORA_DO_CI`
por dependência de WAHA, Redis, Resend e Nuvemshop.

**O que é provado.** O wizard inteiro, pela tela, **dentro do CI**: abre mostrando o que a
instalação já trouxe, o aceite de termos leva a documentos que existem, o nome do negócio
chega ao passo seguinte, o passo do telefone pergunta _como_ se conecta antes de assumir o
código (e não vaza identificador interno), treinar mostra o cérebro do agente e sem chave não
vira beco, o quadro chega montado, trocar por modelo pronto funciona sem IA, coluna sem nome
barra o salvamento em vez de sumir calada, e as regras da casa viram memória da organização —
não prompt do agente. `troca-de-organizacao-tem-volta` prova que cair no wizard com uma
organização não configurada tem caminho de volta.

**O que fica descoberto.** A conexão **real** de WhatsApp (WAHA) e de Nuvemshop não é
exercitada em CI nenhum: o wizard prova a pergunta e o caminho, não o handshake. A instalação
fresca completa continua sem gate — é a limitação L3 já registrada, e ela não foi alterada por
esta auditoria.

### J3 · Captura, qualificação e atribuição de lead

**Superfície (medida).** Captação por webhook (`POST /api/v1/webhooks/waha/[token]`), quadro
(`/app/kanban`), fila de atendimento, radar de risco e de recompra, mapa e campanhas de
prospecção:

```
app/app/kanban/page.tsx        app/app/radar/*/page.tsx
app/app/inbox/page.tsx         app/app/prospeccao/*/page.tsx
app/app/meu-dia/page.tsx
```

**Specs.** `conversa-vira-lead` (3), `historico-de-captacao` (2), `distribuicao-atendimento`
(3), `queue-assign` (1), mais os cinco dos radares — `risk-radar`, `recompra-radar`,
`prospeccao-radar`, `prospeccao-mapa`, `campanha-controle-entrega` — **15 declarados em 9
specs**. Os radares entram aqui de propósito: risco, recompra e oportunidade são a régua que
separa quem merece atenção agora, e chamá-los de "transversais" esconderia a única superfície
de **qualificação** que o produto tem.

**O que é provado.** A mensagem entra pelo **caminho de produção** (`POST` na mesma rota que o
WAHA chama, sem header de assinatura, como o WAHA Core real chega) e o card aparece no funil de
entrada; a timeline explica de onde veio; a segunda mensagem do mesmo contato **não** abre um
segundo card. A distribuição em rodízio e a restrição de visibilidade são ligadas **pela
tela**, sobrevivem ao reload, e a combinação que mataria a operação é avisada antes de salvar.
O `queue-assign` prova a fila com posição e tempo de espera, e a conversa migrando para
"Minhas" depois da atribuição.

**O que fica descoberto.** A **qualificação** não tem spec próprio: o score/critério existe no
backend e é usado pelo dispatcher, mas nenhum teste de tela move um lead de "frio" para
"quente" e confere o efeito. Atribuição e captura estão cobertas; qualificação é mecanismo
provado por unidade, não por jornada.

### J4 · Mover lead entre etapas, agendar próximo passo e registrar resultado

**Superfície (medida).** Quadro com arrasto, gestão de funis e etapas, agenda (marcar,
remarcar, cancelar), "Meu dia" e a ficha do lead:

```
app/app/kanban/page.tsx              app/app/pipelines/[id]/page.tsx
app/app/agenda/page.tsx              app/app/meu-dia/page.tsx
app/app/leads/[id]/page.tsx          app/app/settings/tenant/pipelines/page.tsx
```

**Specs.** 17 specs, **57 declarados** — a jornada com mais teste do produto. O núcleo é
`pipelines-gestao` (3), `gatilho-de-etapa` (1), `kanban-owner-filter` (1), `meu-dia` (1); a
agenda entra inteira porque "agendar o próximo passo" **é** ela: `agenda-marcar-pela-tela`,
`agenda-remarcar-e-cancelar`, `agenda-ver-na-agenda`, `agenda-tela-do-produto`,
`agenda-grade-interativa`, `agenda-tipos-de-agendamento`, `agenda-caminho-ate-os-horarios`,
`agenda-painel-cabe-na-tela`, `agenda-kit-visual`, `agenda-escopo-da-organizacao`, e as três do
Google (`conectar-google`, `volta-do-consentimento`, `volta-nao-desloga`).

**O que é provado.** Mover negócio de etapa **pelo teclado** (a via acessível do
`@hello-pangea/dnd`, que é o mesmo arrasto do mouse) e ver o efeito colateral aparecer sozinho:
o follow-up armado naquela etapa entra na fila sem ninguém apertar nada. A gestão de funis
prova criação com colunas, renomeação, reordenação, virar padrão, e as duas recusas que
protegem a operação aparecem explicadas na tela (arquivar o padrão, arquivar o último). O
`kanban-owner-filter` prova que o filtro isola a organização ativa mesmo com funil homônimo em
outra — o caso só tem poder porque o seed cria duas organizações.

**O que fica descoberto.** "Registrar resultado" não tem spec de jornada: o desfecho do
contato existe na agenda e no histórico, e nenhum teste preenche um desfecho e confere que ele
aparece na ficha do lead e no relatório. É o item da J4 com prova mais fraca.

### J5 · Buscar ou criar contato, revisar Customer 360 e histórico

**Superfície (medida).** Lista e ficha do contato, mais a busca dentro do inbox:

```
app/app/contacts/page.tsx        app/app/contacts/[id]/page.tsx
components/inbox/ContactPanel.tsx
```

**Specs.** `contato-salva-email` (1, que também está no smoke) e `confirmar-dado-do-contato`
(2) — 3 testes.

**O que é provado.** Salvar o e-mail de um contato pela tela (o defeito relatado, com o
antes/depois), e o dado que o cliente disse ser **confirmado por uma pessoa** — a distinção
entre "o cliente falou" e "alguém validou" existe no produto e é exercitada.

**O que fica descoberto.** A Customer 360 como tela única (histórico de pedidos, conversas,
títulos, tickets no mesmo lugar) não tem spec de leitura: o que existe prova escrita de campo,
não a leitura consolidada. Busca, ordenação e seleção em massa na lista de contatos não são
exercitadas.

### J6 · Receber, atribuir, responder, encaminhar e encerrar conversa no inbox

**Superfície (medida).** Receber, atribuir, transferir, pausar IA, adiar, fechar e arquivar —
21 rotas sob `/api/v1/conversations/**`, entre elas `[id]/claim`, `[id]/transfer`,
`[id]/close`, `[id]/snooze`, `[id]/pause-ai`, `[id]/reactivate-bot`, `arquivar-todas`.

**Specs.** `inbox-scope` (3), `inbox-quem-manda` (2), `inbox-abas-espelham-o-comando` (1),
`inbox-responder-citando` (2, ambos `skip`), `queue-assign` (1) — 9 declarados, 7 executáveis.

**O que é provado.** O escopo por papel (agent em `own_and_unassigned` vê Minhas e Fila e
**não** vê Todas; manager vê Todas), o deep-link para conversa fora do escopo caindo em estado
vazio claro e sem stack trace, a fila com posição e a atribuição, e a resposta citando
mensagem. As abas espelham o comando do automático.

**O que fica descoberto.** "Encaminhar" é exercitado como _transferir_ (`[id]/transfer`), que é
a mesma rota. Os dois testes de resposta citando estão `skip` — o motivo está escrito no arquivo
e precisa ser lido antes de tratar como cobertura.

**Prova em navegador (2026-11-19).** `j6-inbox-atender-e-recuperar.spec.ts` percorre os três
desfechos na MESMA sessão: assume a conversa pela Fila, responde com um WAHA de verdade no fio
(sucesso), vê o transporte recusar com a bolha dizendo **Falhou** + **Reenviar** (erro), e
recupera pelo botão quando o transporte volta — a tentativa que falhou fica no histórico, que é
o contrato do componente. Fecha a conversa pela confirmação e vê o estado mudar no cabeçalho.
Evidência: `evidence/jornadas-2026-11-19/j6-0{1..4}-*.png`.

**Prova em Vitest (P1-01, sem navegador).** As lacunas de **encerrar** e **arquivar** foram
fechadas na camada que decide o estado, não no clique: `tests/unit/inbox-fechar-e-arquivar-rotas.test.ts`
(fechar: grava `closed`, solta o silêncio do episódio, audita; 404; 500; permissão antes da
escrita; `viewer` barrado — arquivar em lote: confirmação obrigatória, fila vazia sem update,
contagem real, 500, `manager`) e `tests/unit/inbox-fechar-pela-tela.test.tsx` (o botão abre a
confirmação; confirmar chama a mutação certa; cancelar não fecha; já encerrada não oferece de
novo) + `tests/unit/inbox-fechar-hook.test.tsx` (falha → erro visível + invalidação das duas
chaves, o que é o retry da lista). Commit desta atualização.

### J7 · Transferir conversa entre IA e pessoa, com contexto, controle e auditoria

**Superfície (medida).** Inbox com o aviso de pausa, a fila de chamados, o botão de devolver e a
linha do tempo do negócio; no backend, `conversations/[id]/pause-ai`,
`reactivate-bot`, `release`, `claim` e os chamados de IA.

**Specs.** `escalacao-ciclo` (1) e `inbox-quem-manda` (1 dos 2 testes cobre o ciclo
automático → pessoa assume → automático para → volta) — 2 testes.

**O que é provado.** O ciclo completo, pela tela: o agente para, uma pessoa assume, decide, e o
agente **volta sabendo** o que ela fez. A asserção final é sobre o conteúdo que atravessa a
costura — o texto que a pessoa escreveu tem de chegar ao bloco de abertura do próximo turno —
e o spec lê o **mesmo** bloco que o motor lê, pela mesma função. É a escolha certa: prender a
frase do modelo daria um teste que reprova por motivo falso.

**O que fica descoberto.** A **auditoria** do handoff (quem transferiu, quando, com que motivo)
não é conferida na trilha: o spec prova o contexto, não o registro. É item de `api_audit_log`
coberto por unidade, não por jornada.

### J8 · Criar/publicar/pausar/rollback de agente, editar conhecimento, testar e avaliar resposta

**Superfície (medida).** 22 telas em `/app/ai/**`: agentes e editor, casos, controle, decisões,
credenciais, evolução, follow-ups, inbox, conhecimento, memória, propostas, provedores,
roteadores, execuções, skills, consumo.

**Specs.** `agente-novo-e-uso` (5), `capacidades-do-agente` (5), `acervo-de-conhecimento`
(6 declarados, **5 `skip`**), `jornada-ia` (1), `agente-marca-consulta` (3),
`agente-papeis-operador` (8), `agente-organiza-operacao` (1), `escopo-de-funil-do-agente` (2),
`credenciais-de-ia` (1), `prova-painel-provedores` (8), `automacao-diz-a-verdade` (2),
`qa-agente-usa-as-maos` (1) — 38 declarados.

**O que é provado.** Criar agente e ver o consumo; o painel de quem configura o agente; os
papéis do operador; o escopo de funil; a consulta que o agente faz; a proposta do Brain virando
aprovação com ação honesta no Decision Log (jornada 3); o painel de provedores e as
credenciais.

**O que fica descoberto.** Os 5 `skip` do acervo são a maior lacuna funcional da fase: sem
chave de IA com saldo, a indexação de conhecimento não roda, então o caminho
material → trecho buscável → resposta não é provado nesta instalação. O teste que **roda**
("cadastrar material sem chave: ele fica ESPERANDO, e a tela não mente") é justamente o que
prova que a tela não finge — mas ele não substitui o caminho feliz.

### J9 · Configurar follow-up e controlar enrollment, pausa, retomada, cancelamento, snooze e falha

**Superfície (medida).** Três telas (`/app/ai/followups`, `[id]`, `enrollments/[id]`) e **15**
rotas sob `/api/v1/ai/followup*`: criar, publicar, desabilitar, rollback, e as ações de
enrollment — `pause`, `resume`, `cancel`, `snooze`, `skip` — mais a fila e o worker de cron.

**Specs.** `followup-builder` (9), `followup-queue` (2), `followup-ramos` (1),
`followup-linguagem` (1), `followup-tempo-adaptativo` (1), `followup-dossie` (3, 1 `skip`),
`followup-journey` (1), `gatilho-de-etapa` (1), `gatilho-de-caso` (1) — 19.

**O que é provado.** A jornada completa com o seam de LLM declarado passo a passo como
`[REAL]` ou `[INJETADO]`: silêncio → enroll → engine avança nó a nó (trigger → wait → action →
ai_classify) via tick real do cron → resposta do lead → classify roteia → fim → fila mostra o
resultado. O `gatilho-de-caso` prova as duas metades: o caso aberto arma o follow-up **e**
resolvê-lo o cancela — sem a segunda metade a feature cobraria o cliente sobre um problema já
resolvido. `followup-dossie` cobre pausa/retomada; `followup-tempo-adaptativo`, o horário.

**O que fica descoberto.** Um teste do dossiê está `skip`. O caminho de **falha** do worker
(erro no nó, retry, dead-letter) não tem spec de tela: é provado por unidade.

### J10 · Criar e processar pedido, aplicar políticas, verificar estoque, cobrança e comissão

**Superfície (medida).** Editor de pedido em quatro seções (cliente, representada, produtos,
detalhes), lista, ficha, impressão, e a tela de comissões:

```
app/app/pedidos/page.tsx       app/app/pedidos/novo/page.tsx
app/app/pedidos/[id]/page.tsx  app/app/pedidos/imprimir/page.tsx
app/app/comissoes/page.tsx     app/app/pipelines/[id]/page.tsx
```

**Specs.** `jornada-venda` (1), `pedido-idempotencia` (1), `imprimir-pedidos-mesma-aba` (1),
`estoque-entrada-saida-e-saldo` (1) — 4.

**O que é provado.** A jornada 1 inteira, pela tela: login → cliente escolhido pelo autocomplete
→ produto pela busca → desconto de 3% **dentro** do teto da política (o pedido nasce aprovado) →
condição de pagamento → pedido criado com toast e redirect. O passo de aprovação é exercitado
de propósito com um pedido já em `em_analise`. A idempotência é provada **ao vivo**: dois POSTs,
um pedido.

**O que fica descoberto.** **Comissão** tem tela (`/app/comissoes`) e nenhum spec — só aparece
citada na varredura de rotas. É a lacuna mais visível da J10, e é dinheiro.

### J11 · Compras, entrada de estoque, expedição, rota, motorista e fechamento

**Superfície (medida).** Nove telas:

```
app/app/compras/page.tsx                  app/app/expedicao/page.tsx
app/app/compras/[id]/page.tsx             app/app/expedicao/nova/page.tsx
app/app/estoque/page.tsx                  app/app/expedicao/[id]/page.tsx
                                          app/app/expedicao/[id]/rota/page.tsx
                                          app/app/expedicao/[id]/motorista/page.tsx
                                          app/app/expedicao/[id]/fechamento/page.tsx
```

**Specs.** `compras-do-rascunho-ao-estoque` (1), `estoque-entrada-saida-e-saldo` (1),
`entrada-do-endereco` (1), `jornada-expedicao` (1) — 4.

**O que é provado.** O rascunho de compra virando entrada de estoque; entrada, saída e saldo; o
endereço sendo preenchido sem digitação cega; e a jornada 4: pedido vira carga, sai para rota e
é concluído — passando por rota, motorista e fechamento, que são as três telas que nenhuma
outra spec abre.

**O que fica descoberto.** Nada estrutural nesta jornada: as três telas de expedição são
abertas pela jornada 4, e o ciclo fecha. É a jornada com melhor relação cobertura/superfície do
conjunto.

### J12 · Financeiro, títulos, recebimentos e indicadores

**Superfície (medida).** `financeiro`, `titulos` (alias que redireciona), `faturamento`,
`comissoes`, `indicadores`.

**Specs.** `jornada-financeiro` (1), `kpi-e-charts-canonicos` (1), `inteligencia-carrega` (1) — 3.

**O que é provado.** A jornada 5: faturar gera título, receber baixa, e conciliar **acusa a NF**
— o laço fecha entre pedido, título e nota. Os KPIs e gráficos canônicos desenham com os
números certos, e a tela de inteligência carrega.

**O que fica descoberto.** Estorno, cancelamento de título e renegociação não têm spec. A
conciliação é provada no caminho feliz e no de divergência de NF; os caminhos de correção, não.

### J13 · Operações fiscais e tratamento de falhas de sincronização

**Superfície (medida).** Treze telas em `/app/fiscal/**` mais `/app/notas`: notas, pendentes,
sincronizações, manifestações, eventos, fornecedores, produtos, resumos, relatórios, XML,
configurações, e a ficha da nota.

**Specs.** `jornada-fiscal` (1), `notas-fiscais-modulo` (3) — 4 no `full.txt`. Existe também
`playwright.fiscal.config.ts`, que aponta para `./tests/fiscal` — suíte separada, fora do
`full.txt`, e portanto **não medida nesta execução**.

**O que é provado.** A jornada 6: faturar, configurar emitente e emitir caindo no **estado
honesto sem emissor** — a tela não finge que emitiu. O módulo de notas prova que **as 12
subtelas** do fiscal abrem com sessão real, que a porta do sidebar é `/app/fiscal` e que nota
inexistente cai em 404 — ou seja, cobre a **porta** de cada subtela, não o estado de cada uma.

**Prova em navegador (2026-11-19).** `j13-fiscal-homologacao.spec.ts` abre a tela de
sincronização em **homologação** e prova os três desfechos: a execução falha com motivo
acionável (senha do certificado ausente) e fica registrada no histórico; a causa é consertada
PELA TELA de configuração e a nova tentativa passa desse bloqueio, parando no motivo de
ambiente — que é o estado verdadeiro da homologação, e o portão é LOCAL (`motivoDeNaoBaixar`,
`lib/fiscal/eventos.ts`), então **nenhum HTTP à SEFAZ acontece**. O sucesso é provado na nota de
entrada: aprovar a conferência muda o estado com autor e data, e reabrir + aprovar de novo mostra
que a decisão não travou o fluxo. Evidência: `evidence/jornadas-2026-11-19/j13-0{1..4}-*.png`.

**O que fica descoberto.** A suíte `tests/fiscal` existe e não foi executada aqui — isso está
dito, não escondido. E o E2E agora força a falha pela tela, mas a **distribuição com sucesso**
continua impossível em homologação por decisão de produto: a SEFAZ não entrega DF-e de terceiro
lá, e o app recusa antes de chamar. Provar esse caminho exigiria produção — que esta doutrina
proíbe — ou um sidecar com certificado real.

**Prova em Vitest (P1-01, sem navegador).** `tests/unit/j13-fiscal-falha-de-sincronizacao.test.ts`
cobre o resultado da sincronização: 200 com novas/atualizadas, 409 de lock concorrente, 422 de
configuração ausente, **502 quando a SEFAZ está inalcançável** (nunca 200 vazio), falha parcial
preservando o que entrou, 656 com a próxima tentativa, permissão; o histórico mostra a falha com
`cStat` e mensagem, lista vazia ≠ erro, filtro de resultado na organização ativa e 500 em erro do
banco. `tests/unit/j13-botao-sincronizar.test.tsx` prova o botão: sucesso diz o que veio, 656
avisa a hora, falha → erro visível (não toast verde), duplo clique bloqueado e **retry depois da
falha** volta a funcionar. Commit desta atualização.

### J14 · Importar/exportar dados, LGPD, solicitações e trilha de auditoria

**Superfície (medida).** **Treze** rotas de importação e **uma** de exportação:

```
products/import            leads/import               invoices/importar-xmls
contacts/import            prospecting/prospects/import   fiscal-entradas/[id]/importar
ai/skills/import           prospecting/prospects/import-arquivo
commercial-orders/importar-ia      commercial-orders/importar-mercos
cron/mercos-import         fiscal-ibpt/importar        fiscal-ibpt/importar-siscomex
audit/export
```

Quatro telas de LGPD (`/app/lgpd/requests`, `/app/lgpd/requests/[id]`,
`/admin/lgpd`, `/admin/lgpd/requests/[id]`) sobre **oito** rotas de API, incluindo
`approve`, `preview`, `anonymize` e o cron `lgpd-sla-watcher`. E a tela de auditoria
(`/app/audit`) com filtros e exportação.

**Specs.** Nenhum spec de jornada. `auditoria-aceite-11-itens` e `responsividade-nas-rotas`
citam `/app/lgpd/requests` **como rota a visitar** numa varredura de 1280/390, o que prova que a
tela abre — não que a solicitação nasce, é aprovada, pré-visualizada e anonimizada.

**O que fica descoberto (depois da prova em Vitest de P1-01).** Continua sem prova **de tela** —
o que existe agora é prova de rota/componente, declarada:

- **import/export**: `tests/unit/j14-importacao-contatos.test.ts` prova a importação de contatos
  (sem arquivo, formato errado, cabeçalho sem identificador, caminho feliz com `organization_id`
  da sessão + `contact.created` + auditoria, **importação parcial** com a linha inválida
  nomeada, todas inválidas, permissão). As outras 13 rotas de importação e os botões das 6 telas
  seguem sem prova;
- **LGPD**: `tests/unit/j14-lgpd-ciclo.test.ts` (lista, aprovação com `Idempotency-Key` e
  justificativa, replay, 409/404/403/500, prévia com máscara e CPF nunca no payload),
  `tests/unit/j14-lgpd-aprovar-pela-tela.test.tsx` (estado do botão e falha visível) e
  `tests/unit/j14-lgpd-anonimizar.test.ts` (cascata de anonimização, idempotência
  `already_anonymized`, 404, guard na organização DO CONTATO, 422, 500). O ciclo
  solicitação → aprovação → prévia → anonimização está provado por rota; a tela do DPO não foi
  aberta por navegador;
- **auditoria**: `tests/unit/j14-auditoria-export.test.ts` prova o CSV (cabeçalho, escape de
  vírgula/aspas/quebra de linha, vazio ≠ erro, filtros + organização, `viewer` barrado, 422 e
  500). Os filtros da tela continuam sem prova de navegador.

**Prova em navegador (2026-11-19).** `j14-lgpd-aprovar-pela-tela.spec.ts` abre a lista do DPO,
a prévia (mascarada, com as contagens) e aprova com justificativa — o status vai para
**Processando** e a trilha `lgpd.manually_approved` aparece na mesma tela. O guard de 10
caracteres é exercitado (confirmação desabilitada). A falha de rede é injetada no fio
(`page.route`/abort) na confirmação de uma segunda solicitação: a tela diz "Falha ao aprovar…"
e o status continua **Recebido**, nunca um sucesso otimista; sem a falha injetada, a mesma
solicitação é aprovada (recuperação). Evidência: `evidence/jornadas-2026-11-19/j14-0{1..4}-*.png`.

Duas rotas de importação não têm chamador fora da API — `contacts/import` e `ai/skills/import`.
São API pública sem superfície: funcionam, e ninguém as alcança pela tela.

**Resumo para P1-01:** J6 e J13 passam a ter prova das lacunas nomeadas na camada de rota e
componente; J14 cobre o ciclo LGPD completo, a exportação da trilha e uma importação (contatos)
com erro e parcial. O que continua aberto é **UI por navegador** e as demais importações.

### J15 · Atualizar, configurar integração, revisar erro e recuperar o serviço

**Superfície (medida).** `/app/settings/atualizacao` (painel de update self-service),
`/app/webhooks`, a central de avisos e a tela de incidentes do admin.

**Specs.** `system-update` (7 declarados, 1 `skip`), `webhooks` (1),
`central-de-avisos-capacidades` (2), `degradacao-silenciosa` (1), `retorno-anti-morte` (3),
`relogio-http-cron-externo` (2), `vps-webhook-outbound-ssrf` (1),
`notificacoes-diz-o-que-falta` (2) — 18 declarados.

**O que é provado.** A atualização self-service **pela tela**, como o dono da instalação faria
(inclusive o agente do host); o fluxo completo de webhooks e automações; o aviso de capacidades
ausentes aparecendo na central; a cerca da degradação silenciosa; o anti-morte (o retorno que o
agente marca aparecer no Radar e na linha do tempo em português de gente, e a pessoa
desmarcá-lo pela fila com o agente descobrindo); e o relógio HTTP batido por um cron externo de
verdade.

**O que fica descoberto.** Um teste de `system-update` está `skip`. A recuperação de um serviço
**caído de verdade** (WAHA fora, Redis fora) não é simulada: o que existe prova o caminho de
erro declarado, não a volta do serviço.

### J16 · Captura de pedido offline, fila, sincronização, conflito e rejeição

**Superfície (medida).** O shell Capacitor (`mobile/www`), SQLite via `jeep-sqlite`, a fila
local (`lib/offline/`) e o service worker.

**Specs.** `mobile-offline` (4 testes) roda em **outro** workflow: `playwright.mobile.config.ts`
sobe um **vite dev** próprio (o gancho `window.__offline` não existe no build de produção) e o
job `apk-debug` do `apk.yml` o executa antes de compilar o APK — em `workflow_dispatch` e em PR
que toque `mobile/`, `lib/offline/`, `capacitor.config.ts` ou o próprio workflow. A sincronização
com o servidor é provada por `pedido-idempotencia` (1, no `full.txt`) mais 14 casos de unidade do
dreno e 8 da chave de sincronização.

**O que é provado (pelo que a própria spec declara).** Sem catálogo a captura **não abre** (o
botão explica em vez de deixar capturar preço chutado); com catálogo, cliente → item →
quantidade → salvar enfileira com `OFF-0001` e o total certo; **com o backend morto** a captura
funciona; o segundo pedido é `OFF-0002`; rejeitado aparece com o motivo.

**O que fica descoberto.** O **dreno contra o backend real** não roda nesta suíte — a spec diz
por quê (exigiria sessão autenticada cross-origin, e um teste que finge sessão provaria o dreno
contra um backend que não é o backend). Conflito e rejeição são provados por unidade, não pela
tela.

## 3. Execução: 254 passaram, 7 falharam — e o que cada falha era

Comando, exatamente como rodou:

```bash
E2E_BASE_URL=http://localhost:3011 pnpm test:e2e:full   # porta 3011: a 3001 está ocupada
# 254 passed, 7 failed, 6 skipped, 1 did not run — 37,1 min
```

Log bruto, versionado: `docs/auditoria/evidencias/e2e-full-2026-11-16.txt` (823 linhas).
Cada falha abaixo foi aberta, lida e classificada — nenhuma foi tratada como "flake" sem prova.

> **Como ler a tabela de §1.** A coluna `test()` no arquivo é contagem **estática** de
> `test(...)`. Spec que gera teste dentro de laço executa mais do que declara: em J4,
> `agenda-painel-cabe-na-tela` declara 3 e executa **7** (um por viewport), e por isso a
> coluna ✓ de J4 (59) é maior que a de declarados (57). A coluna ✓ vem do log; a estática vem
> do arquivo. As duas medem coisas diferentes de propósito.

### 3.1 As 7 falhas da execução

| Spec:linha                              | O que ela mede                               | O que aconteceu, medido                                                                                                                                              | Veredito                                       |
| --------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `auditoria-aceite-11-itens:182`         | tipografia de `<h1>` nas 112 rotas           | **6 famílias** de tamanho em vez de 3. Detalhe abaixo.                                                                                                               | **defeito meu + 4 do produto — corrigidos**    |
| `filterbar-unica-nas-listas:29` e `:75` | barra de filtros de compras/estoque/carteira | `strict mode violation: getByLabel('Buscar') resolved to 2 elements` — o botão de busca do **shell** e o campo de filtro da página tinham o **mesmo nome acessível** | **produto — corrigido**                        |
| `notas-fiscais-modulo:75`               | a porta do sidebar de Notas Fiscais          | esperava `/app/fiscal`; o registro aponta `/app/notas` desde `5eee8923`                                                                                              | **spec obsoleta — corrigida**                  |
| `inbox-responder-citando:101` e `:127`  | responder citando mensagem                   | `Test timeout of 30000ms exceeded` no laço de 8 conversas × 4 s = **32 s**, que não cabe no prazo de 30 s                                                            | **teste — corrigido**                          |
| `prospeccao-mapa:40`                    | mapa de empresas com marcadores              | `.leaflet-container` não existia porque a aba **Empresas** voltava para Campanhas: o filtro da tela escrevia a URL no alias `/app/prospeccao` e a navegação remontava a tela. **Fechado (F-27)** — 3 execuções verdes em 17/11 | **produto — corrigido**                        |

`degradacao-silenciosa:117` aparece como ✘ no log e **não** é falha: o spec declara
`test.fail(...)`, a catraca que exige que a tela avise quando a entrega do tempo real morre. A
coluna "esperado" da tabela existe para isso — vermelho ali é o gate funcionando.

### 3.2 `auditoria-aceite:182` — seis famílias de título, e uma delas fui eu

A spec imprime o mapa inteiro, o que dispensou qualquer suposição:

```
VIOLACOES(0) de 112 rotas:          ← nenhuma violação de cor/fonte/tabela/navegação
FAMILIAS(1): Geist, ...             ← uma família tipográfica, correta
H1 24px  (97): quase todo o produto ← canônico (NexusPageHeader)
H1 sem-h1 (1): /app/ai/agents/new   ← o editor de agente não tinha <h1> nenhum
H1 16px  (11): sr-only (inbox, onboarding)
H1 18px  (1):  /app/pedidos/imprimir ← EU criei, corrigindo a V-08
H1 20px  (1):  /app/prospeccao       ← mede /app/campanhas, destino do alias
H1 22px  (1):  /design               ← showcase do DS, escala própria
```

Cinco consertos, cada um com o motivo escrito no código:

| Tela                                         | Antes          | Depois    | O que era                                                             |
| -------------------------------------------- | -------------- | --------- | --------------------------------------------------------------------- |
| `/app/pedidos/imprimir`                      | 18 px          | **24 px** | meu `text-lg` na V-08 → virou `NexusPageHeader`                       |
| `/app/pedidos/imprimir?carga=`               | 18 px          | **24 px** | mesmo defeito no `page.tsx` (estado "muitos pedidos")                 |
| `/app/campanhas` (via `/app/prospeccao`)     | 20 px          | **24 px** | `<h1 className="text-xl">` → `NexusPageHeader`                        |
| `/app/lgpd/requests/[id]`                    | 20 px          | **24 px** | `#id` em `text-xl font-mono` → `text-2xl`, mono preservado            |
| `/app/ai/agents/new` e `/app/ai/agents/[id]` | **sem `<h1>`** | **24 px** | o editor usava `<h2 className="text-xl">` como título da tela inteira |

O `sr-only` (16 px) e o `/design` (22 px) ficam como estão: um título recortado não tem
tipografia visível — o `font-size` dele é herdado — e o showcase existe para mostrar a escala.
Com os cinco consertos, as famílias voltam a **3** e a spec passa (re-executada: 1 passed).

### 3.3 `filterbar` — dois controles com o mesmo nome acessível

```
Error: strict mode violation: getByLabel('Buscar') resolved to 2 elements:
  1) <button title="Buscar" aria-label="Buscar" aria-keyshortcuts="Meta+K Control+K"> aka getByRole('button', { name: 'Buscar' })
  2) <input type="search" id="fornecedores-busca" placeholder="Buscar fornecedor pelo nome"> aka getByRole('searchbox', { name: 'Buscar' })
```

Não é só fragilidade de teste: numa tela com filtro local, um leitor de tela anuncia **dois
"Buscar"** e não diz qual é o global. Consertado nos dois lados:

- **produto**: o botão do shell passou a se chamar **"Buscar em todo o sistema"** (o `title`
  continua "Buscar", que é dica visual, não nome acessível);
- **teste**: o locator passou a ser `getByRole("searchbox", { name: "Buscar" })` — ele diz o
  que quer medir ("o campo de busca desta barra") em vez de "qualquer coisa chamada Buscar".

O teste de unidade do shell ganhou um caso novo que reprova se o nome voltar a ser só "Buscar".

### 3.4 `notas-fiscais-modulo:75` — o commit trocou o menu e esqueceu a asserção

`5eee8923` (04/11/2026) moveu o item "Notas fiscais" do sidebar para `/app/notas` (emissão) —
decisão explicada no próprio registro: com `/app/fiscal` o clique caía no recebimento, que
numa instalação nova está vazio. O mesmo commit atualizou o título de `TELAS` para "NF-e
recebidas" e **não** atualizou esta asserção, que continuou exigindo `/app/fiscal`. Quem estava
errado era a spec; ela agora afirma `/app/notas` e explica por quê.

A primeira versão do meu conserto exigia também um link "NF-e recebidas" no sidebar — e
reprovou, porque esse item **não** é de sidebar (é título de `/app/fiscal` e entrada do ⌘K:
`só` a emissão tem `sidebar: true`). Era exigir do produto o que ele não promete; o teste ficou
com o que existe.

### 3.5 `inbox-responder-citando` — o teste que o CI nunca roda

Os dois testes usam `test.skip(!temMensagens)` quando não há conversa com bolha de mensagem. No
CI eles **sempre** pulam (a instalação do runner não tem mensagem real, porque não há WAHA), e
`- 44` / `- 45` no log do noturno de 15/11 confirmam. Aqui, com o banco local tendo conversas,
eles deixaram de pular — e aí o defeito apareceu: o helper percorre **8 conversas × 4 s = 32 s**
no pior caso, contra os **30 s** de timeout padrão. O teste nunca chega ao próprio `skip`.

Medido: com `--timeout=110000` os dois **pulam honestamente**; com o padrão, reprovam. Conserto:
`test.setTimeout(120_000)` no `describe`, para o orçamento caber no pior caso do próprio teste.
Não é afrouxar: é o teste poder dizer "não havia o que testar" em vez de dizer "a feature
quebrou".

**O achado que fica:** a feature de responder citando não é exercitada em CI nenhum. O skip
condicional é legítimo, mas hoje ele é o único estado que o CI conhece.

### 3.6 F-27 (**fechado**) — o mapa de empresas e a aba que não ficava selecionada

`prospeccao-mapa` estava vermelho **em duas noites seguidas do noturno da main**
(`43704519708` em 15/11, `43582831396` em 14/11), na mesma linha, com o mesmo erro. Não era
ambiente: reproduziu nesta máquina.

O snapshot de acessibilidade no momento da falha mostrava o estado real:

```yaml
- tab "Campanha"
- tab "Prospecção" [selected]
  - tab "Campanhas" [selected]     ← a aba pedida era "Empresas"
  - tab "Empresas"
```

**A causa, provada.** A hipótese (a) da rodada anterior — "o clique na aba não persiste" — estava
certa, mas a causa não era o estado da aba. Era a **URL**: o efeito que sincroniza os filtros das
Empresas (`app/app/prospeccao/_empresas.tsx`) montava a query do zero e escrevia caminho fixo,
`router.replace("/app/prospeccao?...")` — e `/app/prospeccao` é **alias** que redireciona para
`/app/campanhas?subtela=prospeccao`. Como o efeito dispara na montagem da aba, o próprio ato de
abrir "Empresas" navegava para o alias, o servidor redirecionava, a árvore **remontava** e a aba
voltava para "Campanhas" — levando junto o `?aba=empresas` do deep-link.

Medido no navegador com marca no DOM: o `tablist` interno recebia a marca e, **menos de 500 ms
depois do clique**, o nó com a marca já não existia — remontagem, não re-render. Sem remontagem
(click no botão "Pesquisas", que só troca de aba), a marca sobrevivia.

**O conserto, em duas partes que se sustentam:**

1. a query dos filtros passou a ser montada por uma função **pura** —
   `lib/prospeccao/url-dos-filtros.ts` —, sobre o `pathname` real (`usePathname()`) e preservando
   as chaves que são de outro dono (`subtela`, `aba`, o que vier). Ela também é **idempotente**, e
   a tela só chama `router.replace` quando a URL alvo difere da atual — sem isso o efeito vira
   laço de navegação;
2. a aba passou a ser escrita na URL (`?aba=empresas`) ao ser trocada. Era o que o comentário do
   código prometia ("abas controladas: estado + URL") e não acontecia: o estado sozinho não
   sobrevive a remontagem, e o link compartilhado abria na aba errada.

**Prova:** `prospeccao-mapa` **3 execuções verdes** contra o build de produção local (5,4 s / 5,5 s
/ 6,9 s): aba Empresas fica selecionada, `.leaflet-container` existe, marcadores aparecem, clique
sincroniza a lista e o detalhe abre. Gate em `tests/unit/url-dos-filtros.test.ts` (6 casos): a URL
final não pode sair da rota, tem de preservar `subtela`/`aba`, tirar a chave quando o filtro é
limpo e ser idempotente.

**A lição que fica:** "abrir a tela com dados e instrumentar o estado" era o que faltava — e o
estado estava certo. Quem navegava era um efeito de URL que ninguém suspeitava porque *parecia*
só sincronizar filtros. Navegação escondida dentro de efeito é a classe de defeito que só aparece
quando se mede o DOM em vez de ler o componente.

### 3.7 F-28 (**corrigido em 17/11/2026**) — Pedidos offline não dizia que a lista falhou

Medido em 17/11/2026 com `scripts/auditoria/offline-e-erro.mjs`, com o service worker ativo e o
navegador em modo offline:

| Tela | Reload offline | O que a pessoa vê |
| --- | --- | --- |
| `/app/contacts` | app abre | "Algo deu errado · Erro ao carregar clientes · **Tentar novamente**" |
| `/app/inbox` | app abre | "Algo deu errado · Erro ao carregar conversas · **Tentar novamente**" |
| `/app/financeiro` | app abre | "Algo deu errado · Não foi possível carregar estes dados · **Tentar novamente**" |
| `/app/pedidos` | app abre | **nada** — sem alerta, sem "tentar novamente", lista vazia |

O app **não** quebra offline: o service worker serve a casca e três das quatro telas dizem o que
aconteceu, com ação de recuperação. Pedidos fica em silêncio — e é a tela de onde sai a operação
do dia.

Não é conserto deste bloco: o caminho de dados de Pedidos é servidor (`page.tsx`) + SW, e o
tratamento de "sem rede" pertence à frente 7 (PWA/offline), que ainda tem 12 itens em aberto no
checklist. Fica registrado com a medida, para não virar "não testado" daqui a duas rodadas.

**O que já foi corrigido neste tema:** ação pausada offline (o "Carregar mais" que não fazia nada)
— V-42, em `11-auditoria-visual.md`.

**Correção (17/11/2026):** `app/app/pedidos/_client.tsx` assina `online`/`offline` e mostra um
`role="alert"` com "Sem conexão. A lista pode estar desatualizada…" + "Tentar novamente"; a volta da
rede dispara `router.refresh()`. A falha da consulta do servidor também deixou de virar lista vazia
(o erro é logado e a tela diz "Não foi possível carregar os pedidos."). Gate:
`tests/unit/pedidos-offline.test.tsx`. A reme­dição com `offline-e-erro.mjs` fica para a próxima
rodada do instrumento; a prova deste conserto é o teste de componente.

### 3.8 F-29 (**diagnosticado**) — o TBT das telas de gráfico é JavaScript, não desenho

10 rodadas por tela em 390×844 com CPU 4× (antes eram 3, e a variância engolia a diferença):

| Tela | Gráficos | TBT mediana | p10 | p90 |
| --- | --- | --- | --- | --- |
| `/app/indicadores` | 5 | 321 ms | 277 | 376 |
| `/app/radar` | 4 | 301 ms | 275 | 339 |
| `/app/financeiro` (mesma casca) | 0 | 136 ms | 114 | 218 |
| `/app/settings` | 0 | 111 ms | 103 | 142 |

Faixas disjuntas (p10 gráfico 276 > p90 sem gráfico 159), 200/200 pares na direção esperada,
permutação exata p = 5,4 × 10⁻⁶.

**E o custo não está onde parecia:** 0 ms de TBT **depois** do primeiro SVG em 20/20 rodadas. A
montagem custa 115–154 ms (20–36 % do TBT); os outros 64–80 % acontecem **antes de existir gráfico**,
e as telas de gráfico baixam +350–530 KB de JS (2,07–2,26 MB vs 1,63–1,72 MB de controle).

**Consequência:** a tentativa anterior (desligar animação das séries) não podia funcionar — e não
funcionou. O conserto é orçamento de JS (dynamic import da lib de gráfico, não montar fora da dobra),
não ajuste de animação. Fica priorizado com a medida que o justifica.

Ressalvas: a tarefa de montagem não escala com o número de gráficos, e o CPU profile saiu desalinhado
(81 % idle) — não foi usado para atribuir função.

### 3.9 F-32 (**aberto**) — backup sem uploads, sem rotação e sem ensaio de restauração

Medido em 17/11/2026 no `hostgator-setup-kit/`. O que **existe e funciona** (e tem gate em
`pnpm test:shell`, verde): `backup.sh` faz `pg_dump` pela conexão de schema, recusa dump vazio com
piso de 4 KiB, e inclui o volume `waha-data`; `restore.sh` exige digitar `RESTAURAR` e usa
`psql_run`; `update.sh` faz backup antes de tocar no banco.

O que **falta**:

1. **uploads não entram no backup.** Avatares, imagens de produto e mídia de conversa vivem no
   storage; o `backup.sh` cobre banco + sessões de WhatsApp. Restaurar num servidor novo devolve o
   texto e perde as fotos — e o operador não tem como saber antes de precisar;
2. **não há rotação.** Cada rodada grava `db-<timestamp>.sql.gz` e nada apaga o anterior; num cron
   diário o disco cresce até encher;
3. **a restauração não foi exercitada** nesta auditoria: script correto não é prova de restore
   funcionando. Falta restaurar num banco limpo e comparar contagens.

Nenhum dos três é defeito de tela; é a operação do produto que se vende como instalado. Fecha com
um ensaio de restauração + inclusão do storage no `backup.sh` + retenção configurável.

### 3.10 F-23 (**diagnosticado**) — a suíte grava 181 screenshots em toda rodada verde e o diff fica sujo

Medido em 17/11/2026, com experimento controlado (`contato-salva-email.spec.ts`, duas execuções,
ambas verdes):

| | sha256 | bytes |
| --- | --- | --- |
| arquivo commitado | `90069af` | 85.344 |
| run 1 | `95b6ffa` | 84.080 |
| run 2 | `88eb97e` | 83.673 |

**Três SHAs distintos para três execuções idênticas.** O conteúdo não é determinístico (fonte,
relógio, avatar), então cada rodada reescreve o arquivo e o `git status` fica sujo — que é o
sintoma do F-23.

**Mecanismo (medido):** **181** chamadas de `page.screenshot({ path: "evidence/…" })` em **54 das 100
specs**, escritas no caminho VERDE. Não há `toHaveScreenshot`, não há baseline de imagem versionado, e
**nenhuma** chamada é condicionada a falha. O `screenshot: "only-on-failure"` do
`playwright.config.ts` rege só o screenshot automático do runner, não estes `path` explícitos. Hoje:
**614 arquivos, 66 MB** em `evidence/`.

**Opções avaliadas:**

| Opção | Custo | Veredito |
| --- | --- | --- |
| fora do git | baixo | **não**: `evidence/` é convenção versionada citada em handoffs; remover apaga histórico |
| `skip-worktree` | baixo | **não**: é local ao clone, mente para o `git status` e quebra no `pull` |
| nome com data/run | baixo | **não**: aditivo — 66 MB hoje, centenas de PNGs por noite de CI |
| **baseline + gravar só em falha** | médio | **sim**: run verde não toca o arquivo (diff limpo, histórico intacto); falha grava em `e2e-artifacts/` (já ignorado) |

Fallback de custo mínimo: manter `evidence/` no git e trocar só o **alvo** das chamadas para
`e2e-artifacts/` — meia-solução, sem apagar nada.

O conserto não foi aplicado nesta rodada: são 181 chamadas em 54 arquivos e a escolha entre
"baseline comparado" e "só redirecionar" muda o que o time espera de `evidence/`. Fica diagnosticado,
com o custo medido, para decisão.

### 3.11 Cobertura E2E por tela — 156 telas, 125 literais, 15 dinâmicas, 16 sem menção

Medido em 17/11/2026 cruzando `find app -name page.tsx` (156 rotas, grupos e slots
normalizados) com o que cada uma das 100 specs realmente abre (`page.goto`,
`toHaveURL`, `waitForURL` e as listas de rotas visitadas em laço).

| Categoria | Telas |
| --- | --- |
| rota literal visitada por alguma spec | **125** |
| só por padrão dinâmico (`:id`) ou lista em laço | **15** |
| **nenhuma menção** | **16** |

As 16 sem menção: `/admin/audit/:entryId`, `/admin/inbox/:conversationId`,
`/admin/incidents/:id`, `/admin/lgpd/requests/:id`, `/admin/tenants/:id/health`,
`/admin/users/:id`, `/app/ai/routers/:id`, **`/app/campanhas`**,
`/app/expedicao/:id/fechamento`, `/app/frota`, `/app/laboratorio`, `/app/leads/:id`,
`/app/lgpd/requests/:id`, `/app/prospeccao/nova`, `/app/venda-automatica`, `/o/:token`.

**A mais incômoda era `/app/campanhas`**: é o destino de `/app/prospeccao` e concentra o
trabalho do dia (campanha + prospecção). A spec do mapa cobre a ABA Empresas; a tela, não.
Criada `campanhas-tela.spec.ts` (verde em 7,1 s): abre pela URL própria, acha o `h1`
"Campanha", alterna as duas subtelas, confere que a URL acompanha (`?subtela=prospeccao`) e
que a escolha **permanece** 2 s depois — o teste que o F-27 pedia no nível da tela.

**Limites da medição, declarados:** rota montada por variável (`page.goto(BASE + ...)`) não
é vista; `toHaveURL(new RegExp(...))` escapa da extração; e tela alcançada só por clique com
`toHaveURL` genérico pode cair em "sem menção" (candidatas: `/admin/users/:id` e
`/admin/incidents/:id`).

---

## 4. Regressão de navegador no local — smoke e critical (18/11/2026)

> Ambiente: worktree limpo a partir da `main`, app de produção (`next start`) em `localhost:3001`,
> **Supabase local** (`127.0.0.1:54321`) e seeds do `e2e.yml`. Nada aponta para produção.
> Redis/WAHA/Google não estão no ar: o rate limit cai em memória (log de fallback) e as specs que
> dependem desses serviços seguem fora do recorte (as mesmas que o CI já declara).

| Suíte | Resultado |
|---|---|
| `smoke` (`tests/e2e/suites/smoke.txt`) | **32 passed**, 0 failed (6,1 min) |
| `critical` (`critical.txt`) | **75 passed**, 0 failed (15,9 min) — depois das correções abaixo |

### 4.1 Defeitos de produto corrigidos (não eram só teste)

1. **Acessibilidade do shell (axe `label-content-name-mismatch`).** O botão de busca e o menu do
   usuário tinham `aria-label` que não continha o texto visível (`Buscar...`/`⌘K`, iniciais).
   `SearchTrigger` passou a mostrar "Buscar" e o atalho é desenhado por CSS
   (`content: attr(data-atalho)`), fora do texto que a regra mede; `UserMenu` inclui as iniciais no
   nome acessível. Provado por `rbac-roles.spec` (dois casos) e pelos unit
   `topbar-busca`/`atalho-de-busca-anunciado`.
2. **PATCH de contato com documento duplicado respondia 500.** O índice único
   `contacts_org_cnpj_key` virava `internal_error`; agora é **409 `contato_duplicado`**, a mesma
   tradução do create. Teste novo em `app/api/v1/contacts/_handler.test.ts`.

### 4.2 Specs ajustadas ao produto desta onda

- **Confirmações novas do design**: "Faturar pedido", "Emitir nota", "Sair para rota" e "Entregue"
  passaram a abrir diálogo de impacto. As jornadas 4/5/6 agora confirmam o diálogo
  (`Financeiro`, `Fiscal`, `Expedição`).
- **Fixtures únicas por execução**: CNPJ da jornada fiscal (calculado com dígitos verificadores) e
  placa da expedição deixaram de ser fixos — a segunda rodada numa base local colidia com a
  primeira (contato/CNPJ e carga ainda aberta).
- **Recompra**: o selo de atraso era `+8` fixo; passou a `+Nd` (o número depende do relógio).
- **Sentinel**: a sessão injetada era cookie de `127.0.0.1`, mas o app roda em `localhost` — hosts
  diferentes; agora registra nos dois.
- **Funis**: a lista local acumula fixtures; a prova de reordenação lê a ordem do **servidor**
  (`GET /api/v1/pipelines`) antes de recarregar a tela, e a recusa de arquivamento aceita
  `único|padrão` (com o funil de demonstração "CRM Vivo" sempre ativo, `único` não é alcançável
  no Supabase local).

### 4.3 Prova de UI que faltava (J6, J13, J14)

`tests/e2e/jornadas-ui-p1-01.spec.ts` roda no navegador contra o servidor local:

| Jornada | O que a tela prova |
|---|---|
| **J6** | abrir a conversa, clicar "Fechar", confirmar no diálogo e ver o selo **Fechada**; o botão some |
| **J13** | 502 interceptado no `POST /fiscal-entradas` → erro visível e botão reabilitado → **segundo clique sincroniza** ("1 nova(s)…") |
| **J14** | aprovar a solicitação de LGPD com justificativa → toast e status **Processando**; **exportar** a trilha e baixar o CSV com o cabeçalho esperado |

Evidências: `docs/auditoria/evidencias/jornadas-ui-2026-11-18/` (4 capturas + o CSV exportado).
A anonimização em si não tem botão na tela (é rota/worker) — a prova dela é
`tests/unit/j14-lgpd-anonimizar.test.ts`; a tela prova o passo que a dispara.

**Limitações declaradas:** nada foi executado em produção; WAHA/Redis/Google não participam
destas specs; APK/iOS seguem fora deste recorte.

### 4.4 A prova de navegador entra no gate da `main` (19/11/2026)

`tests/e2e/jornadas-ui-p1-01.spec.ts` já estava em `SPECS_PARTE_2` — rodava, portanto, na suíte
`full` (noturna/dispatch). Este incremento a declara **também** em
`tests/e2e/suites/critical.txt`, a suíte do `push` na `main` (e do `e2e-pos-deploy`). O `smoke`
continua sem ela de propósito: quatro testes com dois seeds e três logins encarecem o ciclo de PR
e não acrescentam cobertura sobre o que a `critical` já roda.

Duas execuções **consecutivas**, contra `next start` de produção e o Supabase local, sem reseed
entre elas (a prova de que os seeds são idempotentes):

```console
$ E2E_PORT=3017 pnpm exec playwright test --workers=1 tests/e2e/jornadas-ui-p1-01.spec.ts
  4 passed (3.4m)
  4 passed (4.3m)
```

Duas fontes de flutuação foram **reproduzidas** e corrigidas com causa — nenhuma foi rotulada de
"flaky":

1. **Login com MFA em banco compartilhado.** `loginComoAdmin` esperava só `/login/mfa`. Com duas
   sessões no mesmo Supabase local, o seed de credenciais reenrola o TOTP no meio da execução e
   o fator fica `unverified` (confirmado por `auth.admin.getUserById(...).factors`); a partir daí
   o login cai direto em `/app` e a espera estourava 30 s — 3 de 4 testes, medido. O helper agora
   aceita os **dois** desfechos e, se a tela de MFA sumir (volta para `/login`), devolve `false`
   para o retry que já re-semeia as credenciais. No CI a corrida não existe (o seed roda uma vez
   por job), e quem prova MFA continua sendo `auth`/`reset-password-mfa` — o helper só quer uma
   sessão.
2. **O selo do J6 não discriminava.** `getByText("Fechada")` sem `exact` casava também a aba de
   filtros "Fechadas", que está sempre na tela: o teste passava com a conversa ainda **Aberta** e
   só reprovava na linha seguinte. O trace do run vermelho mostrou o `POST /close` ainda em voo
   aos 5 s (timeout default do `expect`) sob carga. Agora o selo exige `exact: true`, o diálogo
   tem de sair de cena e o botão tem 30 s para sumir — com a conversa aberta, a asserção reprova.

Os dois gates que cobram a declaração ficam verdes com a mudança:
`tests/unit/e2e-cobertura-completa.test.ts` (a spec já estava em `SPECS_PARTE_2`) e
`tests/unit/e2e-suices-aderentes.test.ts` (`smoke ⊆ critical ⊆ full`, e `full` continua igual a
`SPECS_PARTE_1 ∪ SPECS_PARTE_2`).

