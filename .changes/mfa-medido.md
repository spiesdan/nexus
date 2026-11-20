---
impacto: nada_mudou
secao: corrigido
titulo: Matriz 41 fecha público/auth 25 de 25 — a tela de MFA foi medida
---

A matriz de cobertura dizia "aplicado" para `/login/mfa` sem nunca ter visto a
tela: sem sessão parcial, a rota redireciona para `/login`, e a captura media a
tela de login. A régua passou a exigir o **h1** de cada rota, e o item virou
pendente com motivo.

Agora ele foi medido de verdade: login com o admin do E2E parado **antes do
segundo fator**. Nas quatro combinações (claro/escuro × 1440/390): h1
"Verificação em duas etapas" confirmado, **0** textos abaixo do contraste mínimo,
**0** overflow e **0** violação séria no axe.

Com isso a §2.2 fecha **25 medidas + `/design` como exceção declarada**.

Nada a fazer na VPS.
