# 23 — Numeração: pedido local × Mercos (decisão do dono, 23/11/2026)

> **Fato medido:** quatro pedidos LOCAIS (19669–19672, todos com nota emitida)
> tomaram números que o Mercos também usava. A importação os pulou como
> `numero_ja_existe`; o dado do ERP não entrou e nenhuma tela mostrou. Renumerar
> os quatro quebraria documento fiscal.

## Decisão do dono: opção (a) — série local separada

Pedido local nasce em **900000** (`fn_proximo_numero_pedido`), o contador é
exclusivo dele e a importação do Mercos continua gravando o número do ERP.
Nenhum pedido existente é renumerado. Colisão detectada na importação gera
linha visível em `mercos_colisoes` e o pedido do ERP entra com número da série
local + `numero_mercos` preservado.

## As outras duas opções — NÃO escolhidas, registradas com consequência

| Opção | O que muda | Consequência | Custo |
|---|---|---|---|
| **(b) pedido local nasce no Mercos** | O Nexus grava o número do ERP como número canônico e passa a escrever no ERP | Fim estrutural da colisão; uma única numeração. Exige write-back no ERP, tratamento de falha parcial e reconciliação com o que o ERP já emitiu | Alto: integração de escrita, idempotência e janela de falha; muda o fluxo do vendedor |
| **(c) Nexus não numera mais** | Todo pedido fiscal exige número vindo do Mercos antes de existir | Simples no código, mas trava a criação quando o ERP está fora e muda o comportamento do vendedor | Médio no código, alto no processo: exige número externo para vender |

A opção (a) foi escolhida porque é reversível, não mexe em documento emitido e
não depende de escrita no ERP. Ela **não elimina** a colisão por si só — por
isso a visibilidade (`mercos_colisoes`) e a varredura de buracos andam juntas.
Se (b) ou (c) forem adotadas depois, as duas últimas continuam válidas.

## O que é implementado agora

- `numero_mercos` em `commercial_orders`: identidade da importação; reimportar
  o mesmo pedido não cria outro (`skipped/ja_importado`).
- `mercos_colisoes`: uma linha por `(organization_id, numero_mercos)` com os
  dois clientes nomeados, valor, `visto_em`, `resolvido_em` e
  `pedido_importado_id`.
- Coletor: compara o que já viu com `numero_mercos` no banco e reprocessa até
  `MERCOS_MAX_BURACOS` (default 50) números perdidos por rodada.
- `GET /api/v1/mercos/colisoes`: contrato para a tela do D.

**Não foi deployado.** A contagem histórica de produção depende de rodar a
varredura na VPS; este doc não afirma número que não mediu.
