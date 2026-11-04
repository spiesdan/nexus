---
impacto: nada_mudou
secao: corrigido
titulo: Notas e expedição dizem o que falta, e a numeração configurada aparece na tela
---

**Notas fiscais.** A aba abria na grade sem dizer o que impedia a emissão, e a
configuração tinha um defeito que anulava o campo novo: a página lia o banco
por uma lista fixa de colunas que **não incluía `proximo_numero`** — o número
era gravado, e a tela abria vazia outra vez. Agora:

- a faixa do topo mostra **a emitir, autorizadas, com erro e na fila**, e "a
  emitir" leva para a aba de emissão;
- as pendências aparecem na ordem em que desbloqueiam — configuração →
  numeração → certificado — cada uma com o botão que resolve;
- as abas mostram contagem (`Notas`, `Emitir`) e rolam no celular;
- a configuração carrega `proximo_numero` e os campos de entrada, então o que
  está gravado é o que aparece.

**Expedição.** A lista de paradas passa a destacar as que estão **sem endereço** por um selo no cabeçalho, e mostra o endereço em vermelho quando falta — antes a parada só revelava isso ao abrir a rota, quando o mapa não tinha o quê desenhar. O endereço truncado ganhou tooltip com o texto inteiro.
