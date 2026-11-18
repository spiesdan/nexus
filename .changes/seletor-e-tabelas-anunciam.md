---
impacto: nada_mudou
secao: corrigido
titulo: O seletor de empresa diz onde você está, e o cabeçalho de tabela declara a coluna
---

O botão de trocar de empresa tinha o nome acessível "Trocar de empresa" — a
ação, nunca o estado. Quem tem duas organizações ouvia o que o botão faz e não
sabia em qual está; e o nome da empresa ativa era texto que some no celular.
Agora o rótulo compõe estado + ação ("Empresa atual: X. Trocar de empresa"), e o
item ativo do menu ganha um "atual" que o leitor de tela lê — o check é ícone,
não informação.

Nas tabelas, o cabeçalho passa a declarar `scope="col"`. Sem isso a associação
cabeçalho↔célula é adivinhada pela posição, e a adivinhação erra em tabela com
célula mesclada (as listagens usam). Os três lugares que declaram `<th>` à mão
também declaram.
