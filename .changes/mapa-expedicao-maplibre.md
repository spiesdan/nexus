---
impacto: nada_mudou
secao: alterado
titulo: Mapa da expedição agora é MapLibre (sem Leaflet)
---
O mapa da expedição (`app/app/expedicao/[id]/_mapa-rota.tsx`) foi migrado de Leaflet para MapLibre GL JS 6.18.0. A cartografia continua a mesma: tiles raster do OpenStreetMap, sem chave e sem custo de licença. A prospecção segue em Leaflet. Helpers puros de estilo e geometria ficam em `lib/mapas/`. Veja ADR-0003 (substitui ADR-0002).
