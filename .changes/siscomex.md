---
impacto: nada_mudou
secao: adicionado
titulo: Importação da nomenclatura federal pelo Siscomex
---

Uma segunda porta de importação do catálogo de NCM, além do CSV do IBPT que já
existia. As duas convivem porque dão coisas diferentes: o IBPT traz a
descrição do IBGE (boa para casar nome de produto) e o ICMS de cada estado; o
Siscomex é a nomenclatura federal pura, com endpoint público e atualizada por
ato.

O que a fonte oficial entrega não serve como vem. O JSON traz a descrição de
**um nível só** — o `28289011` vem como `"De sódio"`, sem nenhuma palavra que
case com "ÁGUA SANITARIA" na tela. A descrição útil está no caminho até ele:

```
28      Produtos químicos inorgânicos…
2828    Hipocloritos; hipoclorito de cálcio comercial…
28289011  De sódio
```

"Hipocloritos" é exatamente o termo de água sanitária. Sem remontar a
hierarquia, a fonte seria population de 10 mil linhas com zero acerto — e o
sintoma seria o pior possível: tabela cheia, rota respondendo 200, nada
preenchido.

A remontagem não assume passo fixo porque a hierarquia é irregular (existem
níveis de 5 e 7 dígitos): ela varre todos os prefixos do código e usa os que
existem.

Porta: `POST /api/v1/fiscal-ibpt/importar-siscomex` (manager+), recebendo o
JSON no corpo como o `/importar` recebe o CSV. A importação não busca o
arquivo sozinha: depender da rede de um terceiro tornaria a operação
irreprodutível, e é preciso reimportar o mesmo arquivo quando algo der errado.

Fonte: https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json