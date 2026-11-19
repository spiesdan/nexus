---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel encerra ocorrência por regra avaliada e deixa de truncar no volume real
---

A varredura da organização real sempre terminava truncada, então
`encerrar_ausentes` nunca rodava e ocorrências já corrigidas ficavam abertas
para sempre. A medição com o volume real mostrou que o corte não era o orçamento
de detecção (65 ms), e sim os tetos de coleta: 1,5k pedidos contra teto de 500 e
1,2k produtos com diferença de estoque contra teto de 500.

Os tetos foram elevados com número medido (coleta 4,2 s, detecção 262 ms, dentro
dos 8 s) e o encerramento passou a ser por regra avaliada: quem rodou e não achou
fecha; quem não rodou, ou viu snapshot incompleto, fica intocado.
