# 21 — Entrega do módulo NF-e de entrada

> Documento de entrega da seção 25 da spec (`docs/specs/21-spec-nfe-entrada.md`).
> Cada afirmação abaixo é **CONFIRMADO** (provado por arquivo, comando ou teste
> deste repositório) ou **INFERIDO** (decorrência de leitura, sem execução).
> O que não foi provado contra a SEFAZ está declarado como pendência, não como
> concluído — é o que a seção 24 da spec exige.

Data desta medição: **2026-11-02**.

---

## 1. Arquitetura implementada

O módulo é uma parte do Nexus, não um sistema à parte:

```
Navegador
  └─ /app/fiscal/**            (13 telas, App Router, React 19)
       └─ fetch /api/v1/**     (route handlers, Zod, requireRole, ok()/fail())
            ├─ Supabase Postgres (RLS por organization_id)
            └─ lib/fiscal/entrada.ts  ──HTTP──►  fiscal/sidecar (PHP + sped-nfe)
                                                   └─► SEFAZ NFeDistribuicaoDFe
```

Decisões estruturais:

1. **O app Next nunca fala com a SEFAZ direto.** Ele chama o sidecar PHP já
   existente (`fiscal/sidecar/`, `nfephp-org/sped-nfe ^5.0`), que é o dono do
   certificado, do SOAP e da assinatura. O módulo novo **não** introduz JVM
   (a biblioteca WMIX da seção 3 é Java e não roda no runtime Node ≥22).
2. **Uma única função de sincronização** — `sincronizarEntrada()` em
   `lib/fiscal/entrada-sync.ts`. O botão "Sincronizar agora" e o cron chamam a
   mesma função; nenhum dos dois tem regra própria.
3. **NSU só avança depois de persistir.** `nsuSeguro()` calcula o próximo NSU a
   partir do que foi gravado com sucesso; documento que falhou não promove o
   cursor.
4. **Concorrência por lease no banco**, não em memória: `fiscal_entrada_cursor`
   ganhou `locked_until`/`locked_by`. Duas chamadas simultâneas → uma processa,
   a outra recebe o resultado `bloqueado`.
5. **Nada de estoque ou produto novo antes da conferência.** A importação
   (`/importar`) exige `conferencia_status = 'aprovada'`; a criação de produto
   quando o código não existe acontece só nesse caminho.
6. **A associação item↔produto é decisão humana.** O detalhe da nota permite
   apontar cada item para um produto do catálogo; a importação obedece a esse
   vínculo antes de casar por código, e a ressincronização o preserva.

---

## 2. Bibliotecas utilizadas

| Camada | Biblioteca | Onde |
|---|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript estrito | `app/`, `lib/` |
| Validação | Zod 4 | `lib/schemas/fiscal-entrada.ts`, `lib/schemas/fiscal.ts` |
| Banco/Auth | Supabase (`@supabase/*`), RLS | `lib/supabase/*`, migrations |
| UI | Tailwind 4 + componentes `components/nexus-ui/` | `app/app/fiscal/**` |
| Sidecar | PHP 8 + `nfephp-org/sped-nfe ^5.0` | `fiscal/sidecar/` |
| Testes | Vitest 4, Playwright 1 | `lib/fiscal/*.test.ts`, `tests/invariants/` |

**Nenhuma biblioteca nova de NF-e foi adicionada.** O caminho de integração é o
que o repositório já tinha.

---

## 3. Arquivos criados e modificados

### Criados

**Banco**
- `supabase/migrations/20261102120000_0290_fiscal_entrada_modulo.sql`

**Serviço e regras**
- `lib/fiscal/entrada-sync.ts` (+ `entrada-sync.test.ts`)
- `lib/fiscal/relatorios.ts` (+ `relatorios.test.ts`)
- `lib/fiscal/pagina.ts` — contexto de papel/idioma das telas
- `lib/fiscal/certificado-metadados.ts` — abre o PKCS#12 no sidecar e grava
  `titular`/`cnpj`/`validade` em `fiscal_certificates`
- `lib/schemas/fiscal-entrada.ts`

**API**
- `app/api/v1/fiscal-entradas/[id]/route.ts`
- `app/api/v1/fiscal-entradas/[id]/xml/route.ts`
- `app/api/v1/fiscal-entradas/[id]/conferencia/route.ts`
- `app/api/v1/fiscal-entradas/[id]/manifestar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/importar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/ignorar/route.ts`
- `app/api/v1/fiscal-entradas/[id]/itens/[itemId]/route.ts` — associação
  item↔produto do catálogo
