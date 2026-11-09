---
impacto: nada_mudou
secao: corrigido
titulo: O envio por modelo no canal oficial acha o modelo pela WABA e não pela conexão
---

A campanha por modelo aprovado no número oficial (`meta_cloud`) pausava com "o modelo não está no espelho local" mesmo com o modelo APROVADO e a conexão WORKING. O espelho grava o modelo pela WABA — dois números da mesma conta compartilham o mesmo modelo —, e o envio procurava pela conexão, coluna que o sincronizador não preenche. O resultado era um modelo existente se apresentando como ausente.

A busca passou a usar a WABA da sessão, que é o dono real do modelo. Quem não tem a WABA na credencial (instalação antiga de número único) e as linhas do caminho de parceiro continuam no filtro por conexão, como antes.
