---
impacto: nada_mudou
secao: corrigido
titulo: Dois testes que pararam de descrever a tela
---

A verificação automática falhou em dois passos depois da tela mudar, e a causa
não era defeito: eram os testes que descreviam a versão antiga das telas.

O caminho do certificado passou a ser somente leitura, porque quem escreve o
caminho é o servidor e não a pessoa. O teste ainda tentou digitá-lo e ficou
esperando.

O botão de criar carga mostra entre parênteses quantos pedidos estão marcados.
O teste exigia o nome sem esse número, que só aparece quando nada está
marcado — ou seja, quando o botão não faz nada.

Nada mudou para quem usa o sistema.
