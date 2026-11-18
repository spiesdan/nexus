---
impacto: nada_mudou
secao: corrigido
titulo: Teto de lista deixa de esconder item sem avisar
---

Cinco telas do fiscal (eventos, manifestações, produtos, fornecedores e
sincronizações) carregavam no máximo 300 linhas e não diziam isso: a lista
parecia completa. Em Equipe, uma falha de leitura virava uma frase vermelha sem
saída; em tokens de API, virava "Nenhum token criado ainda".

As listas agora declaram "Mostrando X de Y" usando a contagem da mesma consulta,
com o caminho para refinar. Falha de leitura mostra o erro com "Tentar
novamente" — na equipe, o vazio real ganhou o convite de convidar alguém. Token
vencido aparece como "Expirado", e revogar pede confirmação.