- `app/api/v1/fiscal-fornecedores/route.ts`
- `app/api/v1/fiscal-produtos/route.ts`
- `app/api/v1/fiscal-eventos/route.ts`
- `app/api/v1/fiscal-manifestacoes/route.ts`
- `app/api/v1/fiscal-sincronizacoes/route.ts`
- `app/api/v1/fiscal-relatorios/route.ts`
- `app/api/v1/cron/fiscal-entradas-sync/route.ts`

**Telas** — `app/app/fiscal/**` (ver §6)

**Testes**
- `tests/invariants/fiscal-entrada-modulo-0290.test.ts`

### Modificados

- `supabase/baseline.sql` — apêndice idempotente da 0290 (antes da varredura de anon)
- `supabase/migrations/MANIFEST.md` — linha da 0290
- `lib/database.types.ts` — regenerado do banco local
- `lib/schemas/fiscal.ts` — campos de entrada na config (sem defaults que apagariam a emissão no PUT)
- `lib/fiscal/entrada.ts` — cliente do sidecar para distribuição/manifestação e metadados do certificado
- `lib/fiscal/entrada-sync.ts` — `preservarAssociacoes()`: ressincronizar não apaga a conferência
- `app/api/v1/fiscal-entradas/route.ts` — lista com filtros + POST de sincronização
- `app/api/v1/fiscal-entradas/[id]/importar/route.ts` — usa a associação manual antes do código
- `app/api/v1/fiscal-settings/route.ts` — colunas novas, reaplicação dos campos de entrada e metadados do certificado
- `app/api/v1/fiscal-settings/certificado/route.ts` — grava metadados em `fiscal_certificates`
- `fiscal/sidecar/src/ServicoEntrada.php` — distribuição, manifestação e parser estendido
- `fiscal/sidecar/public/index.php` — rota `POST /certificado/metadados`
- `app/app/notas/_components/ConfigFiscal.tsx` — bloco "Recebimento de NF-e (entrada)"
- `lib/navigation/registry.ts` — `/app/fiscal` como porta do sidebar + 12 subtelas
- `docker/scheduler/entrypoint.sh` — tick de 5 min
- `tests/invariants/rls-completude-varredura.test.ts` — 5 tabelas em `PROVA_PROPRIA`
- `tests/unit/fiscal-settings-nao-apaga-certificado.test.ts` — spread novo

---

## 4. Banco de dados e migrations

Migration: **`0290_fiscal_entrada_modulo`**. Aplicada **duas vezes** no banco
local (prova de idempotência) e espelhada em `baseline.sql`.

### Tabelas novas (5)

| Tabela | Papel |
|---|---|
| `fiscal_certificates` | metadados do A1: `sha256`, autor, data, ativo/revogado, `titular`, `validade` |
| `fiscal_document_items` | itens da nota com CST/CFOP, quantidades, valores e impostos por item |
| `fiscal_document_events` | eventos do documento (cancelamento, CC-e, manifestação), idempotentes por chave+tipo+sequência |
| `fiscal_manifestations` | registro da manifestação do destinatário (210200/210210/210220/210240) com autor e papel |
| `fiscal_sync_logs` | uma linha por execução: origem, NSU inicial/final, contagens, `cstat`, erro, duração |

### Tabelas existentes expandidas (sem duplicar)

| Tabela | Colunas acrescentadas |
|---|---|
| `fiscal_settings` | `entrada_ativa`, `frequencia_minutos`, `ultima_sincronizacao`, `ultimo_cstat`, `ultimo_motivo`, `manifestacao_automatica` |
| `fiscal_entradas` | `supplier_id`, `tipo_documento`, `situacao_fiscal`, `protocolo`, `dh_entrada`, `natureza_operacao`, `totais_json`, `conferencia_status`, `conferida_por`, `conferida_em`, `observacoes` |
| `suppliers` | `ie`, `endereco_json`, `ultima_nota_em`, `total_notas`, `total_comprado_cents` |
| `fiscal_entrada_cursor` | `max_nsu`, `locked_until`, `locked_by`, `ultimo_erro`, `proxima_tentativa` |

