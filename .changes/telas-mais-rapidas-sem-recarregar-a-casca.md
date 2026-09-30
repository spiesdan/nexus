---
impacto: nada_mudou
secao: alterado
titulo: Telas mais rápidas — abas, filas e o seletor de mês param de recarregar a casca do app
---

Trocar de aba (Estoque, Compras, funis, Conexões), mudar a fila do Inbox e navegar o
mês do gráfico da Home agora atualizam a URL sem pedir um novo render ao servidor: o
clique passa a ser estado local do navegador + gravação no histórico, e o mês da Home
busca um endpoint leve em vez de recarregar a página inteira. Em produção, cada um
desses cliques custava de 1 a 2 segundos — agora é imediato, com o mesmo link
compartilhável e o mesmo deep-link de antes.

As consultas que rodavam em série sem depender uma da outra (permissões do usuário,
fuso/janela/contatos da Carteira, as quatro leituras da Agenda, itens dos Relatórios e
a grade dos Indicadores) passam a correr em paralelo, e a verificação em duas etapas
deixa de repetir a mesma pergunta que a tela de Segurança acabou de receber do layout.
Recolher a barra lateral também ficou instantâneo. Nenhum número, tela ou regra de
negócio mudou.
