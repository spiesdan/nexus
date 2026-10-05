---
impacto: nada_mudou
secao: alterado
titulo: "A logo da barra lateral ficou maior e no meio"
---

A marca que o dono da instalação sobe pelo painel aparecia pequena demais e
encostada na esquerda da barra lateral. A arte foi de `h-7` (28px) para `h-10`
(40px) e a barra de `h-14` (56px) para `h-16` (64px), com a largura máxima
subindo de 10rem para 13rem — era ela que segurava marcas mais largas que a
barra antiga comportava.

O cabeçalho deixou de alternar entre `justify-start` e `justify-center`
conforme o estado colapsado: agora é sempre centrado, e o `<img>` ganhou
`mx-auto` para centralizar também quando a arte é mais estreita que a barra.
Antes, com o logo carregado ele encostava na esquerda enquanto o texto caído
ficava no meio — a marca se movia sozinha quando a barra dobrava.