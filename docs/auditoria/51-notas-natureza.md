# 51 — Notas: a natureza da nota vira visível (caso 19560)

**Data:** 20/11/2026 · **Base:** `nexus/main` · **Método:** recorte de design +
exibição de dado que já existia. Medido em `next dev` no Supabase local com uma
**fixture criada** para reproduzir o caso.

## O caso (pedido 19560)

Duas NF-e **autorizadas**, mesma venda, R$ 70 cada. Lidas na tela, pareciam
duplicidade — o dono corrigiu: *"uma de cancelamento, outra de venda"*. No banco:

```
NF 4634 · autorizada · R$ 70 · extras_fiscais.finalidade ausente → 1 (normal, venda)
NF 4644 · autorizada · R$ 70 · extras_fiscais.finalidade = 4      → DEVOLUÇÃO
                              extras_fiscais.ref_nfe preenchida    → aponta a original
```

A regra do Sentinel **já** ignorava finalidade 4. O defeito era de **tela**: a
lista chamava as duas de "autorizada" e somava as duas.

## O que mudou

1. **Selo de natureza por nota**, lendo `extras_fiscais.finalidade` com a regra
   do banco — `coalesce(nullif(trim(finalidade),'')::int, 1)`:
   **1 Venda · 2 Complementar · 3 Ajuste · 4 Devolução**; ausente/vazia/inválida
   é **1**, porque 1 é o default fiscal, não um "desconhecido". Venda usa selo
   neutro (não compete), devolução usa âmbar (salta).
2. **Devolução diz de quem**: quando há `ref_nfe` (chave de 44 dígitos), a linha
   mostra **"devolve a NF 4634/1"** — e vira botão que expande a original quando
   ela está na lista carregada; sem a original à vista, o texto aparece com os 8
   primeiros dígitos da chave, sem prometer link que não existe.
3. **A soma não mistura natureza**: a faixa passa a dizer
   **"10 Notas · R$ 469,20 venda · R$ 70,00 devolução"** e o rodapé separa
   venda/devolução e só então o total com "(inclui devolução)". Sem rateio
   inventado: os números são as somas cruas de cada grupo.
4. **Nada de regra nova**: `finalidade` e `ref_nfe` já existiam no jsonb; a
   função pura mora em `lib/fiscal/natureza-da-nota.ts`.

## A fixture (criada, não inventada)

O banco local não tinha o caso, então criei duas notas para o pedido
`b542638b…`: `4634` com `{}` (venda) e `4644` com
`{"finalidade":4,"ref_nfe":"<chave da 4634>"}`. A captura usa exatamente essas
duas, como no relato do dono.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 163** textos abaixo do mínimo |
| Contraste AA (claro) | **0 de 163** |
| Overflow horizontal | **0** em 1440 e 390 |
| Console | **0** |
| Testes da regra | **13** (8 novos da natureza + 5 do re-emitir) |

Antes: `10 Notas · R$ 539,20` e duas linhas idênticas.
Depois: `10 Notas · R$ 469,20 venda · R$ 70,00 devolução`, `Devolução` +
"devolve a NF 4634/1" na 4644, `Venda` na 4634.

## Capturas

`capturas/antes-notas/` e `capturas/depois-notas/` — claro/escuro × 1440 e 390.

## O que não foi tocado

- Emissão, cancelamento, reemissão, XML/DANFE, SPED e configuração fiscal.
- O motor do Sentinel (que já tratava finalidade 4).
- Filtro por natureza: **não entrou** — a barra já tem status/período/modelo e
  um quarto controle polui. Fica como opção declarada, não como omissão.
