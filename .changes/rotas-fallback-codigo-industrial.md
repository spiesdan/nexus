---
impacto: nada_mudou
secao: corrigido
titulo: O fallback de CEP não casa indústria com número de entrega
---

A localização do endereço do motorista no mapa saía do fallback de emergência
(CEP/município) para um estabelecimento — a indústria Coca-Cola, com house
number próprio — e a classificação gravava isso como número exato do endereço
do cliente. Pin no lugar errado, fingindo precisão.

Agora só residência/um imóvel, rua ou lugar (CEP, município, bairro) conta como
ponto de entrega. Comércio, indústria e loja com house number próprio não
casa: a cadeia segue para a fase mais solta, e o CEP volta a resolver para o
município (precisão aproximada).

Corrigido na carga 030: as paradas que caíram no industrial foram desfeitas e
re-localizadas.
