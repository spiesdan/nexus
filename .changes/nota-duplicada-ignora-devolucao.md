---
impacto: nada_mudou
secao: corrigido
titulo: Devolução deixa de ser contada como nota duplicada pelo Sentinel
---

O Sentinel acusava duas notas vivas no mesmo pedido sem olhar a finalidade. Uma
devolução (`finalidade=4`) é a segunda nota por natureza: o banco já sabe disso
desde a correção que separou devolução de venda, e o detector agora usa a mesma
regra. Venda + devolução e devolução + devolução não abrem ocorrência; duas
vendas vivas continuam abrindo.

A evidência passa a mostrar as `finalidades` do grupo. O falso positivo já
aberto fecha no próximo ciclo completo de varredura, pelo encerramento por
ausência — sem apagar o histórico.
