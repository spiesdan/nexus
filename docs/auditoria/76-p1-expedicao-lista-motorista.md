# 76 — P1 da Expedição: lista e cabine

Ordem da auditoria `72`. Os P0 já estão em produção; aqui só os P1 de maior impacto no dia a dia. Sem deploy, sem migration.

| P1 | Antes | Agora |
| --- | --- | --- |
| 3 | 2 dos 4 filtros (veículo/motorista some com dado real) | a origem inclui `placa`/`motorista_nome` legados no mesmo `progresso` que alimenta opções **e** filtro — medido: 2 selects no DOM em 390 e 1440 |
| 5 | `Entregue` × `Marcar como entregue` para o mesmo desfecho | um nome só, inclusive na confirmação |
| 6 | `R$ 49,90` no cartão de quem dirige | dinheiro fora da cabine; sobra número do pedido |
| 7 | "Ainda não sincronizou" morto, 11 px, sem saída | aviso com **Atualizar** na mesma linha, 12 px, e `role="alert"` quando sem rede |
| 8 | select "Qual carga você está entregando?" + 41 cartões com o mesmo destino | um lugar só para escolher: o cartão grande (41 cartões, 0 selects) |

P1-4 (ação do modo operador abaixo da dobra) ficou de fora: quem dirige usa a cabine imersiva, onde "Entregue" já está em `y=736` na primeira dobra.

Capturas: `docs/auditoria/capturas/p1-lista-{light,dark}_{1440,390}.png`,
`docs/auditoria/capturas/p1-lista-entregador-{light,dark}_390.png`,
`docs/auditoria/capturas/p1-cabine-{light,dark}_390.png`,
`docs/auditoria/capturas/p1-motorista-operador-{light,dark}_390.png`.
Overflow 0, console limpo; nomes de arquivo com o tema conferido.

Gates: typecheck, lint, `expedicao-p1-legibilidade`, `modo-entregador`, `expedicao-alvos-de-toque`, `expedicao-contrato`, `desfecho-com-endereco`, `expedicao-situacao-da-faixa`, `fragmentos-de-release`. Flag local de entregador e endereço do fixture revertidos ao final das capturas.
