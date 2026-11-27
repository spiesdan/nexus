---
impacto: nada_mudou
secao: corrigido
titulo: e2e da barra mobile deixa de estourar no guard de TOTP
---

O segundo login de `expedicao-nova-barra-mobile.spec.ts` pode cair no guard de
janela do TOTP de `tests/e2e/helpers/login-admin.ts`, que espera até ~30 s pela
próxima janela. Com o teto padrão de 30 s o teste estourava no fim da espera, já
com as duas asserções verdadeiras (run 45987189842: 29,7 s de `waitForTimeout` e
`data-dock="ausente"` presente), e o vermelho do e2e era lido como produto.

O teto do arquivo passa a 120 s. Nenhuma asserção, seletor ou nome de check
mudou. Auditoria dos specs que logam 2+ vezes no mesmo arquivo: os outros nove já
tinham teto (`test.setTimeout` de arquivo ou `describe.configure`).
