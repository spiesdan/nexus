---
impacto: nada_mudou
secao: corrigido
titulo: Fotos de produtos passam a usar thumbnails otimizados
---

A foto de capa do produto agora cai no endpoint `/storage/v1/render/image/public/...` do Supabase (width=96, quality=70) em vez de baixar o arquivo original (até 2 MB), reduzindo o tempo até a primeira imagem visível na lista de produtos.
