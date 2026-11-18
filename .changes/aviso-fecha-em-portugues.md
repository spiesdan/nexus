---
impacto: nada_mudou
secao: corrigido
titulo: O botão de fechar o aviso deixa de ser anunciado em inglês
---

O aviso (toast) do produto tem botão de fechar, e o nome acessível dele vinha
do padrão da biblioteca: **"Close toast"**. Num produto que só tem pt-BR, quem
usa leitor de tela ouvia inglês no único controle do aviso.

Agora é "Fechar aviso". Um detalhe que custou uma tentativa: o parâmetro
`closeButtonAriaLabel` do componente de avisos é aceito mas **ignorado** em
tempo de execução na versão instalada — o valor só chega por `toastOptions`. O
teste olha o nome acessível de um aviso de verdade, então uma regressão dessas
não passa.

Nada muda visualmente: posição, cores, duração e o botão continuam os mesmos.
