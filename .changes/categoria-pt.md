---
impacto: nada_mudou
secao: corrigido
titulo: Categorias da prospecção em português — e a busca que estava quebrada
---

**O filtro de categoria estava em inglês, e a busca não funcionava.** As duas
coisas são o mesmo defeito.

**O inglês.** O valor gravado em `business_prospects.categoria` é o rótulo que
a API do Google Maps devolve. Medido nesta instalação: 533 categorias distintas, todas em inglês.
"Auto repair shop" tem 154 empresas, "Gas station" 107, "Real estate agency"
97, "Car wash" 93.

Um seletor que oferece "Auto repair shop" está em inglês, por mais que o resto
da tela esteja em português. E o operador que quer "apenas mecânicas" não sabe
qual das 533 opções é a oficina dele.

**A busca quebrada — e era um erro meu.** O filtro comparava
`categoria ilike '%termo%'` contra o valor gravado. Digitar "mecanica" não
trazia "Auto repair shop": `ilike` compara letra a letra, e "mecanica" não é
substring de "auto repair shop". Eu anunciei o contrário no PR do filtro. A
correção é `categoriasQueCasam` converter o termo português nos valores em
inglês que ele descreve — 533 traduções, medidas uma a uma contra o banco.

Agora **"mecanica" traz "Auto repair shop"**, e funciona sem acento e com
flexão de gênero: "mecanica" acha "Mecânico" também, porque em português a
flexão mais comum é a de gênero e ela é tratada.

**O que continua em inglês é o valor, não a tela.** O select mostra "Oficina
mecânica (154)" e envia "Auto repair shop" — porque é assim que o dado está
gravado. Inverter os dois faria a tela aparecer filtrada e a lista vir vazia,
sem erro nenhum; por isso o `nome` e o `rotulo` são campos separados na
resposta da API, e o chip de filtro ativo mostra o português.

**Uma palavra igual em português fica igual.** "Hotel" traduz para "Hotel", e
está certo. O teste que garante que nenhum rótulo do filtro sai em inglês tem
uma lista explícita dessas palavras — inventar "Pousada" para "Hotel" seria
traduzir o produto errado, e teste que obriga a fazer isso ensina a fazer.

**Testes:** 19 casos, e **7 mutações provadas** por
`scripts/provar-mutacoes-categoria-pt.py` — desligar a substring em português,
desligar a busca no valor gravado, devolver vazio em vez do original, desligar
a flexão, desligar o `semAcento`, deixar termo vazio trazer tudo, e apagar uma
tradução: todas reprovaram.

Uma mutação **não reprovou na primeira rodada**, e foi o que valeu: ela
mostrou que um passo de "tradução exata" que eu tinha escrito era **redundante**
— o conjunto que ele produzia já era subconjunto do seguinte. O passo foi
removido e o comentário que atribuía a ele aéri o de "filtrar só uma
categoria" estava errado: quem segura a lista curta é o filtro ser por
categoria, não a ordem dos passos.

Suíte: **8.352 verdes**, `tsc`, lint e `lint:channels` limpos.
