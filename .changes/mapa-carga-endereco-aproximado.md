---
impacto: nada_mudou
secao: corrigido
titulo: Mapa da carga: endereço sem rua no OSM cai no município, e o cadastro completo vence o snapshot vazio
---

Na **carga 027**, quatro paradas ficaram fora do mapa mesmo com endereço no cadastro. A causa era a rua não existir no OpenStreetMap — endereço rural ("LAGEADINHO A 100 MTS DA BR", "ESTRADA GERAL DE ALTO CANOINHAS") e rua sem mapeamento no interior não casam por nome. Investigando, apareceu uma segunda causa, que atinge **658 pedidos** da instalação.

**1. A rua não existe no OpenStreetMap.** Esgotada a cadeia de rua, o geocodificador agora usa o **CEP** e o **município** e grava o ponto como **aproximado** (`nominatim:cidade`): a lista mostra **"No mapa (aproximado — cidade)"** e o motorista pode arrastar o pino. Melhor um pino honesto no município do que a entrega sumir do mapa — e nunca um pino fingindo exatidão.

**2. O snapshot do pedido nascia sem rua.** `endereco_entrega` é gravado a partir do cadastro na hora do faturamento; quando o cadastro ainda não tinha `logradouro`, o snapshot saía `", 679 — INDUSTRIAL…"` e **vencia** o cadastro já completo. Medido: **658 pedidos** nesta instalação. Agora snapshot sem rua não é escolha de destino — é dado velho —, e o cadastro preenche a linha no mapa e no romaneio.

Referência digitada de verdade continua vencendo (ex.: `"KM 89 — ZONA RURAL"`), porque tem rua/referência e não é slot vazio.
