---
impacto: nada_mudou
secao: corrigido
titulo: A geocodificação da carga acha a rua em vez de jogar o pino na Prefeitura
---
Três defeitos na mesma cadeia, medidos na carga 039 em 12/11/2026. O cliente BRTECH tem endereço na Rua Vereador João Alexandrina, no Industrial 1. O OSM não conhece esse nome — conhece "Rua João Alexandrina". A consulta exata falhava, a cadeia descia até o município e gravava o centroide da cidade, que cai em cima da Prefeitura. Como esse ponto falso ficava a 1,3 km da sede, a ordem por distância o escolhia como parada 1: o motorista abria o mapa e via o primeiro ponto na Prefeitura.

O mesmo acontecia com a LANCHONETE CONQUISTA: o OSM tem "Rua Saulo Carvalho", o cadastro tem "R. Saulo de Carvalho". A consulta falhava e o último recurso era o CEP 89460-000 — que é o CEP genérico do município inteiro e tem centroide em Marcílio Dias, um distrito a 4 km dali.

O que mudou:

- a cadeia de consultas agora tenta o nome como o OSM escreve: sem o título de cadastro ("Vereador", "Dr.", "Cel.") e sem o conector ("de", "da", "do"). As duas ruas acima passam a resolver na rua certa;
- o bairro entra como ponto aproximado antes do CEP e do município — quando o OSM conhece o bairro, o pino cai dentro dele, e a tela diz "aproximado — bairro" em vez de fingir cidade;
- CEP genérico (final 000) não vira ponto quando há município para consultar: o centroide de um CEP que cobre a cidade inteira pode cair em qualquer distrito, como caiu em Marcílio Dias.

Junto vai a possibilidade de corrigir um pino aproximado já gravado: "Tentar de novo" agora aparece também nas paradas de bairro/cidade e regeocodifica só aquele contato. Antes a rotina só olhava coordenada nula, então um pino errado marcado como "ok" ficava congelado para sempre. Pino marcado à mão continua intocável.
