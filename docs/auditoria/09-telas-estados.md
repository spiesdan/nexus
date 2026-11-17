# Telas × estados — sinais medidos

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/inventario-completo.ts`.
> Fonte: `app/**/page.tsx + segmento de rota`. Gerado em 2026-11-17T16:38:51.452Z. Não editar à mão.

**156 telas.** Uma marca ✓ significa **sinal no código**, não comportamento verificado.
A verificação de cada estado acontece na Fase 2, com evidência de execução.

> **De onde vem o sinal.** O texto analisado é o **segmento de rota inteiro** — a `page.tsx` e os arquivos locais dela (`_client.tsx`, `_components/`, `_pills.tsx`…) —, sem entrar em subpastas que tenham `page.tsx` próprio, porque essas são **outras telas**. A primeira versão lia só a `page.tsx` e produziu uma matriz com todas as células em `—`; `/app/pedidos`, por exemplo, tem filtros e tabela no `_client.tsx` e aparecia vazia. Regra e caso de regressão em `scripts/auditoria/segmento-de-rota.ts` e `tests/unit/matriz-telas-le-segmento.test.ts`.

> **O que este número NÃO é.** Ele conta arquivos `page.tsx`, ou seja, cobre ROTAS — e das 156, 13 são resolvers (redirecionam sem JSX) e aparecem marcados. Não é auditoria de subtelas, estados nem jornadas: a matriz abaixo diz onde cada estado **aparece no código**, e uma aba, um drawer, um modal ou um fluxo de escrita não viram linha nenhuma. Quem lê a matriz como prova de comportamento está lendo uma prova que o artefato não dá.

> **`loading`/`error` distinguem origem.** `próprio` = arquivo nesta pasta de rota; `herdado` = arquivo de um segmento acima (inclusive o `app/error.tsx` global); `—` = não existe. A versão anterior marcava ✓ em toda tela por causa do fallback global e chamava de "tratamento de erro desta tela" o que é um arquivo único do app. Por existir `app/error.tsx`, a coluna `error` **nunca** fica `—`: toda rota tem fallback. O que muda é ser próprio ou herdado.

Inclui `/design`, o showcase interno do design system — é tela, tem `page.tsx` e JSX, e por isso entra na conta. Excluir por parecer "interna" foi como inventários anteriores perderam rotas.

**Resumo:** 143 das 143 telas com JSX têm ao menos um sinal; nenhuma ficou sem sinal depois de medir o segmento e seguir os imports locais.

| Tela | arquivos | carregando | vazio | erro | permissão | confirmação | formulário | abas | modal/drawer | filtros | tabela | gráfico | tempo real | loading | error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/(public)/login/forgot` | 5 | — | — | ✓ | — | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/(public)/login/mfa` | 5 | — | — | ✓ | — | — | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/(public)/login` | 6 | — | — | ✓ | — | — | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/(public)/login/recovery` | 5 | — | — | ✓ | — | — | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/(public)/login/reset` | 5 | — | — | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — | herdado |
| `/(public)/signup` | 7 | — | — | ✓ | — | ✓ | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/403` | 3 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/500` | 3 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/503` | 3 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/account-suspended` | 4 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)/audit/[entryId]` | 11 | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)/audit` | 8 | ✓ | ✓ | — | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | herdado |
| `/admin/(protected)/dashboard` | 11 | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | ✓ | — | herdado |
| `/admin/(protected)/google` | 14 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)/inbox/[conversationId]` | 11 | ✓ | — | ✓ | — | — | — | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)/inbox` | 22 | ✓ | — | ✓ | ✓ | — | ✓ | — | — | ✓ | — | — | ✓ | — | herdado |
| `/admin/(protected)/incidents/[id]` | 15 | ✓ | — | ✓ | — | ✓ | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/admin/(protected)/incidents` | 8 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | herdado |
| `/admin/(protected)/lgpd` | 10 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | herdado |
| `/admin/(protected)/lgpd/requests/[id]` | 14 | ✓ | — | ✓ | — | — | — | — | — | ✓ | — | — | — | — | herdado |
| `/admin/(protected)/marca` | 28 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)` *(resolver)* | 8 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | — | herdado |
| `/admin/(protected)/platform-admins` | 8 | ✓ | ✓ | ✓ | — | — | — | — | — | — | ✓ | — | — | — | herdado |
| `/admin/(protected)/tenants/[id]/health` | 8 | ✓ | — | ✓ | — | — | — | — | — | — | — | — | ✓ | — | herdado |
| `/admin/(protected)/tenants/[id]` | 19 | ✓ | — | ✓ | ✓ | — | — | ✓ | — | — | — | — | — | — | herdado |
| `/admin/(protected)/tenants/new` | 12 | — | — | ✓ | — | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/admin/(protected)/tenants` | 9 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | herdado |
| `/admin/(protected)/usage` | 10 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | ✓ | ✓ | — | — | herdado |
| `/admin/(protected)/users/[id]` | 13 | ✓ | — | ✓ | — | — | — | — | — | — | ✓ | — | — | — | herdado |
| `/admin/(protected)/users` | 9 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | herdado |
| `/admin/forbidden` | 3 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/app/agenda` | 31 | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | — | próprio | próprio |
| `/app/ai/agents/[id]` | 74 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | herdado | herdado |
| `/app/ai/agents/new` | 52 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | herdado | herdado |
| `/app/ai/agents` | 32 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/ai/cases` | 21 | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | — | — | herdado | herdado |
| `/app/ai/controle` | 14 | ✓ | — | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/ai/credentials` | 28 | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/ai/decisoes` | 20 | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | — | herdado | herdado |
| `/app/ai/evolution` | 18 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | ✓ | — | herdado | herdado |
| `/app/ai/followups/[id]` | 61 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/ai/followups/enrollments/[id]` | 19 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/ai/followups` | 29 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/ai/inbox` | 15 | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | — | herdado | herdado |
| `/app/ai/knowledge/sources` | 15 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — | — | ✓ | herdado | herdado |
| `/app/ai/memory` | 21 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/ai` | 4 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/ai/proposals` | 13 | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | — | herdado | herdado |
| `/app/ai/providers` | 13 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/ai/routers/[id]` | 57 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | herdado | herdado |
| `/app/ai/routers` | 58 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/ai/runs` | 10 | — | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/ai/skills` | 17 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/ai/usage` | 17 | ✓ | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | — | herdado | herdado |
| `/app/audit` | 15 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | próprio | herdado |
| `/app/busca` | 11 | — | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/campanhas` | 62 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/carteira` | 20 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/comissoes` | 24 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/compras/[id]` | 19 | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | — | ✓ | — | — | herdado | herdado |
| `/app/compras` | 21 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/connections` | 5 | — | — | ✓ | ✓ | — | — | ✓ | — | — | — | — | — | herdado | herdado |
| `/app/contacts/[id]` | 49 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | herdado | herdado |
| `/app/contacts` | 24 | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | próprio | herdado |
| `/app/estoque` | 21 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/expedicao/[id]/fechamento` | 42 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ✓ | herdado | herdado |
| `/app/expedicao/[id]/motorista` | 42 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ✓ | herdado | herdado |
| `/app/expedicao/[id]` | 42 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | herdado | herdado |
| `/app/expedicao/[id]/rota` | 42 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ✓ | herdado | herdado |
| `/app/expedicao/nova` | 22 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/expedicao` | 25 | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/faturamento` | 20 | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/financeiro` *(resolver)* | 33 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/fiscal/configuracoes` | 17 | — | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/fiscal/eventos` | 8 | — | ✓ | ✓ | — | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/fiscal/fornecedores` | 7 | — | ✓ | — | — | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/fiscal/manifestacoes` | 8 | — | — | ✓ | — | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/fiscal/notas/[id]` | 20 | — | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal/notas` | 19 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal` | 30 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal/pendentes` | 15 | — | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal/produtos` | 7 | — | ✓ | — | — | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/fiscal/relatorios` | 11 | ✓ | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal/resumos` | 15 | — | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/fiscal/sincronizacoes` | 14 | — | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/fiscal/xml` | 15 | — | ✓ | ✓ | — | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/frota` | 17 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — | herdado | herdado |
| `/app/inbox/[id]` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/inbox` | 6 | ✓ | — | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | ✓ | próprio | herdado |
| `/app/indicadores` | 38 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | ✓ | — | herdado | herdado |
| `/app/integrations/nuvemshop` | 17 | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/inteligencia` | 10 | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | próprio | próprio |
| `/app/kanban` | 22 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | próprio | herdado |
| `/app/laboratorio` | 6 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/leads/[id]` *(resolver)* | 3 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/lgpd/requests/[id]` | 24 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | — | herdado | herdado |
| `/app/lgpd/requests` | 15 | ✓ | — | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/metrics` *(resolver)* | 15 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/meu-dia` | 19 | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | ✓ | herdado | herdado |
| `/app/notas` | 47 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app` | 65 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | próprio | próprio |
| `/app/pedidos/[id]` | 32 | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — | herdado | herdado |
| `/app/pedidos/imprimir` | 14 | — | ✓ | ✓ | ✓ | — | — | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/pedidos/novo` | 41 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/pedidos` | 42 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | — | próprio | próprio |
| `/app/pipelines/[id]` | 16 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — | ✓ | herdado | herdado |
| `/app/products` | 32 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/prospeccao/campanhas/[id]` | 27 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | próprio | herdado |
| `/app/prospeccao/nova` | 32 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/prospeccao` *(resolver)* | 61 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/radar/categorias` | 25 | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | — | — | — | herdado | herdado |
| `/app/radar/oportunidades` | 23 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/radar` | 62 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | herdado | herdado |
| `/app/radar/prospeccao` | 23 | ✓ | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | herdado | herdado |
| `/app/radar/recuperacao` | 34 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/radar/risco` | 14 | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/recuperacao` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/relatorios` | 14 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | ✓ | — | — | herdado | herdado |
| `/app/settings/api-tokens` | 16 | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ✓ | — | — | herdado | herdado |
| `/app/settings/atendimento` | 15 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/atualizacao` | 12 | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/billing` | 6 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/canal-oficial` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/settings/marca` | 25 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/notifications` | 11 | — | — | ✓ | ✓ | — | — | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/settings` | 4 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/profile` | 14 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/security` | 16 | — | — | ✓ | ✓ | ✓ | — | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/settings/templates` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/settings/tenant/agenda` | 13 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/tenant` | 15 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/tenant/pipelines` | 29 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/settings/tenant/whatsapp` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/tarefas` | 19 | ✓ | — | ✓ | ✓ | — | ✓ | — | — | — | ✓ | — | — | herdado | herdado |
| `/app/team/invite` | 14 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | herdado | herdado |
| `/app/team` | 37 | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/app/templates` | 21 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | herdado | herdado |
| `/app/titulos` *(resolver)* | 1 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | herdado | herdado |
| `/app/venda-automatica` | 27 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | — | herdado | herdado |
| `/app/webhooks` | 48 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | herdado | herdado |
| `/design` | 15 | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ | — | — | — | herdado |
| `/legal/privacy` | 5 | — | — | ✓ | — | ✓ | — | — | — | — | — | — | — | — | herdado |
| `/legal/terms` | 5 | — | — | ✓ | — | — | — | — | — | — | — | — | — | — | herdado |
| `/o/[token]` | 9 | — | — | ✓ | — | — | — | — | — | — | — | — | — | — | herdado |
| `/onboarding/connect-nuvemshop` | 10 | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/onboarding/connect-whatsapp` | 12 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — | — | — | — | herdado |
| `/onboarding/done` | 11 | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — | — | herdado |
| `/onboarding/funil` | 13 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/onboarding/invite-team` | 15 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/onboarding` *(resolver)* | 23 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | — | herdado |
| `/onboarding/setup-ai` | 21 | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | herdado |
| `/onboarding/testar` | 11 | — | — | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/onboarding/welcome` | 16 | — | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/app` *(resolver)* | 478 (teto) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | — | próprio |
| `/team/accept-invite/[token]` | 7 | — | — | ✓ | — | — | ✓ | — | — | — | — | — | — | — | herdado |
| `/vitrine-agenda` | 15 | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | ✓ | — | — | — | — | herdado |

