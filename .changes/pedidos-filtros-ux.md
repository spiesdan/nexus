---
impacto: nada_mudou
secao: alterado
titulo: "Filtros de pedidos num painel só, com rótulo e sem controle morto"
---

**Os filtros eram quatro zonas espalhadas com um controle que mentia.** Busca
solta com link falso ("Pesquise por nota fiscal..." só abria os avançados),
frase com selects de 13px sem rótulo, um select "Envio" que não filtrava nada
— clicável, sério e morto — e avançados com o "meus" duplicado.

Agora é um painel só: busca, Status, Vendedor, Origem e Período, cada um com
rótulo, mesma altura, mesma borda. Chips e avançados continuam onde estavam.
Comportamento 100% preservado — inclusive o atalho "meus" (vive no select de
vendedor) e a contagem dos avançados.

**Mutações provadas:** nenhuma nova — a prova aqui é visual (Playwright
contra dev local com banco semeado, desktop 1440 e mobile 390) mais os 19
testes de render/filtro existentes, que passam sem tocar.