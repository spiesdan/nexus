# Sentinel — varredura de cardinalidade 1:N (`order_id`, `contact_id`, `invoice_id`)

> **Escopo:** todo uso de `order_id`, `contact_id` e `invoice_id` no runtime do
> Sentinel — `lib/sentinel/*.ts` (fora de teste) e as superfícies
> `app/app/sentinel/**` e `app/api/**/sentinel/**`.
> **Medido em:** 20/11/2026, contra o banco local com o seed E2E
> (`supabase_db_nexus`, 185 pedidos, 10 notas, 8 vínculos, 17 recebíveis,
> 76 leads).
> **Nada aponta para produção.** Sem deploy, sem migration.

## Método

1. `grep -rn 'order_id\|contact_id\|invoice_id' lib/sentinel/*.ts` (sem testes) —
   **102 ocorrências** em 4 arquivos: `coleta.ts`, `regras-fiscal.ts`,
   `regras-operacao.ts`, `tipos.ts`.
2. `grep -rn 'maybeSingle\|\.single()' lib/sentinel/*.ts` — 3 ocorrências, todas
   em chave única (`sentinel_settings` por org, `organizations` por id,
   `insert ... returning id`), nenhuma por `order_id`/`contact_id`/`invoice_id`.
3. As superfícies `app/app/sentinel/**` e `app/api/**/sentinel/**` **não citam**
   nenhum dos três ids — a leitura é toda por `lib/sentinel`.
4. Leitura dos sítios + consultas SQL de cardinalidade no banco local.

## Sítios e veredito

| Sítio | Relação real | Como o código lê | Veredito |
|---|---|---|---|
| `coleta.ts:150` — `invoices.order_id` | uma nota pode faturar **N pedidos** (`order_id` é o principal; `invoice_orders` guarda os demais) | `pedidosDaNota()` (`regras-fiscal.ts:206`) e `notasDuplicadasPorPedido()` (`:215`) leem **principal + vínculos**; `pedidosComNfSemNota()` (`:369`) indexa os dois lados | **ok** |
| `coleta.ts:166` — `invoice_orders` | **N:N** nota ↔ pedido | idem acima, com `Set` por nota e por pedido | **ok** |
| `coleta.ts:241` — `receivables.order_id/invoice_id/contact_id` | **N parcelas** por pedido/contato | regra só testa **ausência dos três** (`regras-operacao.ts:211`); a de duplicidade agrupa por `contato+valor+vencimento` e ignora linha com `order_id` (índice único de parcela) — `:238` | **ok** |
| `coleta.ts:254` — `leads.contact_id` | **N leads** por contato/funil | `lead_duplicado` agrupa por `funil+contato`, deduplica pelo conjunto de ids e escolhe a maior confiança (`regras-operacao.ts:601`); lead sem contato fica de fora por decisão (`:626`) | **ok** |
| `coleta.ts:377,418,428` — `ocorrencia.entidade_id` → `job_queue.id` | N ocorrências podem apontar para o mesmo job | lookup por **id do job** (`Map`), não por ocorrência; eventos são agrupados por `occurrence_id` | **ok** |

## Medições no banco local (CONFIRMADO)

| Consulta | Resultado |
|---|---:|
| Notas com mais de 1 pedido (principal + vínculos) | **0** |
| Notas cujo único vínculo é secundário (`order_id` nulo, com linha em `invoice_orders`) | **0** |
| Pedidos com mais de 1 nota ativa | **1** |
| Recebíveis duplicados sem pedido (mesmo contato/valor/vencimento) | **0** |
| Pedidos com mais de 1 recebível | **0** |
| Grupos de leads abertos por (funil, contato) | **7** |
| Leads abertos sem contato | **14** |

O único pedido com duas notas ativas é **venda 4634 (finalidade 1) + devolução
4644 (finalidade 4)** — o par que a regra exclui de propósito dos **dois** lados
(`regras-fiscal.ts:224`), e que já foi o defeito corrigido na #672. Ou seja, o
número bruto “1 pedido com 2 notas” é o falso positivo que a regra **não** abre.

Os 7 grupos de leads compartilhando contato são exatamente o caso N:1 que
`lead_duplicado` trata com links por lead (PR #674); os 14 sem contato não têm
identidade para comparar e seguem fora, declarado no código.

## Suspeitas remanescentes

**Nenhuma aberta hoje.** Duas anotações:

- **S1 — evidência singular em nota agrupada.** `regras-fiscal.ts:53, 81, 106,
  156` gravam `pedido_id: n.order_id` nas evidências de nota rejeitada, travada,
  pendente e sem chave. Numa nota que agrupa N pedidos, isso mostra **só o
  principal**. Hoje são **0 notas agrupadas**, então não há impacto medido;
  a correção (trocar por `pedidos_da_nota: pedidosDaNota(s, n)`) fica como
  proposta para quando houver caso real — mexer no contrato da evidência sem
  dado que o justifique é troca de risco por estética.
- **S2 — venda + complementar.** `notasDuplicadasPorPedido` abre alerta e nomeia
  as naturezas quando duas notas vivas apontam para o mesmo pedido, inclusive
  venda + complementar (`regras-fiscal.test.ts:149`). Não é leitura 1:1: é
  decisão fiscal de mostrar as duas naturezas e deixar a conferência para quem
  lê, porque complementar é legítima e não pode ser descartada em silêncio.

## O que já estava corrigido (não reabrir)

- **#662** — divergência fiscal somava um pedido só contra nota agrupada; agora
  soma todos os vínculos (`regras-fiscal.ts:292`).
- **#672** — a evidência de duplicidade passou a nomear a natureza fiscal
  (venda/complementar/ajuste/devolução) e a excluir devolução dos dois lados.
- **#674** — `pedido_preso` passou a exigir autor humano (`created_by`) e a
  evidência de lead duplicado ganhou link navegável por lead.

## Limites

- A varredura cobre o **runtime do Sentinel**, não o banco inteiro. Views,
  relatórios e dashboards fora de `lib/sentinel` têm cardinalidade própria e
  não foram medidos aqui.
- Os números são do **seed local**, não da produção: servem para provar que o
  código não colapsa N em 1 nos casos que existem, não para afirmar volume.
- `docs/auditoria/49-sentinel-design.md` descreve a tela; este doc descreve as
  relações que alimentam as regras.
