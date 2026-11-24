---
impacto: nada_mudou
secao: corrigido
titulo: Testes de YAML voltam a rodar com a versão 4 da biblioteca
---

O bump automático para `js-yaml` 5 quebrou o parse dos workflows: `workflows-fazem-parse` passou a reprovar `apk.yml`, `ci.yml` e `e2e.yml` como "YAML inválido". A v5 mudou a superfície da API usada pelo teste, e o bump foi mergeado sem que a suíte pegasse — o job de release reprovou e travou a publicação. Volta para a v4, que é a versão em que o teste foi escrito.
