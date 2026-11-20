# 57 — Verificação de conteúdo das telas de estado (403, 404, 500, conta suspensa)

> **Base:** `main` @ `38cbb471a`, dev server único em `localhost:3002` com
> `.env.e2e` e `SUPPORT_EMAIL=suporte@exemplo.test` (para medir também o link de
> contato, que só aparece quando o operador configura o e-mail). **Data:**
> 20/11/2026. Servidor encerrado ao fim.

## O que foi verificado (e como)

Quatro critérios por rota, medidos no navegador + leitura do catálogo de cópia
em `components/nexus-ui/feedback/StatusPage.tsx`:

1. **ação de recuperação funcional** — clique em cada alvo, com destino e `<h1>`
   registrados (não basta `href` existir);
2. **sem detalhe técnico** — varredura do texto de `main` contra `stack`,
   `Error:`, `undefined`, nome de tabela, `select … from`, `supabase`, `postgres`,
   caminho de arquivo e trace;
3. **texto próprio por estado** — `<h1>` e descrição distintos, lidos do DOM;
4. **nome acessível + 44×44** — `getByRole` por nome exato, dimensões do
   retângulo, axe critical/serious e contraste AA.

Varredura antes/depois com `tests/captura-publico-auth.ts` (com `404` adicionado
ao instrumento): 4 rotas × claro/escuro × 1440/390 = **16 medições por rodada**.
Antes **21,1 s** (5,3 s/rota), depois **23,4 s** (5,9 s/rota).

```bash
BASE=http://localhost:3002 SLUGS=403,404,500,account-suspended \
  npx tsx tests/captura-publico-auth.ts <antes-estados-publico|depois-estados-publico>
```

Artefatos: `capturas/{antes,depois}-estados-publico-publico-auth/` (32 PNGs +
`medidas.json`).

## Resultado por rota

| Rota | Texto próprio | Vazamento | Ação medida | Nome + alvo | Veredito |
|---|---|---|---|---|---|
| `/403` | «403 — Sem permissão» / “Você não tem acesso a essa área.” | nenhum | Voltar → `/login?next=/app`; Voltar pra Inbox → `/login?next=/app/inbox` (h1 «Entrar» nos dois) | `getByRole` ok; 79×44 e 140×44 | **já conforme — nada tocado** |
| `/404` | «404 — Página não encontrada» / “Verifique o link ou volte pra inbox.” | nenhum | mesmas duas ações de `/403` | 79×44 e 140×44 | **já conforme — nada tocado** |
| `/500` | «500 — Erro interno» / “Algo quebrou do nosso lado. Já registramos o ocorrido…” | nenhum | Voltar → `/login?next=/app` (h1 «Entrar») | 77×44 | **já conforme — nada tocado** |
| `/account-suspended` | «Conta suspensa» / “Sua conta está suspensa…” | nenhum | **corrigido** (abaixo) | **corrigido** (abaixo) | **aplicado** |

Contraste 0 abaixo do AA, overflow 0, axe 0/0 nas 16 medições de cada rodada.
Os registros de console em `/404` e `/500` são o **próprio status HTTP** da
página (404/500), não erro de instrumento nem detalhe vazado na tela.

## O único conserto: `/account-suspended`

Dois defeitos na ação de recuperação, ambos medidos antes/depois:

| Elemento | Antes | Depois |
|---|---|---|
| “Sair” | `<a href="/login">` — link GET; nenhum POST observado no clique. A sessão antiga continuava viva: ir a `/app` devolvia à conta suspensa. | `<button type="submit">` no componente `BotaoSair` (cliente, `useTransition`: `disabled` + “Saindo…”), que POSTA a **mesma Server Action** do menu do usuário. Clique medido: `POST /account-suspended` → `/login`, h1 «Entrar». |
| contato do operador | `<a href="mailto:…">` com **139×17** | **147×44** (`min-h-11 min-w-11 inline-flex`), texto e sublinhado intactos |

O `<h1>` e a descrição da tela não mudaram. O endereço segue vindo de
`SUPPORT_EMAIL` via `emailDeSuporte()`; sem ele o parágrafo alternativo continua
sem nomear endereço nenhum (P0 de white-label preservada).

## Fora deste passe (declarado)

- O botão de troca de tema (40×40) aparece como alvo pequeno em algumas
  combinações; não é ação de recuperação destas telas e é piso do design
  system compartilhado — fora do escopo deste PR.
- O clique no `mailto:` não muda a URL (abre o cliente de e-mail); é o
  comportamento esperado do esquema, não link morto.
- A rota inexistente **anônima** continua indo para `/login?next=…` no proxy;
  `/404` direto é a página de estado medida aqui.

## Linhas da matriz `41`

`/403`, `/500` e o registro de `app/not-found.tsx` (§2.3) mantêm o veredito e
ganham a nota de verificação `57`. `/account-suspended` passa a `aplicado` com
as duas medidas anexas.
