---
impacto: nada_mudou
secao: corrigido
titulo: AGENTS.md perde os dois últimos números que não se medem
---

O arquivo já está na régua "conte, não cite" desde 18/11/2026, mas duas linhas ainda afirmavam número: "89 rotas o usam" (service role) e "`Idempotency-Key` em 1 rota". O medido hoje é 284 arquivos com service role e 8 rotas com idempotência — a primeira errada por 3×, a segunda por 8×. Ambas passam a trazer o comando, com a data da medição ao lado para o número não ser lido como estado atual.
