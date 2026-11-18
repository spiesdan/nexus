---
impacto: nada_mudou
secao: corrigido
titulo: Editor de agente não baixa mais o tokenizador inteiro para mostrar uma contagem
---

O contador de tokens do editor de agente carregava o vocabulário completo do
tokenizador junto com a tela — cerca de 1 MB comprimido, baixado em toda visita,
antes de a pessoa digitar qualquer coisa e mesmo que ela nunca olhasse o número.

O pacote passou a ser carregado sob demanda, quando a contagem é feita. A tela
abre sem ele e o número aparece quando o pedaço chega.
