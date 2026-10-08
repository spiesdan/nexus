---
impacto: nada_mudou
secao: corrigido
titulo: As fotos do catálogo aparecem de verdade na lista
---

As imagens dos produtos foram trazidas para a tela, mas chegavam vazias: a
lista abria completa, sem nenhuma foto, e o problema se repetia em toda linha.

O motivo era uma regra de segurança que vale no caminho da tela e não valia no
caminho da página: a lista de fotos era lida com as permissões de quem estava
conectado, e a página não enxergava essa tabela. A consulta passou a usar a
permissão do servidor, mantendo a verificação de que as fotos são da mesma
empresa de quem está pedido.
