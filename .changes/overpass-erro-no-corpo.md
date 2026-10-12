---
impacto: nada_mudou
secao: corrigido
titulo: Erro do Overpass com status 200 não pode virar "zero empresas"
---

O Overpass responde **HTTP 200 com um XML de erro** quando a instância recusa a
consulta — `duplicate_query`, `timeout`, "server too busy". O parser aceitava
esse corpo como se fosse resultado.

O desfecho medido em 12/10/2026, na instalação real: uma varredura de 210
células em Calmon terminou com `encontradas: 0 · novas: 0 · erros: 0` e status
`completed`. Não existia empresa nenhuma porque o espelho estava recusando —
mas nada disso era visível.

O pior do modo de falha não é o zero, é o zero **sem erro**: o painel mostra
"Encontradas 0 · Erros 0", indistinguível de "essa cidade não tem empresas". O
operador conclui que o dado não existe, não que a fonte estava fora. É o
mesmo silêncio que o arquivo de embedding descreve em `lib/ai/embeddings/chave.ts`:
sintoma invisível que se disfarça de ausência de dado.

Agora o corpo é inspecionado antes do parse: XML de erro vira exceção com o
motivo que o espelho escreveu (`erroDoOverpass`), e a busca é marcada como
`falhou` — com o motivo visível — em vez de completar com zero.