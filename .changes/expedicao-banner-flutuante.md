---
impacto: nada_mudou
secao: corrigido
titulo: "Banner da carga flutuava sobre a lista ao rolar"
---

**O banner com totais e ações pairava 80px abaixo do topo, por cima das linhas.**
Ao abrir uma carga e rolar para baixo, o cabeçalho (total em mercadorias, a
cobrar, paradas, botões) ficava flutuando no meio da tela, com linhas da lista
visíveis acima e abaixo dele e o texto vazando por trás.

Duas causas, as duas no mesmo `className`:

1. **`sticky top-14`.** Foi escrito como se a TopBar rolasse junto ("gruda
   logo abaixo da TopBar (h-14)") — mas a TopBar é irmã do `main`, fora da
   área rolável (AppShell). O `top-14` não encostava em nada: suspendia o
   banner 80px abaixo do topo visível (medido no browser). O correto dentro do
   `main` é encostar: `sticky -top-6`, onde o `-top-6` compensa o `p-6` do
   `main`. Gap 0, medido no mesmo repro.
2. **Fundo translúcido (`bg-background/95`).** Com o banner sobre o conteúdo
   rolando, 5% de transparência é o suficiente para as linhas vazarem por
   trás. Fundo sólido.

O banner continua fixo ao rolar — voltar e ações acompanhando a rolagem era a
intenção original, e continua valendo. O que mudou é que ele agora é um
sub-cabeçalho encostado, não uma barra flutuante.

**Mutações provadas:** voltar a `top-14` reprova 2 testes do banner.