> Os nomes literais da seção 21 (`fiscal_documents`, `fiscal_suppliers`,
> `fiscal_nsu_control`, `fiscal_configurations`) **não** foram criados: o
> repositório já tinha `fiscal_entradas`, `suppliers`, `fiscal_entrada_cursor`
> e `fiscal_settings` com os mesmos dados. Criar as duas versões duplicaria a
> mesma nota em dois lugares. A decisão foi aprovada antes da implementação
> (plano técnico, §10.1).

Todas as 5 tabelas novas têm **RLS habilitada**, grants por papel, índices por
`organization_id` e trigger de `updated_at`. As funções novas foram revogadas de
`public`/`anon` e concedidas só a `authenticated`/`service_role`.

---

## 5. Endpoints criados

| Método | Rota | Papel | O que faz |
|---|---|---|---|
| GET | `/api/v1/fiscal-entradas` | viewer | lista com filtros (situação, conferência, fornecedor, período) |
| POST | `/api/v1/fiscal-entradas` | agent | dispara sincronização manual |
| GET | `/api/v1/fiscal-entradas/[id]` | viewer | detalhe com itens, eventos e manifestações |
| GET | `/api/v1/fiscal-entradas/[id]/xml` | viewer | download do XML original |
| POST | `/api/v1/fiscal-entradas/[id]/conferencia` | manager | aprovar / rejeitar / reabrir |
| POST | `/api/v1/fiscal-entradas/[id]/manifestar` | agent (ciência) / manager (demais) | registra manifestação |
| POST | `/api/v1/fiscal-entradas/[id]/importar` | manager | exige conferência aprovada; cria produto/estoque |
| POST | `/api/v1/fiscal-entradas/[id]/ignorar` | agent | marca documento como ignorado |
| PATCH | `/api/v1/fiscal-entradas/[id]/itens/[itemId]` | manager | associa/desassocia o item a um produto do catálogo |
| GET | `/api/v1/fiscal-fornecedores` | viewer | fornecedores com agregados |
| GET | `/api/v1/fiscal-produtos` | viewer | itens agregados por produto |
| GET | `/api/v1/fiscal-eventos` | viewer | eventos fiscais |
| GET | `/api/v1/fiscal-manifestacoes` | viewer | histórico de manifestações |
| GET | `/api/v1/fiscal-sincronizacoes` | viewer | log de sincronizações |
| GET | `/api/v1/fiscal-relatorios` | viewer | resumo, fornecedor, mês, produtos |
| POST | `/api/v1/cron/fiscal-entradas-sync` | secret | tick do scheduler |

Contratos: JSON snake_case, dinheiro em `_cents` + `currency`, datas ISO-8601
UTC, erro sempre por `fail(code, message, status)`.

---

## 6. Subtelas implementadas

Porta do sidebar: **`/app/fiscal`** ("Visão Geral"). `/app/notas` continua
existindo como destino de emissão, fora do sidebar.

| # | Tela | Rota | Conteúdo |
|---|---|---|---|
| 1 | Visão Geral | `/app/fiscal` | KPIs do período, alertas (656, certificado, config), últimas notas, painel de sync |
| 2 | Todas as Notas | `/app/fiscal/notas` | lista paginada com filtros |
| 3 | Detalhe da Nota | `/app/fiscal/notas/[id]` | cabeçalho, totais, itens, impostos, eventos, ações |
| 4 | Pendentes de Conferência | `/app/fiscal/pendentes` | fila de aprovação |
| 5 | XML Recebidos | `/app/fiscal/xml` | busca e download do XML |
| 6 | Resumos de Notas | `/app/fiscal/resumos` | resumos DF-e (`resNFe`) |
| 7 | Manifestação do Destinatário | `/app/fiscal/manifestacoes` | estado por chave + histórico |
| 8 | Fornecedores | `/app/fiscal/fornecedores` | agregados por emitente |
| 9 | Produtos das Notas | `/app/fiscal/produtos` | itens agregados, mais comprados |
| 10 | Cancelamentos e Eventos | `/app/fiscal/eventos` | timeline de eventos |
| 11 | Relatórios | `/app/fiscal/relatorios` | período, fornecedor, mês, produtos |
| 12 | Histórico de Sincronização | `/app/fiscal/sincronizacoes` | execuções, NSU, erro, duração |
| 13 | Configurações Fiscais | `/app/fiscal/configuracoes` | ativação, frequência, manifestação automática, certificado |

