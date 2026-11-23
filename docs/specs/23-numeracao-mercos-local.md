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
- **Reconciliação (0345/0346)**: `scripts/mercos-reconciliar.mjs` grava
  `mercos_reconciliacoes` por `(run_id, numero_mercos)`. O **censo vem da LISTA**
  (`--lista`, gravada pelo coletor com `--lista-saida`), não do detalhe: abrir
  5.929 detalhes custa ~12 h medidos; percorrer a lista leva minutos. O detalhe
  (`--detalhes`) só é consultado para o que está ausente ou colidiu. Janela de
  garantia: **30 dias** por padrão (`MERCOS_RECONCILIAR_DIAS`);
  `registros_sem_data` e `registros_fora_da_janela` são **contados e declarados
  como fora da garantia** — nunca viram "zero ausentes" por omissão.
- `GET /api/v1/mercos/colisoes`: contrato para a tela do D.

## Medição do dono (23/11/2026) — o que mudou no desenho

```
lista 24/10→24/11 ................. 5.929 pedidos  (minutos)
abrir 1 detalhe ................... ~7,7 s         (12 h para 5.929)
amostra: 394 detalhes (19338→19731) · 393 no banco · 1 ausente por número
o ausente: 19639 — OFICINA MECANICA DO NEY, 16/11, 0 itens, total 0,00
perdas reais: 4 COLISÕES (19669–19672) — número existe, cliente é outro
```

Consequências implementadas:

1. **Comparar pela lista, nunca pelo detalhe.** Número + data vêm do cartão;
   o detalhe só se abre para ausente/colisão e é o que decide a importação.
2. **Colisão entra na conta por identidade**, não por número. Número presente
   com cliente diferente vira `colisao` (não `importado`): comparar só número
   daria "zero ausentes" com 4 pedidos perdidos — o pior resultado possível.
   `mesmoCliente` usa documento quando os dois lados têm e nome normalizado
   (caixa/acento/pontuação) quando a lista não traz documento.
3. **Pedido sem item não é perda.** Vira `ignorado_sem_itens` (visível na tela),
   não `ausente`. Ausente sem detalhe fica em `sem_detalhe` — fora da prova.
4. **Prova em duas rodadas** com o mesmo `run_id`: rodada 1 lista
   `ausentes_por_numero`, `colisoes_por_identidade` (deve conter 19669–19672) e
   `ignorados_sem_itens` (19639); rodada 2 devolve `ausentes_depois = 0` e
   mantém as colisões no artefato com `resolvido_em` preenchido. A colisão não
   desaparece quando o pedido é recuperado — senão a prova apagaria o defeito.
5. **Cobertura é resultado, não detalhe (0347).** O coletor grava
   `<lista>.meta.json` com `censo_esperado` (o `lista fechada: 5.929 pedidos`).
   Toda linha ilegível é contada em `linhas_ilegiveis`, nunca descartada em
   silêncio. `status = incompleta` se o censo lido for menor que o esperado,
   se faltar a meta, se houver linha ilegível, registro sem data ou erro de
   leitura/escrita. **Regra de ouro:** só `status = completa` **e**
   `ausentes = 0` autorizam dizer "nenhum pedido de fora"; qualquer outra
   combinação vira "não verificado: <motivo>".

`GET /api/v1/mercos/colisoes` devolve, no mesmo payload, `resumo` com
`{ run_id, quando, censo_lido, censo_esperado, ausentes, colisoes,
ignorados_sem_item, status, verificado, motivos, declaracao }` da última
rodada — a tela mostra o bloco sem precisar de outra rota.

**Não foi deployado.** As contagens acima são as que o dono mediu no container
em somente leitura. A contagem de produção depende de rodar a reconciliação na
VPS com o JSONL da lista; este doc não afirma número que não mediu.
