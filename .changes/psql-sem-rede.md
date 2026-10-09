---
impacto: exige_acao
secao: corrigido
titulo: O instalador não encontrava o banco em installs próprios
---

Em instalações com Supabase próprio, o script de atualização não conseguia falar
com o banco: o nome do banco aparece dentro da string de conexão como se fosse
um endereço de internet, e o programa temporário usado para falar com ele não
conhecia esse nome.

O resultado era: o passo de atualização do banco não era executado, e aparecia
um aviso. Em um pior caso, o script de restauração — justamente o usado quando o
banco quebrou — falhava com um erro que não parecia com "não consegui restaurar",
e o arquivo de backup continuava inteiro sem ter sido restaurado.

Agora todos os scripts que falam com o banco entram no container dele quando o
banco é um container, e sobem um programa temporário só quando o endereço é
público (Supabase na nuvem). Os dois caminhos já existiam e já eram testados; o
que faltava era os scripts usarem.

## Requer atenção

**Rode a atualização uma vez:** `bash hostgator-setup-kit/update.sh`

Sem passo manual, e nada se perde — o script faz backup do banco antes de mexer
em qualquer coisa.

O aviso "Apareceram avisos no banco que NÃO são os esperados" que apareceu nas
atualizações anteriores some depois disso, e o schema passa a ser aplicado de
verdade.

Se você usa `restore.sh`, ele também foi corrigido — antes ele falhava justamente
quando o banco já estava quebrado.
