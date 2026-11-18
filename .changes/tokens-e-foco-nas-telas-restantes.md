---
impacto: nada_mudou
secao: corrigido
titulo: Texto sobre o accent volta a ser legível no escuro — e o admin ganha o atalho de conteúdo
---

Duas correções de acessibilidade, as duas medidas no navegador.

**O texto sobre o accent herdava a cor errada.** A classe `text-accent-fg` não existia — o token
estava declarado no CSS, mas faltava na ponte que gera os utilitários. No tema claro o texto
herdado era escuro por acaso e passava; no escuro, texto claro sobre accent claro dava **2,03:1**.
O chip do dia selecionado na agenda era o texto menos legível da tela. Agora passa, e um gate
impede que qualquer token declarado fique sem utilitário.

**A casca do painel da plataforma não tinha "Pular para o conteúdo".** O primeiro Tab em `/admin`
caía em "Sair pra app pessoal"; quem usa teclado atravessava a navegação inteira em toda tela. O
atalho agora existe, igual ao do app.

Junto: a rolagem suave pedida por código passa a respeitar a preferência de movimento reduzido
(eram oito pontos), e diálogo/menu ganharam teste de foco preso, `Esc` e retorno ao gatilho.
