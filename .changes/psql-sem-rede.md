---
impacto: nada_mudou
secao: corrigido
titulo: O instalador não encontrava o banco em installs próprios
---

Em instalações com Supabase próprio, o script de atualização não conseguia falar
com o banco: o nome do banco aparece dentro da string de conexão como se fosse
um endereço de internet, e o programa temporário usado para falar com ele não
conhecia esse nome.

O passo de atualização do banco não era executado, e aparecia um aviso. Pior: o
script de restauração — justamente o usado quando o banco quebrou — falhava com
um erro que não parecia com "não consegui restaurar", e o arquivo de backup
continuava inteiro sem ter sido restaurado.

Agora todos os scripts que falam com o banco entram no container dele quando o
banco é um container, e sobem um programa temporário só quando o endereço é
público (Supabase na nuvem). Os dois caminhos já existiam e já eram testados; o
que faltava era os scripts usarem.

Quem já instalou recebe a correção na atualização normal: o script faz backup
antes de mexer em qualquer coisa, e não há passo manual.
