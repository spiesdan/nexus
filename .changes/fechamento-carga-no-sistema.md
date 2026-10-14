---
impacto: nada_mudou
secao: adicionado
titulo: "Fechamento de caixa da carga sai do papel e vive na tela da expedição"
---

**O PDF de romaneio imprimia a conferência de caixa como oito linhas vazias.**
Dinheiro, PIX, cartão, cheques, boletos, menos vale ao motorista, menos
combustível e menos outras despesas — mais total líquido e diferença. O papel
era preenchido à mão, guardado em arquivo físico, e a diferença era conferida
de olho.

A rota `/romaneio` agora imprime **só o romaneio**, que é o que o motorista
leva. O fechamento vive na tela da carga, com todas as opções que o PDF tinha:
resumo financeiro, cobrança por parada com ☐, a cobrar por condição (prepare
troco e maquininha), as oito linhas de caixa com a conta feita, ocorrências e
devoluções, e quem conferiu — em nome e hora gravados, não em assinatura no
papel.

**A conta é a mesma do PDF, com o sinal certo.** Entradas menos saídas dá o
líquido; líquido menos o a cobrar dá a diferença, positiva quando sobrou e
negativa quando faltou. O caso mais perigoso — as três despesas entrando com
sinal positivo, o que faria o caixa "bater" com dinheiro que nunca entrou —
está travado por teste com a mutação aplicada.

**O que o PUT grava, e o que ele calcula.** O corpo informa o que foi contado
e o que foi conferido; as somas são calculadas pelo servidor, nunca aceitas do
corpo. O conferente informa o que contou — aceitar o total dele seria o oposto
de conferir.

**O que impede o fechamento, e o que só avisa.** Nenhuma parada conferida é
erro que impede gravar: sem conferência, o "fechou" é uma declaração. Diferença
diferente de zero é só aviso — troco a menos acontece todo dia, e o que não
pode é passar sem ninguém ver. Quem pode fechar e qual diferença é aceitável
não estão escritos neste repositório, então não foram inventados: o código
exige só o que é verdade física, uma linha conferida.

**Gravar não dá baixa.** Fechar caixa é conferir dinheiro; dar baixa é outra
decisão, com regra própria no `POST /conciliar`. Juntar as duas num ato só
seria a mistura entre operação e dinheiro que a regra proíbe, e a tela diz
isso ao lado do botão.

**O schema**

Migration 0268, com apêndice idempotente no baseline e linha no MANIFEST, os
três. Tabela `shipment_closings` (uma linha por carga, somas calculadas no
servidor) e `shipment_orders.conferido` (o ☐ do papel, independente do status:
status diz o que aconteceu na rota, conferido diz se alguém olhou).

Duas coisas que o caminho achou. A primeira teria quebrado o `update.sh` na
VPS: o apêndice concedia privilégio numa sequência que não existe, porque a
tabela usa `id uuid` e não serial. A segunda é regra de segurança: o apêndice é
escrito DEPOIS do bloco de varredura `anon` do baseline, então o `revoke` ficou
dentro do apêndice — reordenar os dois reabre a tabela para a anon key, e isso
está comentado no arquivo e travado por invariante.

**Mutações provadas**

| mutação | reprova |
|---|---|
| despesa com sinal trocado na conta | 6 testes |
| duplicata de linha descartada em vez de somada | 4 testes |
| esperado aceito do corpo em vez do banco | 2 testes da rota |
| gate de "nada conferido" removido | 1 teste da rota |
| diferença virando erro em vez de aviso | 1 teste da rota |
| `isolate`/`z-0` fora de qualquer mapa | o teste de pilha |