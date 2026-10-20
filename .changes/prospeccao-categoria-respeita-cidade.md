---
impacto: nada_mudou
secao: corrigido
titulo: Categoria da prospecção conta a cidade filtrada, não a base inteira
---

O seletor de categoria da aba Empresas mostrava a contagem da organização
inteira, ignorando o recorte da tela. Com a cidade "Videira" selecionada, ele
anunciava "Oficina mecânica (115)" — o número do banco todo, não o da cidade.

Agora a contagem responde ao mesmo recorte da lista: cidade, estado, status,
busca, origem, telefone, site, WhatsApp, nota, data de descoberta e "minha
fila". A categoria já marcada não entra no próprio recorte, senão o seletor
mostraria só ela e não haveria como somar uma segunda.

A lista do seletor também é recarregada quando um filtro muda, com a mesma
espera curta do texto. Categoria marcada que fica com zero no recorte continua
visível, com o rótulo em português — escondê-la faria o gatilho voltar a "Todas
as categorias" com o filtro ligado.
