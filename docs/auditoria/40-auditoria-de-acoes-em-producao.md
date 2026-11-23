# 40 — Auditoria das ações em produção (18–19/11/2026)

> Este documento existe porque o programa AAA tocou produção em cinco ocasiões. Cada
> linha diz **o que** mudou, **sob qual autorização**, **qual backup** existe,
> **impacto** medido e **como reverter**. Sem isso, "corrigi em produção" é relato,
> não auditoria.

Ambiente em todas as linhas: VPS `vps` (200.141.17.185), projeto `crm`, Postgres
`supabase_db_selfhost`, app em `https://crm.billhigiene.tech`.

---

## 0. Autorização permanente de deploy (20/11/2026)

**Frase do dono, palavra por palavra:** *“pode sempre! grave isso”*.

**Data:** 2026-11-20. **Contexto:** depois de 1.56.0 → **1.61.1** em produção, todas
verificadas (containers, `/health`, funções, `to_regclass`).

**Escopo autorizado — e só ele:** **deploy de versão publicada** (tag `v*` com as
imagens construídas pelo CI) em produção, pelo caminho do kit:

```bash
bash hostgator-setup-kit/update.sh --to vX.Y.Z
```

**Continua exigindo autorização explícita (caso a caso):**

- **operação fiscal** — emitir, cancelar, inutilizar, manifestar NF-e;
- **operação financeira** — baixa, estorno, ajuste de recebível/pagamento;
- **mudança de configuração de provedor** — WAHA, Mercos, e-mail/Resend;
- **exclusão de dados** (qualquer tabela, qualquer volume);
- **migration destrutiva** (drop/truncate/coluna removida);
- **qualquer ação que não seja “subir a versão publicada”**.

**O que a autorização NÃO dispensa:** backup antes (`update.sh` já faz — não usar
`--skip-backup`), aplicar schema pelo `update.sh` (**nunca** `docker compose` na
mão), **verificação com números** depois (containers, `/health`, tabelas/funções
da versão), **rollback armado** (versão anterior refixável) e **registro neste
documento como item novo**. **Autorização para agir não é dispensa de prova.**

---



## 1. NF-e 4655 rejeitada (SEFAZ 176) → 4656 autorizada

| Campo | Valor |
|---|---|
| **Autorização** | Dono, no chat: *"primeiro corrija essa nota no sistema, depois corrija a causa"* e depois *"corrija essa nota dentro da vps"* |
| **O que mudou** | Sidecar fiscal da VPS passou de **1.55.0 → 1.56.0** (só esse serviço). Depois: `fiscal_jobs` ganhou um job `emitir pendente` e a nota `em_emissao` foi retomada |
| **Causa** | O sidecar 1.55.0 emitia o grupo `<entrega>` **sem IE do local de entrega** → rejeição 176. A 1.56.0 não emite o grupo (endereço vai em `<enderDest>`) |
| **Backup** | `/var/backups/nexus/pre-fix-4655-20261118-180013.sql` (tabelas `invoices`, `fiscal_jobs`, `fiscal_events`, `commercial_orders`, `catalog_products`) |
| **Resultado** | **NF-e 4656 autorizada** — cStat 100, chave `42261135233142000183550010000046561587828417`, protocolo `242260558007288`, R$ 440,00, pedido 19681 |
| **Numeração** | 4655 não foi reutilizado: o número que a SEFAZ viu numa rejeição não volta (prática fiscal) |
| **Reversão** | Refixar `FISCAL_IMAGE` em 1.55.0 e `up -d fiscal`. A nota autorizada **não** se reverte por deploy |

---

## 2. Limpeza do literal `NULL` em endereços de contato

| Campo | Valor |
|---|---|
| **Autorização** | Dono: *"corrija para nao acontecer mais"* |
| **O que mudou** | `contacts.logradouro` e `contacts.bairro` tiveram o token `NULL` removido (o export do WP/Mercos grava a ausência como texto) |
| **Escopo** | **84 cadastros** (51 na rua, 36 no bairro; 3 com os dois). Restaram **0** |
| **Backup** | tabela `public._bkp_null_addr_20261118` (84 linhas com os valores originais e `copiado_em`) |
| **Impacto** | Nenhum dado apagado além do token; endereço reconstruído com `regexp_replace` + `btrim`. A NF-e 4656 saiu com a rua limpa |
| **Reversão** | `update contacts set logradouro = b.logradouro, bairro = b.bairro from _bkp_null_addr_20261118 b where b.id = contacts.id` |
| **Código** | PR #554 — o construtor do destinatário passou a usar o mesmo limpador do formatador de endereço, com teste que reprova o literal no payload |

---

## 3. Schema: 0322 e 0326/0327 aplicados manualmente

| Campo | Valor |
|---|---|
| **Autorização** | Dono: *"quero que edite deiramente no sistema em producao"* / deploy da 1.58.0 aprovado |
| **O que mudou** | `0322` (`offline_devices`) aplicada à mão porque o baseline abortava antes dela; `0326` (devolução não concorre com a venda) e `0327` (`search_path` vazio) aplicadas para o baseline fechar |
| **Motivo do aborto** | `invoice_orders` recusava o backfill: o pedido 19560 tem venda (4634) **e devolução** (4644), e a trava da 0315 tratava as duas como duplicidade |
| **Backup** | `/var/backups/nexus/pre-1.55.0.dump` (pré-deploy) + dump do deploy da 1.58.0 (`upload.sh` do kit) |
| **Verificação** | baseline completo com `ON_ERROR_STOP`: **0 erros**; `to_regclass` das 6 tabelas novas = `t`; as duas funções de trigger contêm a regra de `finalidade` |
| **Idempotência** | as três são `create ... if not exists` / `create or replace`; reaplicar não altera |
| **Código** | PR #566 (0315 corrigida no bloco + apêndices 0326/0327) e #568 (o `update.sh` passa a **falhar alto** em DDL, em vez de seguir `healthy` com schema pela metade) |

