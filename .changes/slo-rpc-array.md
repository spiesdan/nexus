---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel e painel voltam a ver a série de API (RPC devolve array)
---

`fn_slo_api_resumo` é `returns table(...)`: o `supabase.rpc()` devolve um ARRAY
de linhas. Os dois leitores liam o dado como objeto, então `total` virava 0 —
com 267 amostras e p95 de 2660 ms em produção, o detector
`plataforma.slo_estourado` nunca abria ocorrência e a tela dizia "sem
histórico". Agora uma função única normaliza array/objeto e os dois leitores a
usam. Testes dirigidos com os números medidos provam total 267 no painel e na
coleta, e ocorrência de latência **crítica** no detector.
