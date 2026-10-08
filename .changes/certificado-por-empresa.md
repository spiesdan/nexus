---
impacto: nada_mudou
secao: corrigido
titulo: O certificado passou a ficar guardado por empresa
---

Depois de passar a ser enviado de verdade, o certificado era gravado num único
arquivo compartilhado por toda a instalação. Em uma instalação com mais de uma
empresa cadastrada — e esta tem — uma segunda empresa que enviasse certificado
sobrescreveria o da primeira, e a primeira passaria a assinar com o certificado
errado.

Agora cada empresa tem a sua pasta, e o caminho é montado a partir da sessão de
quem enviou, nunca a partir de um valor vindo do banco.

A tela também passou a mostrar o caminho que o servidor gravou, em vez do nome
do arquivo que estava no computador de quem enviou — são nomes diferentes de
propósito, e a tela não pode discordar do servidor sobre o próprio estado.