---

## 4. Suspensão das organizações de teste (E2E)

| Campo | Valor |
|---|---|
| **Autorização** | Dono, escolha explícita entre opções: *"Suspender agora, apagar depois"* |
| **Motivo** | A produção continha **9 organizações de teste** (`E2E Test Org`, `Loja E2E Recovery`, …). Uma delas tinha **62 contatos**, **7 jobs `dead`** e uma credencial de IA **corrompida** (`tag_len = 1`), que gerava `Invalid authentication tag length` e abria alerta **crítico** no Sentinel |
| **O que mudou** | `suspended_at = now()` + `suspended_reason` + `updated_at` nas **9** — nada apagado |
| **Backup** | `public._bkp_orgs_teste_20261119` (9 linhas com estado anterior) |
| **Impacto** | Login dessas organizações bloqueado; **23 ocorrências do Sentinel** eram 20 delas + 3 da organização real |
| **Reversão** | `update organizations set suspended_at = null, suspended_reason = null from _bkp_orgs_teste_20261119 b where b.id = organizations.id` |
| **Pendente** | **Remoção definitiva** dos dados de teste — aguarda janela do dono. Não foi feita |

---

## 5. Deploy 1.57.0 e 1.58.0

| Versão | Autorização | Backup | Verificação |
|---|---|---|---|
| **1.57.0** | Dono escolheu *"Cortar e deployar"* | uploads + dump do kit | 7 containers `healthy`, `/health` 200, `to_regclass` das tabelas |
| **1.58.0** | mesma autorização, release seguinte | idem | 7 containers em 1.58.0, health 200 com `version 1.58.0`, 6/6 tabelas, funções da correção |

Rollback de ambas: refixar as tags no `.env` (`APP_IMAGE`, `WORKER_IMAGE`, …) para a versão anterior e `up -d`. O kit grava as tags **antes** de trocar as imagens.

---

## 7. 19/11/2026 — Catálogo do Mercos aplicado (coleta, catálogo e pareamento)

**Autorização:** dono, 19/11/2026 ("pode"). **Escopo:** organização `4bc721ce…`
(Bill Higiene), container `crm-mercos-1`, imagem **1.59.0** — nesta execução o
código da `main` foi copiado para `/app/_fix`, porque o `origem` no upsert ainda
não estava no artefato oficial.

| # | Ação | Resultado medido |
|---|---|---|
| 1 | `produtos.mjs --todos` | **847 produtos**, 57 páginas, total do ERP 847 |
| 2 | `catalogo.mjs --aplicar` | lidos 847 · **55 criados** (inativos) · **567 atualizados** · 34 divergentes · 210 sem código · **622 gravados** |
| 3 | `parear-itens.mjs --aplicar` | **616 → 194** pareados por código; restantes **422**; 46 códigos sem produto; 9 ambíguos não aplicados |

**Catálogo depois:** 1.196 produtos (1.139 ativos / 57 inativos), 799 com
`origem='mercos'`.
**Reversão:** criados têm `origem='mercos'` e `created_at` do dia → desativar, nunca
apagar; pareamento é `product_id` com lista no relatório; dump pré-deploy cobre.

## 8. 19/11/2026 — Deploy 1.60.0 e a prova do `origem` no artefato oficial

**Autorização:** dono. **Ação:** `update.sh --to v1.60.0`.

| Verificação | Resultado |
|---|---|
| Containers | **7 em 1.60.0** |
| `/health` | `healthy`, `version 1.60.0` |
| Checks | supabase, redis, rate_limit, waha — ok |
| `/login` | 200 |
| Tabelas | presentes |

**Prova do `origem` sem cópia manual** (imagem 1.60.0): coleta `--todos` = **847
lidos / 57 páginas / total do ERP confere**; dry-run do catálogo **sem erro**:
`criados 0 · atualizados 622 · divergentes 34 · sem código 210`. O caminho que
estourava `null value in column "origem"` completa no artefato oficial.

**Isso fecha** o item "a importação depende de cópia manual" e o `[!]` do catálogo.

**Reversão:** refixar as três imagens em `1.59.0` no `.env` e `up -d` com os dois
`-f`; baseline é aditivo.

**Rollback:** refixar 1.59.0; banco não é revertido (aditivo).

## 9. 20/11/2026 — Deploy 1.61.0 — pedido, autorização e execução

**Autorização:** o dono respondeu "continue" à lista de pendências em que o deploy
da 1.61.0 era a única ação de produção; o processo é o mesmo das versões 1.59.0 e
1.60.0 por ele aprovadas. Registrado como autorização interpretada, com esta nota.

**Ação:** `update.sh --to v1.61.0` (backup automático do `update.sh` antes do schema).

| Verificação | Estado |
|---|---|
| `/health` durante a execução | **1.60.0** às 2026-11-20T01:51Z |
| Verificação final | **consolidada no item 10** (feita depois que o deploy subiu) |

Comandos da verificação (rodar na VPS, com a conexão de schema):

```bash
psql "$SUPABASE_DB_ADMIN_URL" -Atc \
  "select to_regclass('public.api_request_samples'), to_regprocedure('public.fn_slo_api_rotas()'), to_regprocedure('public.fn_api_metricas_expurgar()')"
curl -s https://<dominio>/api/v1/health | jq '.data.version'
```

