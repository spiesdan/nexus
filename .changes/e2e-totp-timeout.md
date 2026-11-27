---
impacto: nada_mudou
---

test(e2e): teto de 120 s no spec da barra mobile, que loga duas vezes

O segundo login do arquivo pode cair no guard de janela do TOTP de
`tests/e2e/helpers/login-admin.ts`, que espera até ~30 s pela próxima janela.
Com o teto padrão de 30 s o teste estourava no fim da espera, já com as duas
asserções verdadeiras (run 45987189842: 29,7 s de `waitForTimeout` e
`data-dock="ausente"` presente), e o vermelho travava o e2e da main e o PR
#969. Nenhuma asserção mudou.

Auditoria dos specs que logam 2+ vezes no mesmo arquivo: os outros nove já
têm teto (`test.setTimeout` de arquivo ou `describe.configure`). Só este
estava no padrão de 30 s.