Componentes compartilhados: `layout.tsx`, `NavFiscal.tsx`,
`TabelaDeEntradas.tsx`, `BotaoSincronizar.tsx`, `AcoesDaEntrada.tsx`,
`AssociarProduto.tsx`, `ConfiguracoesDaEntrada.tsx`. Todas as datas usam
`tagDeIdioma()` / `useTagDeIdioma()` — nenhum `"pt-BR"` fixo.

**Associação item↔produto** (spec §14): no detalhe da nota, a coluna
"Catálogo" de cada item abre um seletor com busca no catálogo. A escolha vence o
casamento por código na importação, e a ressincronização preserva o vínculo por
`numero_item`. Sem associação, o comportamento anterior continua: casa por código
e, se não achar, cria o produto (só com conferência aprovada).

---

## 7. Rotina automática

- **Scheduler**: `docker/scheduler/entrypoint.sh` agenda
  `*/5 * * * *|120|api/v1/cron/fiscal-entradas-sync`.
- **Quem entra no tick**: organizações com `entrada_ativa = true`, cuja
  `frequencia_minutos` já venceu e cujo cursor não está em backoff. Até 5
  organizações por tick.
- **Autenticação**: Bearer `INTERNAL_CRON_SECRET` (ou `INTERNAL_SECRET`).
- **Concorrência**: lease de 10 min (`TTL_DA_TRAVA_MINUTOS`); o segundo
  chamador recebe `bloqueado`.
- **Erro 656** (consumo indevido): cursor **não** avança e
  `proxima_tentativa = agora + 1h` (`BACKOFF_656_MS`); a Visão Geral mostra o
  alerta.
- **Manifestação automática**: opcional por organização; ciência (`210210`)
  pelo papel `agent`; confirmação/desconhecimento/não-realizada por `manager`.
- **Log**: toda execução grava em `fiscal_sync_logs` e atualiza
  `fiscal_settings.ultima_sincronizacao`/`ultimo_cstat`.

---

## 8. Configuração do certificado A1

1. Em **Configurações Fiscais** (ou na config de emissão), envie o `.pfx` e a
   senha. A rota `POST /api/v1/fiscal-settings/certificado` valida os bytes DER
   (`0x30 0x82`), grava `/srv/fiscal/certs/certificado.pfx` com `0600` no host
   (montado em `/fiscal-certs` no app e `/certs` no sidecar) e registra
   `sha256`, autor e data em `fiscal_certificates`.
2. A senha é cifrada em repouso e **nunca** volta ao frontend nem aparece em
   log. O plaintext não é exibido em lugar nenhum.
3. O sidecar lê o arquivo do volume; o caminho enviado a ele é sempre relativo a
   `/certs/`.
4. Trocar certificado revoga a linha anterior em `fiscal_certificates` (histórico
   preservado, um ativo por organização).
5. **Metadados**: o sidecar abre o PKCS#12 (`POST /certificado/metadados`) e
   devolve `titular`, `cnpj`, `validade` e `inicio` — nunca o arquivo nem a senha.
   O app grava esses campos em `fiscal_certificates` no upload (quando a senha já
   está salva) e no PUT da configuração (quando a senha chega). É o que alimenta
   o alerta de vencimento da Visão Geral; falhar nessa leitura não invalida o
   certificado.

Variáveis de ambiente (já existentes no `.env.example`):
`FISCAL_SIDECAR_URL`, `FISCAL_SIDECAR_SECRET`; `FISCAL_CERTS_DIR` é só para
dev/e2e fora do contêiner.

---

## 9. Configuração do CNPJ

- O CNPJ monitorado vem de `fiscal_settings` (configuração da organização), não
  do corpo de requisição. A sincronização usa esse valor para a chamada de
  distribuição.
- CNPJ é normalizado para 14 dígitos (`cnpjDigitos()`) e comparado com o
  emitente para decidir se o documento é entrada.
- IE e UF do emitente são gravados em `suppliers` a partir do XML.
- O `NFeDistribuicaoDFe` usa o CNPJ do **destinatário** (o da organização) e o
  `ultNSU` do cursor.

---

## 10. Testes realizados

