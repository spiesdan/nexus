# Plano técnico — Spec 21 (NF-e de entrada)

> **Status:** plano aprovado e executado — state atual na §13. A Etapa 0 (SEFAZ
> real) segue bloqueada por credenciais, e é a única que depende de terceiros.
> **Base:** [`21-spec-nfe-entrada.md`](21-spec-nfe-entrada.md) + medição do repo em 02/11/2026.
> **Legenda:** `CONFIRMADO` = provado por arquivo/comando · `INFERIDO` = leitura de código,
> não executado · `PROPOSTA` = decisão minha, aguardando aprovação.

---

## 0. Resumo executivo

**A maior parte do backend já existe.** O repo não está começando do zero: há
distribuição DF-e, cursor de NSU, manifestação, importação de itens e uma UI de
"Notas". O trabalho real é **fechar os furos** desse pipeline e construir as telas,
relatórios e histórico que faltam.

| Bloco | Hoje | Trabalho |
|---|---|---|
| Comunicação SEFAZ | `fiscal/sidecar` (PHP, sped-nfe) com `/distribuicao` e `/manifestar` | **validar** (nunca foi executado contra a SEFAZ) e estender o parser de impostos |
| Camada de serviço Nexus | `lib/fiscal/entrada.ts` já encapsula o sidecar | manter e ampliar |
| Persistência | `fiscal_entradas` + `fiscal_entrada_cursor` | normalizar itens, eventos, fornecedores, manifestações, logs |
| Segurança do NSU | avança mesmo quando o insert falha | **corrigir** (é o furo mais grave) |
| Concorrência | inexistente | lock de banco para sync manual e automática |
| Automação | só a fila de **emissão** (`fiscal-drain`) | cron de **entrada** |
| Telas | 1 tela `/app/notas` com 6 abas | 12 subtelas + detalhe da nota |
| Relatórios | nenhum de entrada | 7 relatórios + export |

**WMIX NFe não entra.** É Java; este repo é TypeScript/Next.js. Detalhe na §2.

**Estimativa de conflito com a spec: 3 pontos** que mudam comportamento e precisam
de decisão sua (§10). Não vou escolher por conta própria porque a doutrina do repo
proíbe inventar regra de negócio.

---

## 1. Diagnóstico (seção 2 da spec)

### 1.1 Stack — `CONFIRMADO`

| Pergunta | Resposta | Prova |
|---|---|---|
| Backend | TypeScript + Next.js 16 (App Router), route handlers | `package.json` |
| Java/Spring? | **Não.** Nenhum `.java`, `pom.xml` ou `build.gradle` | `glob '**/*.java'` vazio |
| Frontend | React 19 + Tailwind 4 + shadcn/ui + Phosphor | `package.json`, `lib/ui/icons.ts` |
| Banco | Postgres/Supabase, RLS por `organization_id` | `supabase/baseline.sql` |
| Auth | Supabase Auth + `requireAuth()`/`resolveActiveOrg()`; borda em `proxy.ts` | `lib/auth/server.ts` |
| RBAC | `ROLE_RANK`: viewer < agent = vendedor < ai_operator < manager < admin | `lib/auth/types.ts` |
| Guard de rota | `requireRole(papel, { requestId, resource })` | `lib/auth/require-role.ts` |
| Navegação | fonte única `lib/navigation/registry.ts`; teste reprova rota sem porta | `tests/unit/navegacao-completude.test.ts` |
| Padrão de tela | `NexusPageHeader`, `Tabs`, `components/nexus-ui/*` | `app/app/notas/page.tsx` |
| Migrations | 271 arquivos + `baseline.sql` + `MANIFEST.md` (os três obrigatórios) | `supabase/migrations/` |
| Dinheiro | `_cents` + `moeda` | `CLAUDE.md` |

### 1.2 O que já existe para NF-e de entrada — `CONFIRMADO`

| Peça | Arquivo | O que faz |
|---|---|---|
| Distribuição DF-e | `fiscal/sidecar/src/ServicoEntrada.php` → `distribuir()` | `$tools->sefazDistDFe($ultNsu)` até 3 consultas, lê `docZip` (`resNFe`, `procNFe`, `procEv`, `resEve`), devolve `ultNSU`/`maxNSU`/`cstat` |
| Manifestação | mesmo arquivo → `manifestar()` | `$tools->sefazManifesta($chave, $evento, $justificativa, 1)`; aceita 210200/210210/210220/210240; exige justificativa 15+ em 210240 |
| Certificado | mesmo arquivo → `ferramentas()` | `Certificate::readPfx($pfx, $senha)`, exige caminho sob `/certs/`, `tpAmb` 1/2 |
| Cliente Nexus | `lib/fiscal/entrada.ts` | `buscarNaSefaz()` e `manifestarNaSefaz()`; erro vira `erro`, nunca exceção |
| Sincronização manual | `app/api/v1/fiscal-entradas/route.ts` (POST) | 1 rodada, cursor no banco, dedupe por `chave` |
| Manifestar | `app/api/v1/fiscal-entradas/[id]/manifestar/route.ts` | grava `manifestacao`, `manifestada_em`, `status`, `audit()` |
| Importar | `app/api/v1/fiscal-entradas/[id]/importar/route.ts` | move estoque, cria produto se não achar, gera contas a pagar |
| Ignorar | `app/api/v1/fiscal-entradas/[id]/ignorar/route.ts` | marca `ignorada` |
| Cursor | `fiscal_entrada_cursor.ult_nsu` | uma linha por organização |
| UI | `app/app/notas/_components/EntradasFiscais.tsx` | tabela + ações dentro da aba "Entradas" |
| Cron de emissão | `app/api/v1/cron/fiscal-drain/route.ts` | **não** sincroniza entrada; processa `fiscal_jobs` |

