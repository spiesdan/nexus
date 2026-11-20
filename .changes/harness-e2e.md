---
impacto: nada_mudou
secao: corrigido
titulo: Suíte E2E cai de 26 para 15 minutos e para de inventar vermelho
---

Quem desenvolve ganha tempo e confiança no gate: a suíte `critical` rodava em
**26,4 min** e terminava com **8 falhas** que eram do instrumento, não do
produto.

Duas causas: o teste de MFA esperava 5 minutos um `Dígito 1` **disabled** porque
o segredo tinha rotacionado; e o `--output` do Playwright ficava dentro de
`test-results`, então a própria suíte apagava os traces que tentava ler no fim
(ENOENT).

Agora roda em **14,7 min**, **0 falhas de infraestrutura**, em uma invocação.

**Nada a fazer na VPS** — é ferramenta de desenvolvimento.
