---
impacto: nada_mudou
secao: corrigido
titulo: Reconciliação usa numero_mercos como identidade e não confunde nome mudado com colisão
---

O classificação virava quase todo pedido antigo em colisão porque comparava o nome do cliente, que muda com o tempo. Agora a ordem é: linha com `numero_mercos` igual ao número do Mercos é importado; sem ela, número ocupado por pedido local é colisão; sem nenhuma das duas, é ausente. Pedido sem detalhe coletado fica classificado como sem detalhe e não entra na conta de ausente nem de verificado.
