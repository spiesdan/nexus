---
impacto: nada_mudou
secao: adicionado
titulo: Cargo "Vendedor", e a tela de equipe em português
---

**A tela de equipe mostrava "Role" e o valor cru do enum.** O operador lia
`agent`, `viewer`, `manager`. O rótulo estava hardcoded em inglês, sem passar
pelo `t()`, e as opções mostravam o enum em vez do nome.

O produto **já tinha** o mapa: `PAPEIS_HUMANOS` e `ROTULO_DO_PAPEL` existem em
`lib/auth/types.ts` e ninguém usava. Por isso três telas mostravam o enum cru.
Ligar o que existia foi o conserto.

**Cargo novo: `vendedor`.** Entra no nível 2, o mesmo do `agent`. Quem vende
precisa de pedido, prospect, inbox e conversa — que é o que o atendente já tem.
Cargo novo com nível novo seria decisão de segurança disfarçada de rótulo:
subir o vendedor acima do atendente daria a ele o que o gerente tem sem
ninguém pedir. Este papel é um **nome** para o que o atendente já podia.
Consequência deliberada: `requireRole("agent")` libera o vendedor.

**Duas portas no banco, e as duas importam.** O CHECK de `role` impede gravar
papel desconhecido; `fn_role_at_least` é a escada que a RLS consulta. Sem a
segunda, o vendedor cai em `false` em **toda** política — "entra na empresa" e
não vê nada, sem erro nenhum.

**Quatro cópias do vocabulário de cargos** era a origem da divergência:
`lib/auth/types.ts`, o CHECK do banco, `lib/schemas/team.ts` e
`sendOnboardingInvites.ts`. As três de código agora derivam de
`PAPEIS_HUMANOS`, e um invariante compara com o CHECK do banco — é ele que
impede alguém de acrescentar um papel no TypeScript e esquecer o banco, o que
faria o convite aceitar algo que o INSERT recusa.

`ai_operator` **não** entra, e está certo: é o papel do agente publicado e
nunca é gravado em `user_organizations`. Um teste afirma isso, para que a
próxima pessoa não "conserte" a escada acrescentando um papel que não pertence
a ela.

**Produtos.** `fotosIniciais={fotosPorProduto[p.id] ?? []}` criava um array
novo a cada render, e o efeito do filho compara **identidade**. Com 641
produtos, abrir a edição fazia o ciclo inteiro rodar de novo.

**Quatro correções que os testes exigiram, e que estavam certas:**

- meu comentário **dentro do corpo** da função ia para o `prosrc` e quebrava
  `papel-do-agente-publicado`, que afirma que `ai_operator` não aparece ali;
- o apêndice do baseline foi para **depois** do bloco da varredura de anon,
  que é auto-curativo e só cura o que foi criado **antes** dele;
- criei o teste de invariante em `tests/invariantes/` em vez de
  `tests/invariants/`, e ele rodava na suíte unitária sem banco;
- meu próprio teste lia só a **primeira linha** do `pg_get_functiondef` — o
  corpo vem depois — e buscava `search_path = 'public'` num texto que o
  Postgres normaliza para `SET search_path TO 'public'`. O banco estava certo;
  o teste é que não media.

Suíte: **8.352 unitários** e **148 arquivos de invariante** (1.353 testes).
