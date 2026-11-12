---
impacto: nada_mudou
secao: corrigido
titulo: Geocodificação com número no cadastro não devolve mais a avenida como se fosse o imóvel
---
A cadeia de fallback da geocodificação fechava a fase de rua com precisão de avenida (`rua`) mesmo quando o cadastro trazia número de porta — e devolvia esse ponto como se fosse a parada. Na carga 40 (12/11/2026), as paradas 19506 (EDGAR ORLAMUNDER, Avenida Presidente Getúlio Vargas, 689) e 19542 (GALMAQ/CHG, mesma avenida, 230) colapsaram no mesmo pino (-26.4154231, -51.3182519) e a rota saiu com trecho de 0 km entre clientes diferentes.

Agora, com número no cadastro, a fase de rua só fecha com precisão de imóvel (`numero`); sem número, o trecho de rua continua aceito como aproximado (diretriz medida no OSM do interior). O ponto aproximado só volta pela cadeia de emergência (bairro/CEP/município), depois de esgotada a fase de rua.
