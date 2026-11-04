---
impacto: nada_mudou
secao: corrigido
titulo: "Notas fiscais" no menu leva à emissão — antes caía no módulo de notas recebidas
---

O item **Notas fiscais** do menu abria `/app/fiscal`, o módulo de NF-e
**recebidas** (notas de fornecedor). Nesta instalação esse módulo está vazio, e
a nota emitida — autorizada, número 4576 — ficava em `/app/notas`, uma rota que
não tinha porta no menu: só se chegava por "Gerar NF-e" no pedido ou pelo ⌘K.
Resultado: a pessoa clicava em "Notas fiscais", não via nota nenhuma e concluía
que a emissão não tinha acontecido.

O que mudou:

- o item do menu passa a apontar para **`/app/notas`** (emitir, acompanhar a
  SEFAZ, XML e DANFE);
- o módulo de recebimento vira **"NF-e recebidas"** no ⌘K e no próprio
  cabeçalho (título da tela), sem perder as treze telas;
- a faixa de subtelas do módulo fiscal ganha **"Emitir NF-e"** no começo;
- o orçamento de dobra do menu continua em 18 portas — a troca é de porta, não
  de tamanho.
