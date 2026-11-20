# 50 — Público/auth/estado: o passe das 16 superfícies de acesso

**Data:** 20/11/2026 · **Base:** `nexus/main` @ `cfb79ce4` (1.61.0) · **Método:**
`next dev` local contra o Supabase local, medido por
`tests/captura-publico-auth.ts` nas duas pontas (antes/depois **na mesma base**):
16 superfícies × claro/escuro × 1440/390 = **64 medições por lado**.

**Escopo:** `app/(public)` (login, esqueci, recuperação, reset, MFA, cadastro),
as quatro páginas de estado (`/403`, `/500`, `/503`, `/account-suspended`), as
duas legais, o orçamento público e o aceite de convite. As **nove de onboarding**
ficam para o passe próprio (exigem organização não finalizada — fixture que este
instrumento não monta). `/design` segue **fora de escopo** (§5 da matriz 41).

**Nenhuma regra de autenticação, token, rate limit ou RLS foi tocada.** O que
mudou é superfície: onde o formulário pousa e o que a tela inválida diz.

## O que mudou

1. **As seis telas de acesso ganharam o cartão que as telas de estado já tinham.**
   Elas flutuavam soltas sobre o canvas: no desktop, `Entrar` era texto no vazio,
   sem superfície que dissesse "é aqui que se digita". A `/503`, a um passo dali,
   já era um `Card` (surface, borda hairline, raio). O cartão entrou no **layout
   do grupo `(public)`** — uma vez, não seis: é o mesmo motivo pelo qual o logo
   mora lá (seis cópias divergem na primeira manutenção, e a que fica para trás é
   sempre a de recuperação de senha).
2. **O orçamento inválido deixou de ser um beco.** O link chega por WhatsApp e é
   aberto no celular, às vezes dias depois. O estado "Link inválido ou vencido"
   era texto solto, sem marca e sem cartão — o cliente não sabia se o link estava
   errado ou se o sistema tinha caído. Agora é o mesmo `bg-card` da página
   válida, com o nome da instalação, e herda a língua do resto do produto.

## O que NÃO foi tocado (e por quê)

- **Login/recuperação/MFA**: campos, mensagens de erro, rate limit e a corrida de
  hidratação do `captura-inbox` continuam como estavam. O passe é visual.
- **Páginas de estado**: já eram `StatusPage` (6 clones unificados antes deste
  passe); medir não achou nada a corrigir — não inventei mudança para ter diff.
- **Legais**: o conteúdo é jurídico, não design. Layout (medida de leitura,
  cabeçalho, cartão) medido sem achado.
- **`/design`**: styleguide interno, exceção declarada na §5 da matriz 41.

## Números (medidos, não olhados)

| Medida | Antes | Depois |
|---|---:|---:|
| Medições (16 × 2 temas × 2 larguras) | 64 | 64 |
| Textos avaliados para contraste AA | 552 | 556 |
| Textos **abaixo** do piso (4,5 normal / 3 grande) | **0** | **0** |
| Overflow horizontal (1440 e 390) | **0** | **0** |
| Violações axe `critical`/`serious` | **0** | **0** |
| Erros de console | 4 | 4 |

Os 4 erros de console são **o `/500` registrando o próprio 500** em cada
combinação — comportamento correto da página, não defeito. O instrumento filtra
o ruído de HMR do `next dev` (WebSocket recusado) para não transformar
instrumento em achado.

## O que a medição revelou sobre o roteamento (documentado, não "consertado")

- **`/` não tem tela**: redireciona para `/app`, e o proxy manda visitante para
  `/login?next=%2Fapp`. Está correto; a matriz deixa de tratá-la como superfície
  de design.
- **`/vitrine-agenda` exige sessão**: visitante cai em
  `/login?next=%2Fvitrine-agenda`. A matriz 41 a lista como "público" — é
  **autenticada** na prática. Corrigir isso é decisão de produto (vitrine
  pública?), não deste passe.
- **`/o/[token]` válido** não é alcançável sem um token real; o estado inválido é
  o que este instrumento mede. O caminho válido tem prova em
  `tests/e2e/` (orçamento público) e não mudou de layout.

## Capturas

`docs/auditoria/capturas/antes-publico-auth/` e `depois-publico-auth/` — 16
superfícies × claro/escuro × 1440/390, nomeadas `<rota>_<tema>_<largura>.png`, com
`medidas.json` ao lado (uma linha por medição: overflow, contraste por texto,
axe e console). O instrumento é `tests/captura-publico-auth.ts`.

## Pendente (declarado)

- **9 superfícies de onboarding** — passe próprio, com fixture de organização não
  finalizada. A matriz 41 as mantém `pendente`.
- **Vitrine pública** — hoje é autenticada; se for para ser pública, é produto.
- **Leitor de tela real** nas telas de acesso (NVDA/VoiceOver): a régua
  automatizada cobre nomes, contraste e axe; não substitui a leitura humana.