### 1.3 Furos medidos no pipeline atual — `CONFIRMADO` (código) / `INFERIDO` (execução)

1. **NSU avança sem persistência segura.** Em `fiscal-entradas/route.ts`, o insert
   falha e o código segue (`if (!error) novas++`); depois faz `upsert` do cursor
   **incondicional**. Isso é exatamente o que a seção 19 proíbe: documento perdido
   para sempre, porque a SEFAZ não reenvia NSU já consumido.
2. **Eventos são descartados.** O filtro `d.tipo === "resumo" || "completa"` joga
   fora `evento` — cancelamento e CC-e nunca chegam ao banco.
3. **Sem controle de concorrência.** Dois cliques (ou clique + cron futuro) leem o
   mesmo `ult_nsu` e consultam a SEFAZ em paralelo → consumo indevido (656).
4. **Sem histórico de sincronização.** Não há registro de início/fim/NSU/erros.
5. **Impostos e totais não são extraídos.** `lerCompleta()` lê `vProd`, `qCom`,
   `vUnCom` e nada de ICMS/IPI/PIS/COFINS/frete/seguro/desconto. Sem isso, as abas
   "Impostos"/"Totais" e o relatório de impostos não têm dado.
6. **`itens_json` é o único lugar dos itens.** Não dá para filtrar "produtos mais
   comprados" por SQL sem varrer JSON.
7. **Fornecedor não é entidade fiscal.** `fiscal_entradas` guarda `emitente_cnpj` como
   texto; `suppliers` existe mas não tem IE/endereço nem vínculo com a nota.
8. **Manifestação não tem histórico.** Só a última (`manifestacao`, `manifestada_em`);
   sem protocolo, sem usuário, sem resultado por tentativa.
9. **Importação cria produto e move estoque automaticamente** — a spec (seções 9 e
   14) manda **não** fazer isso sem conferência/aprovação. Conflito direto (§10.4).
10. **Certificado não tem metadados.** Só o caminho e a senha cifrada; não se sabe
    titular, validade ou quando foi trocado.

---

## 2. Decisão 1 — biblioteca e estratégia de integração (seção 3)

### 2.1 WMIX NFe

`CONFIRMADO`: é um projeto **Java**. Este repo não tem JVM, nem `pom.xml`, e o
runtime de produção é Node ≥22. "Integrar" o WMIX significaria subir um **segundo
sidecar Java**, com ciclo de build, imagem, certificado e deploy próprios, para
fazer o que o sidecar PHP já faz.

Custo/risco: alto (novo runtime, nova imagem, nova superfície de segurança) para
ganho zero, porque a funcionalidade equivalente já está escrita e o contrato já
está consumido pelo app.

