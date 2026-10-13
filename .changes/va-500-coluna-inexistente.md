---
impacto: nada_mudou
secao: corrigido
titulo: "Criar venda automática devolvia 500 — a rota escrevia uma coluna que não existe"
---

**O botão "Criar venda automática" devolvia 500 em toda tentativa.** A rota
`POST /api/v1/automatic-sales/campaigns` escrevia `created_by` no insert — e
essa coluna **não existe** em `automatic_sales_campaigns`, nem no banco de
produção (medido em 13/10/2026) nem em `lib/database.types.ts`.

O Postgres responde `column not found` e a rota devolve 500. Nenhuma campanha
foi criada, nenhuma mensagem saiu.

**Por que o typecheck não pegou.** O `.insert()` do cliente Supabase não é
estrito o bastante para reclamar de uma chave a mais. A pista é que `created_by`
existe em outras tabelas, como `commercial_orders` — então ler uma rota que usa
e concluir que o padrão vale para todas parece certo, e não é.

**O teste agora é geral, não desta coluna.** `rotas-nao-escrevem-coluna-
inexistente.test.ts` compara **toda** chave escrita no insert com as colunas
que o tipo gerado declara — e tem duas guardas de vácuo, porque um `Set` vazio
faz todo `expect` passar. É a mesma classe do `comando_da_conversa` (que é
função, não coluna), e as duas apareceram na mesma semana.

Quem criou a campanha continua registrado em `api_audit_log`. Adicionar a
coluna de verdade, se um dia for preciso, é decisão de schema — e entra por
migration + apêndice do baseline + MANIFEST, com as três.

**Mutação provada:** readicionar uma coluna inexistente no insert reprova o
teste `toda coluna escrita existe no tipo gerado do schema`.