| Suíte | Resultado (2026-11-02) |
|---|---|
| `pnpm typecheck` | verde |
| `pnpm lint` | verde, 0 erros |
| `pnpm test:unit` | verde (inclui `entrada-sync.test.ts` — 21 testes — e `relatorios.test.ts` — 14) |
| `pnpm test:db` | 152 arquivos, **1390 verdes** (1 expected fail, 1 skip) |
| `pnpm gov:verify` | 881 arquivos, **9430 verdes** (1 expected fail) |
| `pnpm build` | EXIT 0 com `NODE_OPTIONS=--max-old-space-size=8192` — o heap padrão estoura (OOM), não é erro de código |

Cobertura específica do módulo:

- **`tests/invariants/fiscal-entrada-modulo-0290.test.ts`** — isolamento
  cross-tenant nas 5 tabelas, escrita restrita por papel, política de papel da
  manifestação, idempotência de evento, certificado só `manager`.
- **`lib/fiscal/entrada-sync.test.ts`** — lease, NSU que não avança em falha,
  eventos órfãos, itens, vínculo de fornecedor, logs, categoria de erro,
  `dh_entrada`, recomputo de agregados e preservação da associação no replay.
- **`app/api/v1/fiscal-entradas/[id]/importar/route.test.ts`** — a associação
  manual vence o código; sem associação, o casamento por código continua.
- **`lib/fiscal/relatorios.test.ts`** — massa fixa; cancelada/denegada fora do
  valor.
- **`tests/invariants/rls-completude-varredura.test.ts`** — as 5 tabelas em
  `PROVA_PROPRIA`.

**O que os testes NÃO provam**: comunicação com a SEFAZ. Nenhum teste toca a
SEFAZ real; o sidecar é exercitado por fixture e por `php -l`. A seção 24 da
spec proíbe declarar a integração validada sem isso.

---

## 11. Pendências de credenciais

| # | Pendência | Bloqueia |
|---|---|---|
| 1 | Certificado **A1 `.pfx`** + senha | toda comunicação real com a SEFAZ |
| 2 | **CNPJ** monitorado, **IE** e **UF** | `NFeDistribuicaoDFe` |
| 3 | Acesso de **produção** à SEFAZ | homologação não devolve DF-e de terceiros |
| 4 | `FISCAL_SIDECAR_URL` / `FISCAL_SIDECAR_SECRET` no ambiente | chamadas do app ao sidecar |

Enquanto 1–3 não existirem, o estado correto é: **módulo implementado, integração
não validada**. É exatamente o que a Etapa 0 do plano registra como bloqueada.

---

## 12. Instruções para colocar em produção

1. **Atualize o banco**: a 0290 chega pelo `update.sh` (apêndice idempotente do
   `baseline.sql`). Confira `supabase/migrations/MANIFEST.md`.
2. **Suba os dois arquivos de compose** (regra do `AGENTS.md`):
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml \
     --env-file .env up -d app scheduler sidecar
   ```
3. **Certificado**: crie `/srv/fiscal/certs` no host, envie o `.pfx` pela tela
   de Configurações Fiscais (não por Storage) e informe a senha.
4. **Configuração**: em `/app/fiscal/configuracoes`, ative "Recebimento de NF-e",
   defina a frequência (minutos) e, se quiser, a manifestação automática.
5. **Primeira sincronização**: use "Sincronizar agora". O primeiro ciclo baixa o
   lote disponível e grava o NSU. Confira em **Histórico de Sincronização**.
6. **Conferência**: as notas entram como `pendente`. Só depois de **Aprovar** a
   conferência a importação cria produto/movimenta estoque.
7. **Observabilidade**: acompanhe a Visão Geral (656, certificado vencendo,
   última sincronização) e o log estruturado do app.
8. **Build**: `pnpm build` padrão estoura o heap do Node nesta máquina (medido).
   Rode `NODE_OPTIONS=--max-old-space-size=8192 pnpm build` — conclui com EXIT 0.
   Não é erro do módulo.

---

## 13. Estado final, em uma frase

O módulo está **completo em código, banco, automação, telas e testes** e
**não validado contra a SEFAZ** — por falta de certificado A1, CNPJ/IE/UF e
acesso de produção. Nenhuma tela é demonstrativa: todas leem e escrevem nas
tabelas reais. O que falta para "produção validada" está listado em §11 e não
pode ser suprido por código.
