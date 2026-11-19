# 44 — Os 103 KB do inbox: três cortes medidos que não pagaram

**Data:** 19/11/2026 · **Base:** `nexus/main` @ `d56d1fba` (#612) · **Método:**
o mesmo do doc 42 — `pnpm e2e:build`, `.next/diagnostics/route-bundle-stats.json`,
gzip 9, um build por vez. Local, não produção.

## Ponto de partida (#612)

| Rota | Gzip |
|---|---:|
| inbox | **503 KB** |
| base compartilhada | 383 KB |
| login | 228 KB |

Alvo do #602: inbox ≤ 400 KB. Distância: **103 KB**.

## Experimento A — AudioRecorder lazy + date-fns → Intl

**Medido:** inbox **501 KB** (−2 KB), compartilhada 384 KB, login 228 KB.

## Experimento B — só AudioRecorder lazy (date-fns de volta)

**Medido:** inbox **505 KB** (+2 KB vs. #612), compartilhada 383 KB, login 228 KB.

**Derivado:** a troca de date-fns por `Intl` valeu **−4 KB**; o lazy do
AudioRecorder **custou +2 KB**. Nenhum dos dois entrega o que a estimativa do
doc 43 prometia.

## Por que as estimativas erraram

### AudioRecorder não era 27 KB

O chunk de 27 KB que o doc 43 associou ao gravador (marcador `audio`/`xlsx`) é,
na verdade, o **Composer + AttachMenu + AttachmentPreviewDialog +
ContactPickerDialog + Emoji** (`2xphpc…` no build B). O módulo real do
`AudioRecorder` é **3,3 KB raw** (`2v81l0_pw7-2f.js`) e **saiu** do first load
com `next/dynamic` — a prova é que o chunk não aparece em
`firstLoadChunkPaths`. O que entrou no lugar foi o botão placeholder + o runtime
do `dynamic` no Composer: **+2 KB** no inbox. Ganho líquido: negativo.

### date-fns não era 33 KB de biblioteca

O chunk `2bct4pz710ove.js` (33 KB gz) desapareceu quando o inbox parou de
importar `date-fns`. Mas o Turbopack **regrupou** o código que convivia nele:
surgiram chunks de 26 KB e 13 KB com componentes do inbox (ChatThread etc.),
e o líquido foi **−4 KB**, não −33 KB. O chunk anterior não era só biblioteca.

## Experimento C — diálogos secundários do Composer

**Medido:** inbox **504 KB** (+1 KB vs. #612), compartilhada 383 KB, login
228 KB.

Os dois diálogos saíram do first load de verdade: os chunks lazy
`0i5w8abnvpmpa.js` (AttachmentPreview, 2,1 KB raw) e `3jb7dezq-2wvm.js`
(ContactPicker, 5,9 KB raw) **não aparecem** em `firstLoadChunkPaths`. Mesmo
assim o total do inbox subiu 1 KB: o runtime do `dynamic`, os wrappers e o
regrupamento custaram mais do que os 8 KB separados. **Revertido** — +1 KB
também não passa.

## Decisão: reverter os três

- **AudioRecorder:** reverter. `não regredir` é regra; +2 KB não passa, e o
  benefício real (3,3 KB) não paga o placeholder.
- **date-fns → Intl:** reverter. −4 KB não paga o risco de mudar texto de data
  relativa em seis componentes e o custo de manutenção dos helpers; o alvo
  continua longe mesmo com ele.
- **Diálogos lazy:** reverter. Os chunks separados não entram no first load,
  mas o total subiu 1 KB; o ganho de 8 KB foi comido pelo runtime/wrappers.

O código volta ao estado do #612. **Nenhuma rota regrediu**; inbox segue
**503 KB**, faltando **103 KB**.

## Experimento D — arquitetura (parado antes do código)

Analisei os dois alvos grandes. **Nenhum é um corte de componente; os dois
exigem mudança de arquitetura**, então parei antes de escrever código, como a
regra da fatia manda.

### Supabase client — 61 KB, 6/6 rotas

`hooks/auth/AuthProvider.tsx` chama `createClient()` **no render**
(`useRef(createClient())`), e `lib/supabase/browser.ts` importa
`@supabase/ssr`/`@supabase/supabase-js` estaticamente. O client é usado por 7
arquivos (auth, realtime de inbox, alertas, canais, merge de contatos,
roteirizador, public-env). Tirar do first load exige:

- trocar `createClient()` síncrono por um acessor assíncrono (`getSupabase()`),
  ou criar o client só depois da hidratação;
- revisar refresh de sessão (hoje `setInterval` de 40 min no provider) e
  `signOut`, que passam a esperar o módulo;
- provar que realtime do inbox continua assinando depois da hidratação;
- atualizar 7 call sites + testes de auth/realtime.

**Risco:** atrasar a sessão no boot da casca é exatamente o tipo de mudança que
pode trocar um ganho de 61 KB por tela piscando/401 intermitente. É trabalho de
arquitetura com dono, não um experimento de uma tarde.

### zod — 31 KB, 4/6 rotas

O chunk `311w6il3iuk2p.js` é zod puro (155 marcas `Zod`), mas o caminho que o
traz ao inbox não é um import óbvio: `lib/schemas/messaging.ts` **não** é
importado pelo inbox, e o único import de schema no inbox é `import type`
(apagado). Antes de cortar, é preciso mapear o grafo com o bundle analyzer; um
corte no lugar errado só move o chunk de nome. Sozinho, 31 KB **não** atinge o
critério de 40 KB.

**Conclusão do D:** não há experimento de arquitetura que caiba em “um build,
mesma régua” sem mudar o contrato de sessão/hidratação. Não rodei build novo
porque não houve código novo — e não vou fingir ganho que não medi.

## O budget declarado de 250 KB

O número **nunca foi medido**. Ele nasceu em `5d0cdb5c` (28/04/2026,
“EPIC-12 … partial”) como alvo de story:

- `docs/stories/epics/EPIC-12-hardening.md` §S-12.05: “Bundle inicial da rota
  `/app/inbox` <250KB gzipped; route splitting + dynamic imports aplicados” —
  o checkbox da história está **desmarcado**;
- o CI nunca teve o gate prometido: `package.json` **não tem**
  `analyze:check`, e `perf.yml`/`build-and-size` só prova que o build termina;
- não há série histórica de bundle no repositório.

Ou seja: é cópia de intenção de template, não régua. Um budget que nunca foi
verdade não vigia nada.

**Proposta de valor real (medido em 19/11/2026, doc 43 + este):**

| Rota | Medido | Budget proposto (ratchet) |
|---|---:|---:|
| `/app/inbox` | **503 KB** | **512 KB** |
| `/app/notas` | 458 KB | 470 KB |
| `/app/pedidos` | 435 KB | 448 KB |
| `/app/fiscal` | 423 KB | 435 KB |
| `/app/financeiro` | 410 KB | 422 KB |
| `/app/sentinel` | 406 KB | 418 KB |
| `/login` | 228 KB | 240 KB |

512 KB dá ~9 KB (1,8%) de folga para churn de chunk e reprova qualquer
regressão maior que isso. O alvo de **400 KB** continua existindo como
**stretch com dono de arquitetura**, não como budget vigente: exige o corte de
Supabase (61 KB) ou Supabase+zod, que é a fatia D. Gate proposto: ler
`.next/diagnostics/route-bundle-stats.json` no CI e falhar acima da tabela.

## Limitações

Medição local, um build por variante, sem LCP/INP. A conclusão é sobre **first
load de JS**, não sobre experiência de campo. O doc 43 continua válido para o
Sentry; este corrige três estimativas dele (áudio, date-fns e diálogos
secundários).

## Encerramento

Micro-splitting no inbox está **medido e não paga** (áudio +2 KB, date-fns
−4 KB, diálogos +1 KB); o que resta é arquitetura, e o alvo declarado precisa
refletir o medido (512 KB) ou virar trabalho de arquitetura com dono (stretch
400 KB).
