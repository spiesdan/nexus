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

## O que três cortes negativos dizem

Micro-splitting no inbox **não paga**: o Turbopack regrupa os componentes em
chunks próprios e o runtime de cada `dynamic` consome o ganho. Os 103 KB
restantes não estão num import esquecido; estão na arquitetura da casca:

| Ofensor | Gzip | Por que não é corte trivial |
|---|---:|---|
| bootstrap Next + manifesto Sentry | 73 KB | não é SDK; `routeManifestInjection: false` rende pouco e perde rota parametrizada |
| cliente Supabase | 61 KB | sessão/auth no browser; lazy muda o boot da casca |
| casca (sidebar/topbar) | 35 KB | componentes do produto em toda rota |
| zod | 31 KB | validação de formulário no cliente, 4/6 rotas |

**Proposta honesta:** o alvo de 400 KB não fecha por micro-corte. As opções são
(i) rever o alvo para ~480–500 KB com o ganho já entregue, ou (ii) uma fatia de
arquitetura para tirar Supabase/zod do first load com desenho explícito de
hidratação — e um build de prova. Continuar fatiando componentes só produz
+1/+2 KB.

## Limitações

Medição local, um build por variante, sem LCP/INP. A conclusão é sobre **first
load de JS**, não sobre experiência de campo. O doc 43 continua válido para o
Sentry; este corrige três estimativas dele (áudio, date-fns e diálogos
secundários).
