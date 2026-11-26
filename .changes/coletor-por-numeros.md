---
impacto: nada_mudou
secao: corrigido
titulo: Recuperação por número deixa de ler o período inteiro no Mercos
---

`revisar_numeros` filtrava só a **importação**: o coletor continuava percorrendo a lista do período e abrindo o detalhe de **todos** os pedidos. Medido em 26/11/2026 — um lote de 40 números leu 1.970 detalhes em 2 h e morreu no teto, três vezes, com limites diferentes (30 min, 90 min, 2 h, 3 h). O filtro existia no coletor (`--numeros`), mas o worker nunca o repassava. Agora o alvo vai junto: um lote de 40 lê 40, e a recuperação deixa de ser uma corrida contra o tempo do ERP.