**Sentinel (próxima rodada da org real):** conferir `sentinel_runs.truncado = f` e
que a ocorrência `fiscal.nota_duplicada_por_pedido` (última vista 09:15) esteja
**encerrada** com `nao_detectada_na_execucao`; se não, abrir bug com a evidência.

**Rollback:** refixar as três imagens em `1.60.0` no `.env` e `up -d` com os dois
`-f`; schema é aditivo.

## 10. 20/11/2026 — Deploy 1.61.0 — verificado em produção

| Verificação | Resultado |
|---|---|
| Containers | **7 em 1.61.0**, healthy |
| `/health` | `version 1.61.0` |
| `to_regclass('public.api_request_samples')` (0330) | **presente** |
| `fn_slo_api_rotas` / `fn_api_metricas_expurgar` (0331) | **presentes** |
| `/login` | 200 |

**Pendência aberta (medição honesta):** a série do SLO ainda estava com **0
amostras** 35 min após o deploy; o teste com `GET /api/v1/contacts` **sem auth**
morreu em **401 na borda** e não alcançou o handler — logo não prova nada. O G
investiga `after()` no standalone e vai expor contagem/última amostra na tela.

## 11. 20/11/2026 — Deploy 1.61.1 — verificado (fecha)

**Ação:** `update.sh --to v1.61.1` → *"Atualização concluída — app no ar e saudável"*.

| Verificação | Resultado |
|---|---|
| Containers | **7 em 1.61.1**, todos healthy |
| `/login` | 200 |
| `/api/v1/health` | `healthy`, `version 1.61.1`; supabase/redis/rate_limit/waha ok |

**Sentinel — rodada forçada na org real `8fb7a21a-3f48-4856-b83c-68d4abdef232`:**

```
status=sucesso  achados=20  criadas=0  reafirmadas=20  ENCERRADAS=2
truncado=FALSE  coletas_truncadas=[]  falhas=0  limite=500
```

**As duas encerradas são os dois falsos positivos:**
`fiscal.divergencia_valor_nota` (nota que agrupa dois pedidos) e
`fiscal.nota_duplicada_por_pedido` (venda + devolução, finalidade 4). As quatro
exigências do item anterior foram cumpridas.

**Série do SLO viva:** primeira amostra real
`/api/v1/commercial-orders · 200 · 1428 ms · 03:51Z`. A hipótese de `after()`
quebrado estava **errada** — era ausência de tráfego. A defesa de escrita que o G
adicionou fica como **seguro**, não como conserto de bug.

**Nota honesta:** **1428 ms numa única amostra não é p95**; não dá para afirmar
violação do alvo de 800 ms. Fica como sinal para olhar quando houver série.

## 12. 20/11/2026 — Correção de registro: não existia divergência de R$ 42

**O que foi reportado (errado):** "divergência fiscal/financeira: pedido 19594
R$ 92,00 × NF-e 4629 R$ 134,00 (+R$ 42,00)". Isso **não** era diferença de
dinheiro.

**Medição read-only em produção:**

```
pedido 19594  total 9200
pedido 19597  total 4200
NF-e 4629     total 13400   (autorizada, cStat 100)
invoice_orders: NF 4629 → DOIS pedidos
9200 + 4200 = 13400  ← fecha exatamente
```

A nota **agrupa dois pedidos**, o que é legítimo. O detector
`fiscal.divergencia_valor_nota` comparava o total da nota com **um** pedido
(`order_id`) e ignorava os vínculos de `notasPedidos` — daí o falso positivo.

**Lição (mesma família da devolução):** **detector que assume 1:1 erra em
agrupamento**, e o custo é o dono investigar dinheiro que não sumiu. Toda regra
que liga nota a pedido precisa somar **todos** os vínculos — e a varredura de
outras regras 1:1 faz parte da fatia do G.

**Correção do detector:** somar os pedidos vinculados, corrigir a evidência e
cobrir com 5 casos de teste (um pedido, dois pedidos, três, nota sem vínculo e
valor realmente divergente).

## 13. 20/11/2026 — Correção: o caso 19560 é venda + devolução, não duplicidade

**O que foi reportado (errado):** duas NF-e autorizadas para o mesmo pedido 19560
seriam "faturamento declarado em dobro".

**Medição corrigida no banco:** a **NF 4634** é a **venda** (`finalidade = 1`); a
**NF 4644** é **devolução** (`extras_fiscais.finalidade = 4`, com `ref_nfe`
apontando a original). O par venda + devolução é **comportamento correto** — não
há nota duplicada nem valor em dobro.

**Lição:** **ocorrência cuja evidência não carrega a natureza fiscal é ilegível**
— e levar a conclusão errada é fácil (o próprio coordenador levou). Toda evidência
de `fiscal.nota_duplicada_por_pedido` precisa mostrar **finalidade** e
**`ref_nfe`** das notas envolvidas; sem isso, o detector é ambíguo para quem lê.

