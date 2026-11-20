---
impacto: nada_mudou
secao: corrigido
titulo: Conta suspensa — Sair encerra a sessao e contato ganha alvo de 44 px
---

O botao Sair da tela de conta suspensa era um link GET para /login: mostrava o
formulario de entrada sem encerrar a sessao antiga. Agora e um formulario que
chama a mesma Server Action de logout do menu do usuario, com POST medido e
redirect para /login.

O link de contato do operador, quando SUPPORT_EMAIL esta configurado, passou de
139x17 para 147x44. As telas 403, 404 e 500 foram verificadas nos quatro
criterios (acao que funciona, sem detalhe tecnico, texto proprio e alvo com nome
acessivel) e nao precisaram de mudanca.

Nada a fazer na VPS.
