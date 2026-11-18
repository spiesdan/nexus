---
impacto: nada_mudou
secao: corrigido
titulo: Fiscal: "Emitindo" explica a saída, a reemissão mostra que está enviando e falha de leitura não vira vazio
---

Três estados da tela fiscal mentiam por omissão:

- a nota em **Emitindo** mostrava só o rótulo; a explicação ("se passar de 15
  minutos, use Tentar de novo") existia apenas no `title` do botão, que não
  aparece no toque. Agora a dica fica ao lado do status;
- a **reemissão** não tinha estado de envio — o botão seguia clicável durante a
  chamada. Agora desabilita enquanto a nota está sendo enfileirada;
- a **lista de entradas** tratava falha de leitura como "nenhuma nota ainda"
  (só um toast de 4 s). Agora mostra erro com "Tentar de novo", ou uma faixa
  acima da tabela quando já havia dados na tela.

Os vazios de entradas e de notas ganharam próximo passo (Buscar na SEFAZ /
Abrir a Visão Geral / Ver pedidos). Nenhuma regra fiscal foi alterada.
