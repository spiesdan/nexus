---
impacto: nada_mudou
secao: corrigido
titulo: No tema claro, o produto volta a pintar a própria paleta (a camada de terceiro não vence mais)
---

A biblioteca visual vendorizada declara os mesmos nomes de token num seletor
mais específico (`:root[data-theme="light"]`), e no tema claro ela vencia o
`[data-theme="light"]` do produto. Medido no navegador: o fundo da página saía
`#f1f1f4` (o produto diz `#f6f7f9`), a divisória `#e4e4e9` (`#e7e9ee`) e o
texto `#0d0d12` (`#181925`). No escuro o produto ganhava; só o claro ficava com
a paleta de terceiro.

Os quatro tokens que colidiam saíram da camada de terceiro, e o texto dela
passou a apontar para o token do produto. Agora os dois temas pintam a mesma
paleta: fundo `#f6f7f9`/`#151515`, texto `#181925`/`#f4f4f4`.

Junto: o instrumento de contraste ganhou `--rotas` (medir sem sessão) e passou a
**mesclar** o artefato em vez de sobrescrever — uma rodada de 4 rotas apagava as
8 anteriores.
