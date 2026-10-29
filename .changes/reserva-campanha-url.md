---
impacto: nada_mudou
secao: corrigido
titulo: Campanha com muitas empresas deixa de falhar ao validar a reserva
---

Criar uma campanha com centenas de empresas morria em "Erro ao validar as
empresas da campanha" (500) mesmo com o banco são. A checagem de reserva
mandava 400 UUIDs numa única consulta ao PostgREST — ~15 KB de URL — e o
gateway respondia `414 URI too long`; a rota transformava isso no 500 genérico.

A consulta agora usa a mesma fatia de 100 de `lib/db/por-fatias.ts` (~3,8 KB),
nas duas leituras da reserva (empresas e contatos). Campanha de 500 empresas
volta a ser validada.
