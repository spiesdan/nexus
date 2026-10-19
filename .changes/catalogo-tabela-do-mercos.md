---
impacto: capacidade_nova
secao: adicionado
titulo: O catálogo tem a ficha e a tabela de produtos do Mercos
---

A lista de produtos era uma pilha de cartões: foto, nome, preço e três botões. Não
dava para comparar nada de relance — nem ver quais itens têm IPI, em que unidade
são vendidos ou qual a comissão de cada um — e a ficha do produto parava no preço,
no NCM e no estoque.

A tela agora é a **tabela do Mercos**: uma linha por produto, com as colunas
**Fotos · Código · Nome · IPI · Unidade · Comissão · Preço de Tabela**, o olho que
ativa e inativa o item e o **"+"** que coloca o produto numa tabela de preço. O
rodapé diz "Resultados 1 - 50 de 1.141" — o total é o do catálogo inteiro, não o
da página. Acima, os dois filtros que faltavam: **categoria** e **situação**
(todos, só ativos, só inativos), ambos do lado do servidor, para o filtro não
responder sobre a fatia de 50.

A **ficha do produto** passou a ter as quatro abas de lá:

- **Tabelas de preço** — moeda, preço de tabela, custo, marca e o preço promocional
  com validade;
- **Informações gerais** — NCM (com a sugestão automática de sempre), **IPI**,
  **comissão** e **observações**;
- **Variações** — cores e tamanhos;
- **Peso e dimensões** — peso bruto, largura, altura e comprimento da unidade **e**
  da caixa master.

No cabeçalho, sempre visível como no Mercos: nome, código, unidade de medida,
**venda em múltiplos de** e categoria (agora uma lista das categorias da loja, não
texto solto). Os botões são os de lá: *Salvar*, *Salvar e cadastrar outro* e
*Cancelar* no cadastro; *Salvar* e *Excluir produto* na edição.

Duas coisas que esta versão deliberadamente **não** faz, para não prometer o que
não entrega: **variações não geram um código por combinação** (o Mercos cria um
SKU filho para cada cor/tamanho; aqui as cores e tamanhos ficam gravados no
produto, que continua sendo um só) e a **comissão** é guardada e mostrada, mas não
entra em nenhum cálculo de folha — quem a consome hoje é a baixa de comissão.

A tabela rola na horizontal no celular, com as mesmas colunas: no telefone a
primeira dobra mostra foto, código, nome e preço, e o resto chega deslizando.
