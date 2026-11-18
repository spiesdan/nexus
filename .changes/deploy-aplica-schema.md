---
impacto: nada_mudou
secao: corrigido
titulo: Deploy aplica o schema antes de subir a imagem nova
---

O deploy trocava a imagem e subia os contêineres sem tocar no banco — o passo
de schema tinha sido esvaziado com razões corretas (a imagem de runtime não
tem `pnpm`, e a cadeia de migrations não reproduz o schema), mas o efeito era
uma imagem nova contra um banco sem a coluna ou a tabela nova. O primeiro erro
aparecia como 500 numa tela, sem apontar para o schema.

Agora o deploy aplica o `supabase/baseline.sql` — o mesmo arquivo idempotente
do `install.sh` e do `update.sh`, pela conexão do dono do banco — e **verifica**
objetos que o app usa na primeira tela antes de subir qualquer contêiner. Se o
banco responder um erro que não seja o ruído esperado de re-aplicação, ou se
faltar objeto, o deploy para antes do `up -d`.