**Decisão: não integrar o WMIX.** A seção 3 da spec é condicional ("caso
compatível") e a própria spec proíbe reimplementar o que já existe.

### 2.2 Alternativas consideradas

| Opção | Custo | Risco | Veredito |
|---|---|---|---|
| A. Sidecar Java + WMIX | alto (JVM, imagem, cert, deploy) | alto | rejeitada |
| B. Reimplementar SOAP/mTLS em Node | médio-alto (assinatura, SSL, schemas) | alto (fiscal errado = nota perdida) | rejeitada |
| C. **Estender o sidecar PHP existente** | baixo | médio (nunca foi executado) | **escolhida** |

### 2.3 O que "estender" significa, concretamente

- Manter o contrato `POST /distribuicao` e `POST /manifestar` (já consumido por
  `lib/fiscal/entrada.ts`).
- **Não inventar método.** Os dois métodos usados são os que estão no código hoje:
  `Tools::sefazDistDFe($ultNSU)` e `Tools::sefazManifesta($chave, $evento, $justificativa, $versao)`.
  A etapa 0 valida as assinaturas contra a versão instalada do `sped-nfe` antes de
  qualquer código novo.
- Ampliar `lerCompleta()` para devolver: `ICMSTot` (vBC, vICMS, vIPI, vPIS, vCOFINS,
  vFrete, vSeg, vDesc, vOutro, vNF), por item (`vICMS`, `vIPI`, `vPIS`, `vCOFINS`,
  CST/CSOSN) e endereço do emitente.
- Ampliar `lerEvento()` para devolver protocolo, data do evento e sequência da CC-e.

### 2.4 A restrição que muda o plano de testes — `CONFIRMADO` no próprio sidecar

O comentário de `ServicoEntrada.php` afirma: **"Só produção distribui
(homologação não tem DF-e de terceiro)"**. Ou seja, a seção 24 ("utilizar
homologação sempre que disponível") **não é aplicável à distribuição**: não existe
nota de terceiro em homologação.

Consequência honesta para a entrega:

- Homologação valida **carregamento do certificado** e **formato da requisição**.
- A prova de distribuição real só existe em **produção**, com o CNPJ e o A1 reais.
- Sem esses dados, a etapa 0 fica **bloqueada** e o módulo **não** pode ser
  declarado "integrado" (regra da seção 24). O resto (schema, telas, relatórios,
  automação) pode avançar com dublê de SEFAZ.

---

## 3. Decisão 2 — modelo de dados (seção 21)

### 3.1 Princípio

A spec pede 9 tabelas. **6 já existem com outro nome.** Criar as 9 do zero
duplicaria a mesma informação em dois lugares — exatamente o que a seção 21 proíbe
("não duplicar fornecedores nem produtos") e o que gera divergência silenciosa.

**Decisão `PROPOSTA`: expandir o que existe; criar só o que não tem equivalente.**

| Tabela da spec | Decisão | Motivo |
|---|---|---|
| `fiscal_configurations` | **expandir `fiscal_settings`** | já é 1 linha por org, já tem CNPJ/UF/ambiente/certificado e RLS de `manager`. Uma segunda tabela com o mesmo CNPJ vira duas verdades. |
| `fiscal_certificates` | **criar** | metadados (titular, CNPJ, validade, sha256, enviado por/quando). O `.pfx` continua em `/srv/fiscal/certs`, nunca no banco. |
| `fiscal_documents` | **usar `fiscal_entradas`** | já tem chave única `(organization_id, chave)`, NSU, XML, status, manifestação, estoque/financeiro processados. Renomear custaria migração + regenerar `database.types.ts` + tocar 6 rotas e a UI, sem ganho. |
| `fiscal_document_items` | **criar (normalizada)** | hoje só `itens_json`. Relatório por produto/imposto precisa de coluna. `itens_json` fica como snapshot bruto. |
| `fiscal_suppliers` | **expandir `suppliers`** | `purchase_orders.supplier_id` já aponta para lá. Criar `fiscal_suppliers` separaria a identidade do fornecedor em duas. |
| `fiscal_events` | **manter (emissão) + criar `fiscal_document_events`** | a tabela atual exige `invoice_id NOT NULL` e só cobre nota emitida. Evento de nota recebida não cabe sem quebrar o contrato. |
| `fiscal_manifestations` | **criar** | hoje só a última manifestação em coluna. A spec quer histórico com usuário, protocolo e resultado. |
| `fiscal_nsu_control` | **expandir `fiscal_entrada_cursor`** | já é o cursor. Ganha `max_nsu`, `locked_until`, `locked_by`, `ultimo_erro`, `proxima_tentativa`. |
| `fiscal_sync_logs` | **criar** | não existe nada. |

### 3.2 Colunas a acrescentar

`fiscal_settings` (entrada): `entrada_ativa bool`, `frequencia_minutos int`,
`ultima_sincronizacao timestamptz`, `ultimo_cstat text`, `ultimo_motivo text`,
`manifestacao_automatica bool default false` (default falso = a spec manda não
manifestar sem autorização).

`fiscal_entradas`: `supplier_id uuid`, `tipo_documento text` (`resumo|completa`),
`situacao_fiscal text` (`autorizada|cancelada|denegada|desconhecida`),
`protocolo text`, `dh_entrada timestamptz`, `natureza_operacao text`,
`totais_json jsonb` (produtos/frete/seguro/desconto/outras/impostos),
`conferencia_status text` (`pendente|em_conferencia|aprovada|rejeitada`),
`conferida_por uuid`, `conferida_em timestamptz`, `observacoes text`.

`suppliers`: `ie text`, `endereco_json jsonb`, `ultima_nota_em timestamptz`,
`total_notas int`, `total_comprado_cents bigint` + índice único
`(organization_id, cnpj)` **parcial** (`where cnpj is not null`).

### 3.3 Tabelas novas (contrato mínimo)

- `fiscal_certificates`: `id`, `organization_id`, `titular`, `cnpj`, `validade`,
  `sha256`, `arquivo` (nome fixo), `enviado_por`, `enviado_em`, `revogado_em`.
- `fiscal_document_items`: `id`, `organization_id`, `entrada_id`, `numero_item`,
  `codigo`, `ean`, `descricao`, `ncm`, `cfop`, `unidade`, `quantidade numeric`,
  `valor_unitario_cents`, `valor_total_cents`, `icms_cents`, `ipi_cents`,
  `pis_cents`, `cofins_cents`, `cst`, `produto_id` (nullable), `associado_por`,
  `associado_em`. Único `(entrada_id, numero_item)`.
- `fiscal_document_events`: `id`, `organization_id`, `entrada_id`, `chave`, `nsu`,
  `tipo` (`cancelamento|carta_correcao|manifestacao|outro`), `tp_evento`,
  `descricao`, `protocolo`, `dh_evento`, `xml`, `sequencia`, `created_at`.
  Único `(organization_id, chave, tp_evento, nsu)`.
- `fiscal_manifestations`: `id`, `organization_id`, `entrada_id`, `evento`,
  `justificativa`, `protocolo`, `cstat`, `resultado`, `usuario_id`, `created_at`.
- `fiscal_sync_logs`: `id`, `organization_id`, `origem` (`manual|cron`),
  `iniciado_em`, `finalizado_em`, `nsu_inicial`, `nsu_final`, `max_nsu`,
  `docs_encontrados`, `docs_importados`, `docs_erro`, `resultado`,
  `cstat`, `mensagem`, `request_id`, `usuario_id`.

### 3.4 Regras de schema (não negociáveis do repo)

- Migration versionada **+** apêndice idempotente em `supabase/baseline.sql` **+**
  linha em `supabase/migrations/MANIFEST.md`. Os três.
- Toda tabela nova: `enable row level security`, policy de `select` por
  `fn_user_org_ids()`, policy de escrita com `fn_role_at_least(..., 'manager')` para
  configuração/conferência, `revoke all ... from anon`, `grant` para
  `authenticated`/`service_role`, trigger `fn_set_updated_at()`.
- Função em `public` → `revoke execute ... from public, anon` + `grant` nominal.
- `pnpm test:db` obrigatório (RLS cross-tenant).

---

## 4. Decisão 3 — NSU, concorrência e recuperação (seções 19 e 20)

### 4.1 Regra de avanço do NSU `PROPOSTA`

```
1. adquire lock (update atômico em fiscal_entrada_cursor)
2. lê ult_nsu
3. consulta SEFAZ
4. para CADA documento, na ordem do NSU:
     - persiste documento/itens/evento
     - se falhar → PARA. cursor = nsu do último persistido com sucesso
5. grava cursor = último NSU seguro (nunca o ultNSU da resposta se algo falhou)
6. grava fiscal_sync_logs
7. libera lock
```

Isso é o oposto do código atual e é o que a seção 19 exige. Como cada NSU é
idempotente (chave única + evento único), repetir uma faixa após crash não duplica.

### 4.2 Lock `PROPOSTA`

Sem Redis novo: lock no Postgres, na própria linha do cursor.

```sql
update fiscal_entrada_cursor
   set locked_until = now() + interval '10 minutes',
       locked_by = $2
 where organization_id = $1
   and (locked_until is null or locked_until < now())
returning ult_nsu;
```

- Zero linhas = já existe sync rodando → `409` com "sincronização em andamento".
- Sync manual e cron usam **a mesma** função (`lib/fiscal/entrada-sync.ts`), então
  não há caminho que fure o lock.

### 4.3 Tratamento de retorno

| cStat | Significado | Ação |
|---|---|---|
| 138 | documento(s) localizado(s) | processar lote |
| 137 | nada novo | log `resultado=vazio`, sem avançar cursor além do informado |
| 656 | consumo indevido | **não** avançar; `proxima_tentativa = now() + 1h`; log com `mensagem` |
| outro | erro | log, sem avançar |

Nada aqui inventa número: 137/656 e o "1h" já estão no sidecar e no comentário
dele. Os demais cStat entram como erro genérico até validação real.

### 4.4 Eventos

`resEve`/`procEv` passam a ser persistidos em `fiscal_document_events` e
projetados em `fiscal_entradas.situacao_fiscal` (`cancelada` quando `tpEvento=110111`).
O XML original do evento é preservado.

---

## 5. Decisão 4 — telas e navegação (seções 4, 5 e 23)

### 5.1 Onde o módulo mora

`PROPOSTA`: área nova **`/app/fiscal`** (o grupo de navegação já se chama "Fiscal").
`/app/notas` continua sendo **emissão** (é o que ela é hoje), com link cruzado.

Motivo: misturar emissão e entrada na mesma árvore de 12 subtelas transformaria
`/app/notas` numa tela de 18 abas — o oposto do que a seção 4 pede.

### 5.2 Mapa de rotas

| Subtela | Rota |
|---|---|
| Visão Geral | `/app/fiscal` |
| Todas as Notas | `/app/fiscal/notas` |
| Detalhes da Nota | `/app/fiscal/notas/[id]` |
| Pendentes de Conferência | `/app/fiscal/pendentes` |
| XML Recebidos | `/app/fiscal/xml` |
| Resumos de Notas | `/app/fiscal/resumos` |
| Manifestação do Destinatário | `/app/fiscal/manifestacoes` |
| Fornecedores | `/app/fiscal/fornecedores` |
| Produtos das Notas | `/app/fiscal/produtos` |
| Cancelamentos e Eventos | `/app/fiscal/eventos` |
| Relatórios | `/app/fiscal/relatorios` |
| Histórico de Sincronização | `/app/fiscal/sincronizacoes` |
| Configurações Fiscais | `/app/fiscal/configuracoes` |

### 5.3 Navegação — restrição medida

O sidebar tem orçamento de dobra **medido**: 18 links (`lib/navigation/registry.ts`,
comentário do §19). Hoje "Notas fiscais" (`/app/notas`) é a única porta do grupo.

`PROPOSTA`:
- A porta do grupo passa a apontar para `/app/fiscal` (o módulo novo).
- `/app/notas` (emissão) ganha link dentro de `/app/fiscal` e continua no ⌘K.
- As 12 subtelas entram no registro com `sidebar: false` + `section`, como o grupo
  IA faz — assim aparecem no hub, no ⌘K e no teste de completude, sem estourar a
  dobra.

### 5.4 Padrão visual

- `NexusPageHeader` (breadcrumb + título + descrição + ações).
- Tabelas com os componentes existentes; nenhum componente novo se já existe.
- Cores de status conforme a seção 5, mapeadas em **um** módulo
  (`lib/fiscal/rotulos.ts`) para não divergir entre 12 telas.
- Estados: `loading` (skeleton), vazio, erro, sucesso, processando, sincronizando.
- Sem landing page: `/app/fiscal` é dashboard com dados reais e botão
  **Sincronizar agora**.

---

## 6. Permissões (seção 22) — `PROPOSTA`

| Ação | Papel mínimo | Por quê |
|---|---|---|
| Ver notas, XML, relatórios | `viewer` | leitura |
| Sincronizar (manual) | `agent` | mesmo piso do POST atual |
| Manifestar **ciência** (210210) | `agent` | evento de rotina, não confirma operação |
| Manifestar **confirmação/desconhecimento/não realizada** | `manager` | ato fiscal declarativo, com consequência contábil |
| Conferir/aprovar nota | `manager` | mexe em estoque e custo |
| Importar (estoque + financeiro) | `manager` | já é o piso atual |
| Configurar CNPJ/certificado/frequência | `manager` | já é o piso da RLS de `fiscal_settings` |
| Platform admin | tudo | `is_platform_admin` |

Toda mutação chama `audit()` com `organization_id` resolvido de fonte confiável.
Nenhuma rota aceita `organization_id` do body.

---

## 7. Segurança do certificado (seção 22)

`CONFIRMADO` que já existe:
- `.pfx` fora do Storage, em `/srv/fiscal/certs`, nome fixo `certificado.pfx`
  (`lib/fiscal/certificado.ts`).
- Senha cifrada em repouso (`encryptWebhookSecret`) e decifrada só no servidor
  (`lib/fiscal/sped-payload.ts`).
- Sidecar recusa caminho fora de `/certs/`.

`PROPOSTA` acrescentar:
- `fiscal_certificates` com titular/CNPJ/validade/sha256 — para a tela avisar
  "vence em N dias" sem nunca devolver o arquivo.
- `GET` de configuração devolve **apenas** `{ tem_certificado, titular, validade }`.
- Upload valida: extensão, tamanho, PKCS#12 parseável, CNPJ do titular = CNPJ
  monitorado (aviso, não bloqueio — pode ser certificado da matriz).
- Nenhum log recebe senha, PFX ou XML completo com dados do cliente.

---

## 8. Automação (seção 20)

- Rota nova `app/api/v1/cron/fiscal-entradas-sync` com o mesmo contrato dos crons
  (`Bearer INTERNAL_CRON_SECRET`), chamada pelo scheduler da VPS.
- Itera organizações com `entrada_ativa = true` e `ultima_sincronizacao +
  frequencia_minutos <= now()`.
- Usa **o mesmo** `sincronizarEntrada()` do botão manual (lock incluso).
- Backoff em 656; `proxima_tentativa` respeitada.
- Cada execução grava `fiscal_sync_logs` (mesmo quando falha).
- Nunca manifesta sozinho (`manifestacao_automatica` default `false`).

---

## 9. Etapas (cada uma com prova de conclusão)

### Etapa 0 — Validar o sidecar contra a SEFAZ (BLOQUEANTE)
- `composer install` na versão fixada; `GET /saude`.
- Carregar A1 real, chamar `/distribuicao` com `ult_nsu=0`.
- Registrar `cstat`, `xmotivo`, `ultNSU`, `maxNSU` e um recorte do retorno
  **sem dado sensível** em `docs/evidence/`.
- **Pronto quando:** houver retorno real da SEFAZ registrado. Sem isso, nenhuma
  etapa seguinte pode ser chamada de "integrada".
- **Bloqueio:** depende de certificado A1 + CNPJ + IE + UF (§11).

### Etapa 1 — Schema, RLS e migrations
- 4 tabelas novas + colunas de expansão + índices + unique + policies.
- Migration + `baseline.sql` + `MANIFEST.md`; regenerar `database.types.ts`.
- **Pronto quando:** `pnpm test:db` verde (isolamento cross-tenant nas tabelas novas).

### Etapa 2 — Ingestão segura
- `lib/fiscal/entrada-sync.ts`: lock, ordem por NSU, persistência antes do cursor,
  eventos, logs.
- Parser do sidecar devolvendo impostos/totais/endereço.
- **Pronto quando:** testes de unidade provarem (a) cursor não avança com insert
  falhando, (b) replay não duplica, (c) lock impede duas execuções, (d) 656 não
  avança.

### Etapa 3 — API
- Listagem com filtros/paginação/ordenação, detalhe, XML, eventos, fornecedores,
  produtos, manifestações, sync, config, relatórios.
- Zod + `requireRole` + `audit` + `ok()/fail()`.
- **Pronto quando:** testes de contrato verdes e nenhuma rota sem guard.

### Etapa 4 — Casca + Visão Geral + Todas as Notas + Detalhe
- Rotas, registro de navegação, 6 abas do detalhe.
- **Pronto quando:** e2e de navegação e screenshot de cada estado.

### Etapa 5 — Demais subtelas
- Pendentes, XML, Resumos, Manifestação, Fornecedores, Produtos, Eventos,
  Sincronizações, Configurações.
- **Pronto quando:** cada tela com estado vazio e com dado.

### Etapa 6 — Relatórios + export
- 7 relatórios; Excel e PDF a partir dos documentos armazenados.
- **Pronto quando:** soma do relatório = soma do banco (teste de unidade com massa fixa).

### Etapa 7 — Automação
- Cron, backoff, logs, frequência configurável.
- **Pronto quando:** duas chamadas simultâneas → uma processa, a outra recebe 409;
  execução com falha gera log e não perde NSU.

### Etapa 8 — Fechamento
- e2e completos, evidência visual, doc de entrega (seção 25).
- **Pronto quando:** `gov:verify` + `test:db` + e2e verdes, e o doc de entrega lista
  o que ficou pendente de credencial.

---

## 10. Conflitos que precisam da sua decisão

Estes três mudam **comportamento existente** e a doutrina do repo proíbe eu
decidir sozinho.

### 10.1 Nomes das tabelas
Manter `fiscal_entradas`/`suppliers`/`fiscal_settings` (recomendado, sem
duplicação) **ou** renomear para os nomes literais da spec (migração + regenerar
tipos + tocar rotas/UI)?

### 10.2 Manifestação
Ciência por `agent` e os outros três eventos por `manager` (recomendado) **ou**
todos por `agent` (como hoje)?

### 10.3 Importação automática
Hoje "Importar" **cria produto** quando não acha o código e **move estoque** na
hora. A spec manda não fazer isso sem conferência. Opções:
- (a) manter, mas só depois de "Aprovar conferência" (recomendado);
- (b) bloquear a criação automática de produto e exigir associação manual;
- (c) manter como está.

### 10.4 Credenciais
Para a etapa 0: certificado A1 (.pfx), senha, CNPJ monitorado, IE, UF e confirmação
de que pode consultar **produção** (homologação não tem DF-e de terceiro).

---

## 11. Riscos e pendências

| Risco | Impacto | Mitigação |
|---|---|---|
| Sidecar nunca executado | "integrado" sem prova | etapa 0 bloqueante |
| Histórico da distribuição é limitado | nota antiga não volta | sincronizar desde o início, cedo, e nunca perder NSU |
| Sem homologação para DF-e | não há teste "de graça" | dublê de SEFAZ nos testes + validação real em produção |
| `itens_json` sem impostos | abas/relatórios vazios | estender parser (etapa 2) |
| Código do fornecedor ≠ SKU interno | associação errada | tela de associação manual, sem auto-criar duplicata |
| 271 migrations + baseline | drift | os três artefatos na mesma PR |
| Custo de 12 telas | regressão visual | componentes existentes + e2e por tela |

---

## 12. O que eu faço assim que você aprovar

1. Etapa 1 (schema) — é aditiva, não muda comportamento e não depende de credencial.
2. Em paralelo, preparo a etapa 0 (script de validação e checklist do certificado)
   para rodar no minuto em que as credenciais chegarem.
3. Etapa 2 (ingestão segura) — corrige o furo do NSU, que é o mais grave.

---

## 13. Execução — estado em 2026-11-02

> Registro do que **foi feito**, do que **foi provado** e do que **ainda falta**.
> Atualizar esta seção a cada etapa; o restante do documento é o plano aprovado,
> não o diário.

### 13.1 Etapas concluídas

| Etapa | Estado | Prova |
|---|---|---|
| 0 — validação real na SEFAZ | **BLOQUEADA** | faltam .pfx, senha, CNPJ, IE, UF e acesso a produção |
| 1 — schema (0290) | concluída | migration aplicada 2× (idempotente), baseline + MANIFEST, `test:db` verde |
| 2 — ingestão segura | concluída | `lib/fiscal/entrada-sync.ts` + 18 testes; NSU só avança após persistir; lease contra concorrência |
| 3 — parser completo | concluída | `ServicoEntrada.php` emite totais, impostos por item, endereço, protocolo, eventos; `php -l` + fixture |
| 4 — API | concluída | 13 rotas (lista/detalhe/XML/conferência/manifestação/importação + 7 leituras + cron) |
| 5 — telas | concluída | 13 páginas em `app/app/fiscal/**`, navegação registrada |
| 6 — relatórios | concluída | `lib/fiscal/relatorios.ts` + 14 testes de massa fixa |
| 7 — automação | concluída | cron `fiscal-entradas-sync` agendado no scheduler; 656 → backoff de 1h |
| 8 — fechamento | concluída | `gov:verify` + `pnpm build` verdes (heap 8 GB); 13 telas capturadas em `evidence/fiscal-entrada/`; doc de entrega em `21-entrega-nfe-entrada.md` |
| 9 — associação produto↔item | concluída | rota `PATCH /fiscal-entradas/[id]/itens/[itemId]`, seletor na tela de detalhe e importação que obedece ao vínculo (ver §13.5) |

### 13.2 O que foi criado/alterado

**Banco**
- `supabase/migrations/20261102120000_0290_fiscal_entrada_modulo.sql` — 5 tabelas
  novas (`fiscal_certificates`, `fiscal_document_items`, `fiscal_document_events`,
  `fiscal_manifestations`, `fiscal_sync_logs`), colunas em `fiscal_settings`,
  `fiscal_entradas`, `suppliers` e `fiscal_entrada_cursor`, RLS, grants, índices,
  triggers.
- `supabase/baseline.sql` — apêndice idempotente da 0290 antes da varredura de anon.
- `supabase/migrations/MANIFEST.md` — linha da 0290.
- `lib/database.types.ts` — regenerado do banco local (estava 9 tabelas/funções atrás).

**Serviço e regras**
- `lib/fiscal/entrada-sync.ts` — orquestração única (botão e cron), lease, cursor
  seguro, eventos, itens, fornecedor, logs, backoff 656, vínculo de evento órfão.
- `lib/fiscal/relatorios.ts` — agregações puras (período, fornecedor, mês, produtos).
- `lib/fiscal/certificado-metadados.ts` — abre o PKCS#12 no sidecar e grava
  titular/CNPJ/validade em `fiscal_certificates` (best-effort, nunca bloqueia).
- `lib/fiscal/pagina.ts` — contexto de papel das telas.
- `lib/schemas/fiscal-entrada.ts` — contrato de entrada, conferência, situação, totais.
- `lib/schemas/fiscal.ts` — config de entrada (`entrada_ativa`,
  `frequencia_minutos`, `manifestacao_automatica`), sem defaults que apagariam
  a configuração no PUT da emissão.
- `fiscal/sidecar/src/ServicoEntrada.php` — distribuição DF-e, manifestação e parser
  estendido (ICMSTot, impostos por item, endereço do emitente, eventos).

**API**
- `app/api/v1/fiscal-entradas/route.ts` (GET/POST sync)
- `app/api/v1/fiscal-entradas/[id]/route.ts` (detalhe completo)
- `app/api/v1/fiscal-entradas/[id]/xml/route.ts` (download)
- `app/api/v1/fiscal-entradas/[id]/conferencia/route.ts` (aprovar/rejeitar/reabrir)
- `app/api/v1/fiscal-entradas/[id]/manifestar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/importar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/ignorar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/itens/[itemId]/route.ts` — associação
  item↔produto do catálogo (PATCH; `produto_id: null` desassocia)
- `app/api/v1/fiscal-fornecedores|produtos|eventos|manifestacoes|sincronizacoes|relatorios/route.ts`
- `app/api/v1/cron/fiscal-entradas-sync/route.ts`
- `app/api/v1/fiscal-settings/route.ts` — colunas e reaplicação dos campos de entrada
- `app/api/v1/fiscal-settings/certificado/route.ts` — passa a gravar metadados
  (sha256, autor, data) em `fiscal_certificates` e, quando a senha já existe,
  preenche `titular`/`cnpj`/`validade` via sidecar

**Telas**
- `app/app/fiscal/layout.tsx` + `_components/NavFiscal.tsx`
- `app/app/fiscal/page.tsx` — Visão Geral (KPIs, alertas de 656/certificado/config,
  últimas notas, painel de sincronização)
- `notas`, `notas/[id]`, `pendentes`, `xml`, `resumos`, `manifestacoes`,
  `fornecedores`, `produtos`, `eventos`, `relatorios`, `sincronizacoes`,
  `configuracoes`
- `_components/TabelaDeEntradas.tsx`, `BotaoSincronizar.tsx`, `AcoesDaEntrada.tsx`,
  `AssociarProduto.tsx` (seletor item↔catálogo, com busca e catálogo sob demanda)
- `app/app/notas/_components/ConfigFiscal.tsx` — ganhou o bloco de recebimento
- `lib/navigation/registry.ts` — `/app/fiscal` é a porta do sidebar; emissão e as
  12 subtelas estão registradas (⌘K + NavFiscal)

**Testes**
- `tests/invariants/fiscal-entrada-modulo-0290.test.ts` — RLS cross-tenant, escrita
  restrita, papel da manifestação, idempotência de evento, certificado só manager.
- `tests/invariants/rls-completude-varredura.test.ts` — as 5 tabelas novas em
  `PROVA_PROPRIA`.
- `lib/fiscal/entrada-sync.test.ts` (21 — inclui `preservarAssociacoes`, que
  impede a ressincronização de apagar a conferência)
- `lib/fiscal/relatorios.test.ts` (14)
- `app/api/v1/fiscal-entradas/[id]/importar/route.test.ts` (2 — a associação
  vence o código; sem associação, o casamento por código continua)
- `tests/unit/fiscal-settings-nao-apaga-certificado.test.ts` — atualizado para o
  novo spread sem os campos de entrada.

### 13.3 Comandos e resultados

```console
$ pnpm typecheck      # verde
$ pnpm lint           # verde (0 erros)
$ pnpm test:db        # 152 arquivos, 1390 testes verdes (1 expected fail, 1 skip)
$ pnpm gov:verify     # 881 arquivos, 9430 testes verdes (1 expected fail)
$ NODE_OPTIONS=--max-old-space-size=8192 pnpm build   # EXIT 0
```

O `pnpm build` padrão estoura o heap do Node nesta máquina; com 8 GB ele conclui.
Não é erro do módulo — a mesma instrução está no doc de entrega, §12.

### 13.4 Pendências reais (não declarar integração concluída antes)

1. **Etapa 0 — SEFAZ real.** Sem `.pfx` A1, senha, CNPJ monitorado, IE, UF e
   acesso de produção, não há uma única consulta real a `NFeDistribuicaoDFe`.
   Homologação não devolve DF-e de terceiros; o caminho é produção. **É a única
   pendência que código não resolve.**

Resolvidas depois do fechamento original:

2. ~~Metadados do certificado~~ — `POST /certificado/metadados` no sidecar abre o
   PKCS#12 (`openssl_pkcs12_read`) e o app grava `titular`/`cnpj`/`validade` em
   `fiscal_certificates`, no upload (se a senha já existe) e no PUT da config
   (quando a senha chega). O alerta de vencimento da Visão Geral passa a ter dado.
3. ~~Evidência visual~~ — as 13 telas foram capturadas com sessão real pelo spec
   `tests/e2e/notas-fiscais-modulo.spec.ts` em `evidence/fiscal-entrada/`.
4. ~~Doc de entrega (seção 25)~~ — `docs/specs/21-entrega-nfe-entrada.md`.
5. ~~Associação produto↔item~~ — `PATCH /fiscal-entradas/[id]/itens/[itemId]` +
   seletor `AssociarProduto` na tela de detalhe. A importação usa o vínculo
   manual antes de casar por código, e a ressincronização preserva a associação
   por `numero_item`. Ver §13.5.

### 13.5 Associação produto↔item (o que fecha a §14 da spec)

- **Onde**: detalhe da nota, coluna "Catálogo" de cada item. O catálogo só é
  carregado quando o seletor abre (uma vez por página), com busca por código/nome.
- **Permissão**: `manager`, o mesmo piso de `importar` — a associação decide para
  qual produto o estoque vai e qual custo muda.
- **Precedência na importação**: `produto_id` associado → casamento por `codigo`
  → criação de produto (só com conferência aprovada).
- **Ressincronização**: `preservarAssociacoes()` devolve `produto_id`,
  `associado_por` e `associado_em` às linhas regravadas; sem isso, cada replay de
  NSU apagaria a conferência.
- **Rastro**: `audit` grava `fiscal_entrada.item_associado` /
  `fiscal_entrada.item_desassociado` com `numero_item` e `produto_id`.
