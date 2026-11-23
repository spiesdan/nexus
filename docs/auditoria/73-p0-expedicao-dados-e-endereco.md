# 73 — P0 da Expedição: contagem particionada e entrega com endereço

**Data:** 23/11/2026 · **Origem:** auditorias `71` e `72` (`72-auditoria-expedicao-lista-motorista.md`).
Este PR conserta os **dois P0**. Nenhum P1/P2 foi tocado. Sem deploy.

## P0-1 — a faixa de situação conta uma vez

A faixa era quatro contagens independentes no cliente:

- `Concluídas` exibia `paradasNaRua` — paradas de carga **em rota** no cartão
  das concluídas (`_client.tsx:621-624` antes do conserto);
- `Aguardando embarque` contava `commercial_orders` elegíveis mesmo quando o
  pedido **já estava em uma carga**, e era link para `/app/expedicao/nova`,
  mesmo destino do botão "Nova carga" do cabeçalho.

Agora a agregação acontece **na origem**, no servidor, em
`lib/expedicao/situacao-da-expedicao.ts`, com uma regra:

> um pedido pertence à situação da carga em que está; só quem não está em
> nenhuma carga ativa entra em "aguardando embarque". Carga cancelada devolve
> o pedido à fila se ele ainda for elegível.

`page.tsx` passa `situacao` pronta ao cliente, que só renderiza. As quatro
células passaram a mostrar contagens de **pedidos** coerentes entre si:

| célula | antes | agora |
| --- | --- | --- |
| Na rua | paradas pendentes da carga | pedidos na rua |
| Montando | itens da carga | pedidos na doca |
| Aguardando embarque | fila crua + link duplicado | pedidos elegíveis sem carga + valor, **sem link** |
| Concluídas | `paradasNaRua` (de carga em rota) | pedidos concluídos |

Prova: `tests/unit/expedicao-situacao-da-faixa.test.ts`, com fixture ambíguo
(pedido `aprovado` **e** em carga `montando`) — ele aparece só em `montando`;
a soma das quatro células é sempre o total de pedidos. Captura:
`docs/auditoria/capturas/faixa-particionada-light_1440.png`.

## P0-2 — entrega exige endereço conhecido, com correção na mesma tela

Política confirmada **no código**, não inventada: "sem endereço não há ordem —
corrija o cadastro ou marque no mapa" (`_roteirizador.tsx`), "sem endereço —
corrija antes de incluir" (`_painel-pedidos.tsx`). Não há PRD autorizando
registrar entrega sem endereço. O que existia era aviso morto + "Entregue"
verde habilitado nas três entradas de desfecho.

`lib/entregas/desfecho-com-endereco.ts` é a trava comum. Nas três entradas
(mapa, detalhe e folha fechada da cabine):

- quando o endereço é desconhecido, o botão de desfecho **não aparece**: no
  lugar dele está **"Corrigir endereço aqui"**, na mesma dobra, sem rolagem;
- o motivo aparece acima, com `role="alert"`;
- o dialog de correção abre **dentro da cabine**, salva com o `PATCH`
  `/api/v1/commercial-orders/[id]` já existente e recarrega a rota;
- `desfecho()` também valida antes de chamar a API ou enfileirar no outbox.
- na folha fechada, distância e itens saem da dobra enquanto o endereço falta,
  para que a ação de destravar caiba na primeira tela.

Foi necessário um ajuste mínimo na leitura da rota
(`app/api/v1/shipments/[id]/rota/_carga.ts`): um `shipment_destinations`
com `endereco = ''` sombreava o snapshot do pedido recém-corrigido (`??` com
string vazia), então salvar o endereço não destravava o botão. Agora destino
vazio é tratado como ausente pela mesma função `linhaComRua` já usada para o
snapshot. Nenhuma outra regra de rota, transição ou migração foi alterada.

Medido no navegador, carga real `ad90f4b3…` (em rota, sem endereço):

| estado | resultado |
| --- | --- |
| antes de corrigir | `Corrigir endereço aqui` em `y=782`, `bottom=830` (visível em 844), nenhum `Entregue` |
| depois de salvar `Rua de Teste, 123, centro` | endereço aparece, `Entregue` habilitado e visível, `role=alert` removido |

O endereço do fixture foi **revertido para `null`** e o flag local `motorista`
foi desligado no mesmo comando da captura — nenhum dado de teste ficou alterado.

Capturas: `docs/auditoria/capturas/entrega-bloqueada-light_390.png`,
`docs/auditoria/capturas/entrega-bloqueada-dark_390.png`,
`docs/auditoria/capturas/correcao-endereco-light_390.png`,
`docs/auditoria/capturas/entrega-liberada-apos-correcao-light_390.png`.

## Gates

`pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (1184 arquivos / 23241 testes),
`evidencia-citada`, `expedicao-situacao-da-faixa`, `desfecho-com-endereco`,
`modo-entregador`, `outbox-entregador`, `expedicao-pagina-de-rota-layout`.
