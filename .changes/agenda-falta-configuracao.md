---
impacto: nada_mudou
secao: corrigido
titulo: A Agenda não abre mais com aviso de erro
---

Ao abrir a Agenda, aparecia um aviso vermelho dizendo que a disponibilidade do
responsável ainda não estava configurada.

A informação estava certa e o aviso, errado: quem-configura é um estado normal,
não uma falha. Quem abriu a Agenda no primeiro dia de uso viu um aviso vermelho
antes de qualquer pedido.

Agora a Agenda mostra essa situação na cor de aviso, com a explicação de onde
configurar. O mesmo vale para os outros dois casos de aviso que jáexistiam
prontos no sistema, mas que nunca eram usados.

Para encontrar isso foi preciso abrir a tela em produção: a suíte de testes
passava sem perceber.
