---
impacto: nada_mudou
secao: corrigido
titulo: Página de rota com o mapa grande em cima e o worker do mapa servido de verdade
---
O mapa da expedição passou a ocupar o topo da página, largo e alto, com os números da carga (entregas, quantas estão no mapa, distância, tempo e mercadorias) numa faixa acima dele — antes esses números flutuavam **por cima** do desenho da rota, e o mapa era uma coluna estreita no meio. Os painéis de trabalho (ordem de entrega, planejamento, recuperação de endereços e distribuição por veículo) ficam abaixo, em colunas iguais.

O traçado da rota voltou a aparecer. O worker do MapLibre é um módulo `.mjs`, e o proxy de autenticação não reconhecia essa extensão como arquivo estático: respondia um redirecionamento para o login no lugar do módulo, e o navegador abortava com "non-JavaScript MIME type of text/html". Os pinos apareciam porque são elementos da página; as linhas, que dependem do worker para indexar a geometria, não. O worker agora é servido por `/maplibre-gl-worker.mjs` (200, `application/javascript`) e um teste reprova se a extensão voltar a passar pelo proxy.
