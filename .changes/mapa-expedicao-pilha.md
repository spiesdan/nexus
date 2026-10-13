---
impacto: nada_mudou
secao: corrigido
titulo: "A tela de expedição desenhava por cima do cabeçalho — e o mapa da prospecção nunca foi consertado de fato"
---

**Elementos por cima do mapa ou por trás dele na tela de expedição.** Os dois
sintomas são o mesmo defeito: o contêiner do mapa não tinha stacking context
próprio.

O Leaflet escreve z-index nos próprios panes — 400 overlay, 600 marcadores, 700
popup, 800/1000 controle — em pixels, na **mesma pilha da página**. O cabeçalho
da ficha de expedição é `sticky top-14 z-10`: popup e marcadores (600/700) ficam
**acima** dele, e o mapa invade o cabeçalho ao rolar. E `Dialog`/`Sheet`, que
usam `z-50`, ficam **atrás** do mapa.

**O mapa da prospecção já tinha `isolate` — e nunca foi conserto de verdade.**
Foi aplicado numa tela e esquecido na outra: mesmo sintoma, outra tela, mesma
causa. Pior, medindo no browser, `isolate` e `z-0` chegam ao mesmo resultado
por caminhos independentes:

    sem nada → MAPA por cima do cabeçalho   ❌
    isolate  → CABEÇALHO por cima            ✅
    z-0      → CABEÇALHO por cima            ✅

`z-0` cria o stacking context pelo caminho mais fundamental — elemento
posicionado com `z-index` diferente de `auto` — e não depende do apelido da
propriedade. Os dois mapas agora levam `relative isolate z-0`: se um deixar de
funcionar por qualquer motivo, o outro segura.

**Um detalhe que quase virou diagnóstico errado.** O utilitário `isolate` do
Tailwind 4.3.3 gera `isolation: isolate` — repare no NOME DA PROPRIEDADE, que é
o apelido antigo. Escrever `isolate:` (o nome novo da padronização) à mão em CSS
é outra coisa: o browser de verificação não reconhece e descarta a
declaração em silêncio, sem aviso. A primeira leitura desse bug foi essa, e
levou ao comentario errado no código — medir no browser, e não de olho no nome
da classe, foi o que corrigiu.

**O teste trava os dois juntos** (`leaflet-isolado-em-contexto-de-stack.test.ts`)
e vale para qualquer mapa novo: varre o repo, acha quem instancia `L.map()` e
exige `isolate` ou `z-0`. O leitor de `className` remove comentários antes de
buscar, porque a primeira versão dele achava `z-0` **dentro do comentário** que
explica o conserto — e a mutação que tirava a classe do JSX passava verde. Um
teste que lê o próprio texto explicativo mede a documentação.

**Mutações provadas:** tirar `isolate` e `z-0` do mapa de expedição reprova;
tirar do mapa de prospecção reprova; e o leitor ler o className em vez do
comentário está coberto por teste próprio.