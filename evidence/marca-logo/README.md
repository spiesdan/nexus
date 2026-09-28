# Marca própria — evidência do `marca-logo.spec.ts`

As seis capturas deste diretório saem do e2e `tests/e2e/marca-logo.spec.ts`,
que é a prova da marca própria (white-label) na tela: quem sobe, quem vê, quem
troca e quem remove. Cada imagem corresponde a um passo do spec, na ordem:

- `1-admin-marca-previa.png` — a prévia do logo no Admin, antes de salvar.
- `2-sidebar-do-dono.png` — o logo do dono na barra lateral, depois de salvo.
- `3-login-deslogado.png` — a tela de acesso DESLOGADA já mostra o logo novo
  (a P0: a fachada não vaza o logo da camada de baixo).
- `4-sidebar-da-empresa.png` — o logo da EMPRESA da organização na barra
  dela, sem vazar para a tela de acesso.
- `5-svg-recusado.png` — SVG renomeado para `.png` recusado pelos BYTES, com
  a razão dita na tela (o nome do arquivo não decide nada).
- `6-volta-ao-da-instalacao.png` — remover o logo da organização devolve o da
  instalação, a camada de baixo.

Capturadas em 2026-09-25 na correção do Fase 2e do redesign (TopBar do
admin + compensação de relógio do TOTP no `globalSetup`), quando o spec voltou
a rodar inteiro no Windows.
