---
impacto: nada_mudou
secao: adicionado
titulo: "Botão Imprimir o dia, ao lado do Imprimir pedidos"
---

**Um clique imprime todos os pedidos do dia.** O botão zera o filtro para
hoje, busca os ids direto na API e abre a impressão — porque a lista na tela
pode estar paginada ou filtrada, e o "todos do dia" não pode depender do que
por acaso está visível. A tela passa a mostrar o dia impresso: o que sai no
papel é o que fica na tela, sem surpresa.

Dia vazio avisa e não navega — abrir a tela de impressão vazia pareceria bug.
Acima de 50, trunca pelo lote e avisa — nunca em silêncio. Medido em 90 dias:
o dia com mais pedidos teve 41, então o teto quase nunca aparece, mas o
código não conta com isso.

**Mutações provadas:** fetch sem `de`/`ate` (imprimiria tudo sem filtro)
reprova 2 testes; push sem `idsDoLote` (sem teto) reprova 1.