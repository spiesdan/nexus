---
impacto: nada_mudou
secao: corrigido
titulo: A suíte de testes não escreve mais no seu banco por acidente
---

Se você roda os testes deste projeto na sua máquina e o arquivo de configuração
local aponta para a instalação que está na VPS, a suíte podia criar empresas,
usuários e sessões de teste **dentro do seu sistema** — e terminar dizendo
"verde". Aconteceu em 07/10/2026: entraram 13 empresas de teste, 11 usuários e
1.483 registros.

O aviso já existia e não bastou: era uma linha amarela que ninguém era obrigado a
ler, e ela imprimia enquanto a escrita acontecia. Agora a execução **para**, com o
motivo escrito, sempre que a única fonte do endereço do banco for esse arquivo
local e ele apontar para fora da máquina.

Rodar contra a sua instalação de propósito continua possível — mas passou a
exigir dizer isso em voz alta (`TESTE_PERMITE_BANCO_REMOTO=1`). Autorizar virou um
ato, em vez de um esquecimento.

Nada muda na sua instalação: quem fica seguro é o ambiente de teste.
