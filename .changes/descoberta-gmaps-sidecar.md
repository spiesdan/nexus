---
impacto: capacidade_nova
secao: adicionado
titulo: Descoberta de negócios por Google Maps em modo HTTP, sem Places API
---

Um serviço próprio (`maps-scraper`, atrás do profile `maps` — desligado por
padrão) lista negócios de uma região sem Places API, sem chave e sem conta. A
imagem empacota o binário `google-maps-scraper` 1.21.0 (MIT, commit 3176636) em
distroless, sem o Chromium da imagem oficial: ~28 MB comprimida em vez de 2,0 GiB.

Medido em 10 buscas seguidas: 2,1–3,0 s por busca, pico de 28,3 MB de RAM, zero
CAPTCHA/403, 12,4 a 12,8 dos 13 campos por registro. O modo navegador do mesmo
binário custa 1,03 GB e 35 s — por isso não entra.

O serviço não publica porta e não sobe sem a flag; o `runner.mjs` fala com a API
de jobs dele e entrega JSONL no formato que o importador de prospecção já lê.