**Efeito no detector:** a regra já ignora finalidade 4; o que mantinha a
ocorrência aberta era o **truncamento** da varredura (corrigido no #661). Por
isso a exigência pós-deploy é **encerrá-la**, não mantê-la aberta.

## 14. 20/11/2026 — `operacao.pedido_preso`: ruído e hipótese derrubada

Medido: **121 rascunhos** com mais de 7 dias; **120 com o mesmo `updated_at`**
(2026-11-09 19:38:13.052684), 20 com `total_cents = 0`, e **121 com
`updated_at > created_at`** — ou seja, "nunca editado" não discrimina, porque um
backfill tocou todos. A assinatura de operação em lote é o timestamp idêntico, e
isso é frágil como regra.

As três opções medidas (a/b/c) e o custo de cada uma estão em
[`../business-rules/pendencias-do-sentinel.md`](../business-rules/pendencias-do-sentinel.md).
**Nada foi implementado**: o detector segue como está, e a escolha é do dono.

## 15. O que continua aberto (20/11/2026, com dono)

| Item | Número | Natureza | Dono | Ação |
|---|---|---|---|---|
| `operacao.lead_duplicado` | **5** | **reais** (mesmo contato, dois leads abertos; contatos sem nome) | Dono/operação | mesclar — não é bug |
| `operacao.pedido_preso` | **15** | ruído de operação em lote (120 rascunhos com o mesmo `updated_at`) | Dono | decisão a/b/c em `business-rules/pendencias-do-sentinel.md` |
| p95 da API | 1 amostra (1428 ms) | sinal, não medição | G | aguardar série antes de afirmar alvo |

## 16. 20/11/2026 — Observação comercial: R$ 218 mil em orçamentos parados no Mercos

**Não é alerta, não é bug.** Medição read-only em produção:

```
124 rascunhos origem='mercos'
R$ 218.003,63 no total
primeiro 2024-10-23 · último 2026-11-19 (ontem)
0 com previsão de entrega
```

`workers/mercos/status.mjs:44` mapeia `"Em orçamento": "rascunho"`: esses rascunhos
são **orçamentos abertos no ERP**, espelhados aqui — não lixo de importação. Por
isso `operacao.pedido_preso` passa a abrir só com **autor humano**
(`created_by IS NOT NULL`): orçamento do ERP não é trabalho abandonado pelo nosso
operador.

**Superfície proposta (não implementada):** “**Orçamentos parados**” — lista com
**idade**, **valor** e **próximo passo** por orçamento (cobrar, expirar, converter
em pedido). É o 7º invariante pedindo: nenhuma demanda sem próximo passo. Decisão
de construir é do dono; nada foi implementado.

## 17. O que este documento **não** cobre

- Operações fiscais de **cliente** (emissão, cancelamento, inutilização) fora da 4655/4656 — nenhuma foi feita.
- Nenhum pagamento, cobrança ou comunicação externa foi disparado.
- Nenhum dado de cliente real foi apagado; a única exclusão de dado foi o token `NULL` do endereço, com backup.

> Regra que passa a valer: **toda ação em produção entra aqui no mesmo dia**, com
> autorização, backup, impacto e reversão. Ação sem linha neste documento é ação sem
> auditoria.

## 17. 21/11/2026 — Achado: rota responde HTTP 200 com `estado: "erro"` e a tela nunca avisa

**Medido pela prova visual do D:** quando o provedor de geocodificação caía, o
`POST /api/v1/.../rota/otimizar` respondia **HTTP 200** com `estado: "erro"` **por
parada**. O `catch` do cliente nunca disparava — porque não houve erro HTTP — e o
**banner de falha nunca aparecia no caso mais comum** (provedor fora do ar).

**Por que é grave:** falha silenciosa é o pior estado do Sistema Vivo — a pessoa
acha que a rota otimizou, e cada parada ficou sem coordenada. O caminho de erro
existia, mas era inalcançável justamente no cenário que ele deveria cobrir.

**Correção (#693, só cliente):** o cliente passou a tratar `estado: "erro"` por
parada como falha visível (banner), além do erro HTTP. Sem mudança de regra de
negócio e sem migration.

**Lição:** **status HTTP não é o contrato.** Quando o corpo carrega estado, o
cliente precisa olhar o estado — e a prova visual tem de exercitar o provedor
morto, não só o caminho feliz.


## 18. 21/11/2026 — LAYA ligado e quebrado: motor ausente (decisão do dono)

**Medido nos logs de produção:**

```
LAYA_URL=http://laya:8000   (definido)
LAYA_API_KEY                (definido, 64 chars)
serviço "laya" em execução  (NÃO EXISTE)

6 horas de logs:
  [prospeccao] motor de qualificação indisponível ... 50×
  [risk-watcher] motor de decisão indisponível ...... 17×
  [radar] motor de decisão indisponível ............. 17×
  erro: fetch failed → http://laya:8000/v1/systemone/batch
```

**Consequência:** a sugestão de ação do Radar e a qualificação automática de
prospects **não funcionam** — e a tela mostra “sem sugestão”, como se não houvesse
nada a sugerir. O `.env.example` promete que, sem `LAYA_URL`, o recurso fica
**desligado e nada mais muda**; aqui ele está **ligado e quebrado**, que é o pior
dos dois estados.

**Duas opções (decisão do dono; ambas reversíveis e nenhuma toca dado):**

| Opção | Efeito | Custo |
|---|---|---|
| **(a) subir o `laya-serve`** na mesma VPS, na rede interna como o `.env.example` manda | funcionalidade volta (Radar sugere, prospecção qualifica) | mais um container; inferência em CPU; a conversa sai do banco para o serviço local |
| **(b) limpar `LAYA_URL`** | desliga limpo: para de tentar 17×/15 min e a tela diz que está desligado | sem sugestão automática |

**Nota para o relatório da manhã:** são **dois problemas diferentes no mesmo
radar** — o `URI too long` (corrigido no **#695**) e o **motor ausente** (decisão
acima). Sem separar os dois, parece que o fix do #695 resolveu o radar inteiro.

## 19. 21/11/2026 — #691 entra com `ORDER_STOCK_ATOMIC=false`

A baixa atômica de estoque (**#691**) entra na release com a **flag desligada**:
a função `fn_criar_pedido_com_estoque` é criada, mas o caminho de criação **não
usa** a RPC enquanto `ORDER_STOCK_ATOMIC=false`. O dono liga depois de ver o
`test:db` rodando em produção.

**Consequência:** comportamento atual preservado (baixa fora da transação, falha
no log) até a flag ser ligada; a função existe para ser provada antes de virar
caminho. **Reversão:** desligar a flag (já desligada) ou remover a função em
migration futura.

## 20. 21/11/2026 — O número é 1.62.0, não 1.61.2 — e isso é a doutrina funcionando

**Fato:** o corte derivou **`v1.62.0`** (tag no commit `3866cf4e`), não o patch que
o pedido inicial supunha. **Decisão do dono: 1.62.0 fica.**

**Justificativa:** existe **um fragmento `capacidade_nova`** na release — a
`observabilidade-sonda`, o endpoint interno que prova o instrumento de medição.
Os outros 14 são `nada_mudou`. Pela doutrina (`docs/doctrine/versionamento.md`), o
número é **calculado** do que os PRs declararam, nunca digitado: reclassificar a
sonda para `nada_mudou` só para virar 1.61.2 seria **mentir no CHANGELOG** — e o
CHANGELOG é a tela que o dono da VPS lê para decidir atualizar.

**Lição:** quando o número derivado diverge do número esperado, o defeito está na
classificação dos fragmentos, não no cálculo. Corrigir o cálculo (ou o rótulo) para
bater com a expectativa é o erro; corrigir o fragmento **se** ele estiver errado é
o caminho.

**Conteúdo da 1.62.0:** radar fatiado (#695/#697), motor mudo visível (#700),
rotas (banner + diferença pós-publicação, #693/#698), reprecificação (#687),
estoque atômico **com `ORDER_STOCK_ATOMIC=false`** (#691), harness E2E (#701) e os
quatro fragmentos que faltavam.

## 21. 21/11/2026 — Deploy 1.62.0 verificado (verde) e a regressão do embed no Sentinel

**Verde (verificado pelo dono):**

```
7 containers em 1.62.0 · /health healthy 1.62.0 · /login 200
api_request_probes ............... existe
fn_criar_pedido_com_estoque ...... existe
anon pode executar ............... false
pedido_preso 15 → 0 detectados, 15 ENCERRADAS (121→1 na vida real: só o com autor)
```

**Vermelho — regressão do #672, não do deploy:**

```
coletas_truncadas: ["leads_abertos"]
falha: "Could not embed because more than one relationship was found
        for 'crm_leads' and 'crm_stages'"
```

O embed `crm_stages(name)` que o #672 adicionou é **ambíguo** (duas FKs entre as
tabelas) → a coleta `leads_abertos` falha → **`operacao.lead_duplicado` está
cego**: não detecta novo nem resolve os 5 abertos. As 5 ocorrências **não** foram
encerradas (o mapa de fontes funcionou), mas o detector não roda.

**Lição:** **embed sem hint de FK em tabela com duas FKs é falha silenciosa de
coleta** — o teste de unidade não pegou porque **mocka a consulta**. O que prova
coleta é a varredura real com `coletas_truncadas = []`.

**Correção:** G no fix (hint de FK explícito + teste que falharia antes + varredura
dos outros embeds); entra na **1.62.1** (patch — conserto de regressão nossa, nada
muda para quem roda).

**Verificação esperada da 1.62.1:** `coletas_truncadas = []`, `leads_abertos` sem
falha e os **5 leads reafirmados**.

## 22. 21/11/2026 — Três consertos provados em produção (1.62.0)

```
URI too long (40 min) ................. 0   ← eram 16 a cada 6h
falhas do risk-watcher (40 min) ....... 0
incidente laya.motor_indisponivel ..... criado (open, 2 orgs)
pedido_preso ......................... 15 encerradas, 0 reabertas
anon executando fn_criar_pedido ...... false
```

Três consertos no mesmo deploy: fatiamento do radar (#695/#697), `pedido_preso`
por autor (#670) e motor de IA visível (#700). **Lição:** teste unitário que mocka
a consulta não pega ambiguidade de embed — só o PostgREST real pega (#712).

## 23. 21/11/2026 — Deploy 1.62.1 — regressão do embed fechada

`update.sh --to v1.62.1` → *"Atualização concluída — app no ar e saudável"*.
Backup: db **20M** + waha + uploads (11:47).

| Verificação | Resultado |
|---|---|
| Containers / health / login | **7 em 1.62.1** · healthy 1.62.1 · 200 |
| `coletas_truncadas` / `falhas` | **[]** / **[]** |
| `operacao.lead_duplicado` | **5 reafirmadas** (vivas, 11:51) |
| `risk-watcher` (70 min) | `URI too long` **0**, falhas **0** |

Execução Sentinel `3248b21d`: `achados=5 · reafirmadas=5 · encerradas=0 ·
truncado=FALSE`. **Rollback:** refixar 1.62.0 (sem migration nova).

## 24. 21/11/2026 — Cobertura inflada: o instrumento contava o que não mediu

**Achado na conferência do `medidas.json` (1621 linhas) da matriz:**

```
368 medidas · 27 sem url ou sem h1
6 rotas dinâmicas ([id]) × 4 combinações = 24 entradas com URL VAZIA,
  registradas como overflow 0 / axe 0  ← nunca visitadas
3 páginas sem h1: /titulos · /ai/providers · /ai/runs
cabeçalho do arquivo diz "rotas": 2  ← bug do gerador (são 92)
```

O PR declarava “4 rotas puladas com motivo”, mas o artefato contava **6 como
medidas**. O placar “368 medições / 104 de 110” estava **inflado em 24**.

**Lição:** **cobertura inflada por instrumento que registra zero onde não olhou é
pior que cobertura baixa** — ela produz um placar que ninguém questiona. Já
aconteceu com a suíte E2E (8 falhas de infraestrutura), com a série do SLO (0
amostras) e agora com a matriz.

**Correção (D):** a varredura não grava resultado vazio; recálculo; dinâmicas
voltam a `pendente`; investigar as 3 sem `h1`; consertar o cabeçalho. **#726
bloqueado** até o número bater.
## 25. 21/11/2026 — Varredura corrigida: 368 → 341 válidas, e o que ficou de fora tem motivo

Depois da correção do D, o artefato da matriz passou a dizer a verdade:

```
rotas: 92 · medidas: 368 · válidas: 341 · inválidas: 27 (com motivo)
overflow/axe: nulos nas inválidas
```

**O que mudou:** a varredura passou a distinguir **“medido com zero problemas”** de
**“não medido”**. As **24 entradas de rotas dinâmicas sem id** e as **3 falhas de
instrumento** saíram do placar (368 → 341); antes, contavam como cobertura.

**Duas práticas que passam a valer para D e G:**
1. **Esperar o `h1` com timeout** antes de declarar falha de primeiro paint — mesma
   lição do esqueleto do estoque: ausência observada cedo demais não é ausência.
2. **Redirect não é tela**: `/titulos → /financeiro` entra como `redirect`, medido no
   **destino**.

## 26. 21/11/2026 — Janela de ~20 min de `main` vermelha no passe de `settings`

**Medido:** quatro PRs de frentes diferentes (**#733 D, #736/#737/#738 G**) falhavam
**os mesmos três testes** de configuração de notificação:

- `controle-decorativo` — botão sem `onClick`;
- `permissao-lida-no-primeiro-render` — permissão concedida e interruptor nascendo
  desabilitado;
- push desabilitado sem VAPID — “conserto exagerado”, que tira o aviso com a aba
  aberta junto.

Falha idêntica em branches independentes parecia “regressão na main”. **A medição
corrigiu:** a `main` **não está vermelha agora** — os três testes passam 9/9. O que
houve foi uma **janela de ~20 minutos**: o **#732** (passe de `settings`) quebrou os
três, o **#739** consertou (`96f59378f`), mas **#736/#737/#738** foram **cortados
dentro da janela** e carregaram o defeito.

**Custo:** 4 PRs parados, uma rodada perdida e todo mundo re-testando o mesmo.
Correção no **#740** (`fix(settings): destrava o verify da main em dois gates
alheios`).

**Lição (a causa, não o sintoma):** **PR cortado de `main` vermelha carrega o
vermelho**. Quando a `main` quebrar, quem tem PR aberto precisa **rebase** — não só
esperar o conserto; e quem quebrou conserta **antes** de qualquer outra coisa.
Rodar o teste dirigido antes do push encurta a janela.

## 27. 21/11/2026 — Deploy 1.62.2 verificado (exit 124 do stream não é falha)

`update.sh --to v1.62.2` → concluído. **7 containers em 1.62.2**, 18 healthy,
`/api/v1/health` `healthy 1.62.2`, `/login` 200.

```
URI too long (60 min) = 0            ← radar continua sadio
Sentinel: achados=5 · reafirmadas=5 · truncado=false   ← os 5 leads reais seguem vistos
```

**Sem migration nesta versão** → rollback é só refixar **1.62.1**.

**Nota operacional para o próximo operador:** o comando saiu com **exit 124**
(timeout do stream SSH), mas o `update.sh` **terminou** — verificado: zero
`update.sh` rodando, 7 containers na versão, health ok. É o mesmo comportamento do
stream visto na **1.60.0**; **não** é deploy parcial. Conferir o servidor antes de
concluir falha.

## 28. 21/11/2026 — Achado de ferramenta: “8 s/rota” media só o tempo

A varredura de `app/app` escalava em **tempo** (8 s/rota) mas não em **memória**:
estourou em ~70 de 99 rotas (swap 6,6 GB) e quase apagou a varredura inteira. O D
abortou a fatia, matou servidor/Chromium e o swap voltou a 2,0 GB.

**Lição:** **métrica incompleta é uma forma de mentira.** “8 s/rota” descrevia só o
tempo; o limite real era **memória por rota**. O instrumento passa a gravar o
artefato por fatia de 10 rotas, liberar buffers e matar o servidor entre fatias.

## 29. 21/11/2026 — Deploy 1.62.3 verificado; sinal do observador ≠ estado do observado

`/tmp/deploy-1623.log`: *"Atualização concluída — app no ar e saudável"*.

```
7 containers em 1.62.3 · 18 healthy
/health healthy 1.62.3 · /login 200
URI too long (60 min) = 0 · risk-watcher falhas (60 min) = 0
Sentinel: achados=5 · reafirmadas=5 · truncado=false
```

**Lição operacional:** o **exit 124** do SSH não foi falha — o `update.sh` terminou no
servidor e o health responde 1.62.3. O comando agora grava o log em arquivo na VPS
e lê o `EXIT` de lá: **sinal do observador ≠ estado do observado**. Timeout do stream
não é timeout do deploy; conferir o artefato antes de declarar falha parcial.

**Sem migration nova nesta versão** (rollback = refixar 1.62.2).


## 31. 23/11/2026 — pré-deploy da 1.63.0 (preparado, NÃO executado)

O deploy desta versão leva as **migrations 0335** (ordem e versão da rota na mesma
transação) e **0336** (`rota_versao_confirmada` + `rota_confirmada_em` em
`shipments`, escrita com CAS pelo aceite no aparelho), além do apêndice **0337**
(orçamento de campanha e gasto de mídia lançado à mão). São apêndices idempotentes
no `baseline.sql`; o `update.sh` reaplica o baseline inteiro. Rollback de imagem
**não** reverte DDL — ver §30 e o runbook. **Deploy é do dono**, com backup,
verificação e rollback.


## 32. 23/11/2026 — Correção da campanha `3a0909d6` (ação do dono, autorizada)

**Autorização:** pedido direto do dono. **Backup:** `_bkp_campanha_3a0909d6_20261123`.

**Diagnóstico medido:** 5.295 empresas nas 10 cidades; **356** casam as 18
categorias **só ignorando maiúsculas** — a criação usou comparação **exata**
(`"posto de combustível"` ≠ `"Posto de combustível"`); 284 `revisar` (excluídas
por regra), 693 sem telefone, 0 opt-out → **282 elegíveis**; **89** em outra
campanha, bloqueadas pelo trigger `prospect_em_outra_campanha`.

**Escrita:** `prospect_ids` = **193** empresas elegíveis e livres (as 89 ficaram
de fora). Status segue **`rascunho`** — **0 mensagens enviadas**. Impacto: 193
empresas, 10 categorias, 0 envios. **Sem escrita financeira/fiscal.**

**Reversão:** restaurar `prospect_ids` do backup (valor original: `{}`).

**Lição:** *matching de categoria case-sensitive fez campanha nascer vazia e
ninguém viu* — nenhum erro na tela, só zero resultados. O **F** corrige no mesmo
PR do **P1-28**. As 89 empresas dependem do P1-28 (multi-campanha).

## 33. 23/11/2026 — Prazo da expedição e congelamento

**Prazo do dono:** expedição pronta e no ar até **07:00**; **alvo de tag 05:30**
(deploy e verificação até 06:30). Congelamento de **features** até o corte:
F e G realocados para expedição/E2E; só entram PRs de expedição. D fecha P1-3,
G fecha P1-24; o corte leva o que estiver verde — **não espera o E2E inteiro**.

**Migrations desta versão:** **0335** (ordem/versão da rota na mesma transação),
**0336** (`rota_versao_confirmada` + `rota_confirmada_em`) e apêndice **0337**
(orçamento de campanha, gasto manual de mídia). Ver §31.

**Depois do deploy:** P1-28, orçamentos parados, Inbox/Dashboard, `.in()`,
`anon`, p95 e E2E restante — ver `66-backlog-aaa.md`.

## 34. 23/11/2026 — Deploy da 1.63.0 ABORTADO no schema (guard funcionou)

**Resultado:** nada foi aplicado. Produção segue **1.62.3 healthy**. Conferido:
`prospecting_campaign_spend` não existe · `shipments.rota_versao_confirmada`
não existe · `payment_methods.tipo` não existe. Tag `v1.63.0` permanece
publicada, mas **não será deployada** — o deploy vai direto para **1.63.1**.

**Causa:** colisão de nome. Produção já tem uma `payment_methods` **legada**
(`name`/`account_id`/`is_active`, FK de `sales`) que **não está no
`baseline.sql`**. O `create table if not exists` da 0334 foi ignorado e o
índice em `tipo` falhou. O guard do `update.sh` parou antes de trocar imagens.

**Correção em curso (F):** renomear a tabela nova para
`commercial_payment_methods` + prova de não-colisão + varredura dos demais
objetos das migrations 0334/0335/0336/0337. PR com fragmento `nada_mudou`
⇒ **patch 1.63.1**, cortado pelo workflow oficial.

**Lição:** *baseline não é o schema de produção — há tabelas legadas fora dele;
migration nova precisa de nome livre e o teste precisa rodar contra um banco
com o legado.* `create table if not exists` **não** prova que a coluna que você
espera existe: ele aceita a tabela alheia e falha depois no índice. O teste
deve asserir forma, não só presença.

**Congelamento:** D/G/F seguem sem merge de features até o deploy da 1.63.1.

## 35. 23/11/2026 — Drift parcial deixado pelo aborto da 1.63.0

Verificação pós-aborto: o schema **não** ficou intacto. O `update.sh` aplica o
baseline **statement por statement, sem transação**; o erro foi no 0334, mas o
que vinha antes já commitou:

```
fn_salvar_ordem_rota(uuid,uuid,jsonb,jsonb,integer,timestamptz)  EXISTE em produção
prospecting_campaign_spend                                       não existe
payment_methods.tipo                                             não existe (legada sem tipo)
shipments.rota_versao_confirmada                                 não existe
```

Ou seja, a **0335 ficou aplicada**. A 1.62.3 no ar não chamava essa função
(flag desligada): sem dano funcional, mas **drift** de schema à frente do código.

**Lição:** *`update.sh` aplica schema sem transação — erro no meio deixa parte
aplicada; o guard protege a imagem, não o schema.*

**Proposta — NÃO IMPLEMENTADA (P0 de packaging, decisão do dono):** envolver o
bloco de schema em transação única (`psql -1` / `--single-transaction`) **ou**
verificar `to_regclass()` e a forma das colunas antes de trocar imagens.

## 36. 23/11/2026 — Deploy 1.63.1 VERIFICADO pelo dono

`update.sh --to v1.63.1` → `EXIT=0`, *“Atualização concluída — app no ar e
saudável”*.

```
7 containers em 1.63.1 · /health healthy 1.63.1
  (supabase / redis / rate_limit / waha ok) · /login 200
schema: prospecting_campaign_spend=t · commercial_payment_methods=t
        shipments.rota_versao_confirmada=t · fn_salvar_ordem_rota=t
Sentinel: achados=5 · reafirmadas=5 · truncado=false
URI too long (30 min)=0 · risk-watcher falhas (30 min)=0
rollback: refixar 1.62.3
```

**A 1.63.0 nunca foi deployada** — abortou no schema (§34). Produção passou
**diretamente de 1.62.3 para 1.63.1**. Os quatro objetos do §35 foram conferidos
um a um; o drift foi fechado. Lote de hoje encerrado: **nenhuma release nova
sem pedido do dono**. Fila retomada: F → P1-28/E2E/orçamentos · D →
Inbox/Dashboard/96 telas · G → `.in()`/`anon`/p95.

## 37. 23/11/2026 — Release 1.64.0 cortada (preparada, NÃO deployada)

Tag **`v1.64.0`** criada pelo CI a partir do merge do PR oficial **#805**
(`nexus-release-spiesdan[bot]`), derivada de **11 fragmentos** (4
`capacidade_nova`) ⇒ **minor**, `1.63.1` → **1.64.0**. Número calculado por
`pnpm release:conferir`; **corte pelo workflow oficial**, nunca à mão (o guard
já recusou o atalho na 1.63.0).

**Entra nesta versão:** multi-campanha + retomada 48h (#794) · orçamentos
parados com idade/próximo passo (#801) + CSV (#803) · relatório mensal de
gastos com CSV (#802) · Inbox selo de cache (#798) + handoff no cabeçalho
(#799) · Dashboard com estado vazio explícito (#804) · E2E de expedição
(#800) · `update.sh` com schema em transação única (#796) · `.in()` 10/10
(#791/#797).

**Dependência externa — template de retomada aprovado na Meta.** O follow-up
de +48h **não dispara sem template aprovado**: fora da janela de 24h a Meta
rejeita texto livre (erro 131047). O código usa preset configurável pela marca
do tenant (nunca texto hardcoded), mas a **aprovação do template é pré-requisito
operacional do dono**. Sem ela, o fluxo fica declarado *“aguardando aprovação”*
e o follow-up não é marcado como enviado.

**Não há migration nova nesta versão.** Deploy é do dono, com backup,
verificação e rollback (refixar 1.63.1). Congelamento de merges vale até o
deploy verificado.

## 38. 23/11/2026 — Deploy 1.64.0 VERIFICADO pelo dono

`update.sh --to v1.64.0` → `EXIT=0`, *“Atualização concluída”*.

```
7 containers em 1.64.0 · health healthy 1.64.0
  (supabase / redis / rate_limit / waha ok) · /login 200
schema: commercial_payment_methods=t · prospecting_campaign_spend=t
        rota_versao_confirmada=t · fn_salvar_ordem_rota=t
Sentinel: achados=5 · reafirmadas=5 · truncado=false
URI too long (30 min)=0 · risk-watcher falhas (30 min)=0
rollback: refixar 1.63.1
```

**O `update.sh` transacional rodou pela primeira vez em produção e passou** —
o P0 do aborto da 1.63.0 está **provado no artefato**: o schema entrou em
transação única (`psql -1`, #796) e o guard não precisou intervir. O risco de
DDL parcial do §35 está endereçado na prática, não só no papel.

**Dependência do template Meta (§37)** continua valendo: o follow-up de +48h
só dispara com template aprovado; sem ele o fluxo fica “aguardando aprovação”.

**Descongelamento:** F liberado para painel de gastos + E2E do P1-28; D para a
varredura das 96 (uma fatia por vez, `--workers=1`, swap >4 GB aborta e salva o
parcial); G segue no p95. **Nenhuma release nova hoje sem pedido do dono.**


## 39. 24/11/2026 — Série de SLO existe e ninguém viu (invariante 7 ferido)

**Medição do dono em produção (7 dias):**

```
267 amostras · 0 erros · p95 2660 ms (alvo 800 ms)
/api/v1/conversations: p95 2673 ms (259 amostras)
Sentinel: plataforma.slo_estourado em regras_nao_avaliadas — NENHUMA ocorrência aberta
```

**Causa:** `fn_slo_api_resumo` é `returns table(...)`; `supabase.rpc()` devolve
**array**. Dois leitores leem como **objeto**:
`lib/sentinel/coleta.ts` (`total=0` → detector `null` → nunca abre) e
`app/api/v1/admin/observabilidade/route.ts` (tela diz “sem histórico” com 267
amostras na tabela).

**Lição:** *RPC que retorna tabela devolve array; ler como objeto zera a série
e cega o painel e o detector.* A série existe, o alvo é violado e o sistema
não aprende — **invariante 7 ferido**.

**Registrado no `66`:** P0-7 (G corrige os dois leitores) e P0-8 (G ataca a
performance de `/api/v1/conversations`, p95 2673 ms). **Nenhuma release cortada
por isso agora.** Quando o G mergear e o dono deployar, a verificação passa a
exigir: **tela com 267+ amostras** e **ocorrência
`plataforma.slo_estourado|latencia` aberta**.
