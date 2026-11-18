---
impacto: nada_mudou
secao: adicionado
titulo: Mercos: catálogo de produtos coletado e itens históricos ligados por código
---

O worker só lia `/pedidos/`. Produto que nunca apareceu em pedido nunca entrava
no catálogo — e o item dele ficava sem `product_id`, sem NCM e sem unidade na
emissão. Medido em produção: **616 itens** sem vínculo em **72 códigos**.

Agora existe coleta de `/produtos/` (com as colunas mapeadas pelo cabeçalho, não
por posição), importação por `(organização, código)` em dry-run por padrão, e um
relatório com **criados / atualizados / divergentes / sem código**. Produto que já
existe com nome diferente do ERP tem o preço atualizado e o **nome preservado** —
os dois nomes aparecem no relatório.

Os itens históricos são religados **só por código exato**. Candidatos por nome e
por código com zeros à esquerda são apenas relatados: dos 616 itens, 3 casariam
por nome, e de forma ambígua (dois "ESPONJA COM 4 UN", códigos 806 e 8147).
Escolher um deles no chute seria escolher o NCM errado.

Runbook: `docs/runbooks/mercos-catalogo.md`. Nada foi executado contra produção.
