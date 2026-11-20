---
impacto: nada_mudou
secao: corrigido
titulo: Observabilidade distingue série ligada e ociosa de instrumento mudo
---

A tela de SLO passou a mostrar quantas amostras existem na janela, a mais antiga,
a mais recente e quantas rotas. Zero amostra agora tem texto próprio — “a série
está ligada, mas nenhuma requisição autenticada passou pelas rotas quentes desde
o deploy” — em vez de se confundir com “sem histórico” de uma série curta.

O caminho de escrita ganhou defesa: se `after()` lançar, a amostra é persistida
direto; se o insert também falhar, sai uma linha de erro `definitivo`. O
primeiro caminho continua fora do 200.
