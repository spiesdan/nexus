---
impacto: nada_mudou
secao: corrigido
titulo: Mapa da prospecção clusteriza de verdade (Leaflet.markercluster)
---

**O mapa desenhava um marcador Leaflet por empresa — e são 4.734.** Era o
travamento que o operador viu ao arrastar a lista.

Pior: havia **duas** clusterizações rodando juntas no modo "marcadores".
`clusterizar` (`lib/prospeccao/geo.ts`, grade por zoom) criava um marcador
"falso" por célula, e esse marcador entrava no `markerClusterGroup` do Leaflet
como se fosse **uma** empresa:

```
4.734 pontos → clusterizar → ~300 células → Leaflet agrupa as células
             → o agregado contava células, não empresas
```

A tela mentia sem quebrar build nem tipo. Agora:

- **Modo "marcadores"** entrega a lista crua ao `markerClusterGroup`
  (`chunkedLoading`, `disableClusteringAtZoom: 17`, `maxClusterRadius: 70`) —
  proximidade geográfica real, zoom real, pontos só viram DOM quando o zoom
  pede.
- **Modo "densidade"** continua usando `clusterizar`, onde o agregado serve
  para dimensionar o círculo, não para virar marcador.
- O círculo do raio e o pino do centro foram para o **mapa**, não para a camada
  clusterizada: contariam como empresas no agregado.
- O ícone do agregado é o disco escuro que a tela já usava, não o azul-claro
  padrão do plugin.

A decisão de "quem agrupa" mora em `itensParaDesenho`
(`lib/prospeccao/geo.ts`), com 5 testes — **mutação provada**: trocar a
retorna por `clusterizar(...)` sempre reprova 3 deles.
