# evidence/ — as provas visuais do CRM Vivo

Cada wave tem seu índice: `wave-0.md`, `wave-1.md`, `wave-2.md`. Os PNGs são a prova;
os `.md` dizem o que cada um prova, contra qual commit, e o que ficou vermelho.

## Os dois tipos de evidência — e por que a distinção não é burocracia

| | **REPRODUZÍVEL** | **HISTÓRICA** |
|---|---|---|
| Como regenerar | rodar o script de novo | **não dá** |
| Por quê | o código que a produz continua lá | o código que produziu aquele estado **não existe mais** |
| Sobrescrever | inofensivo | **destrói a única cópia**, sem deixar rastro do que havia |
| Exemplo | `wave-2-board-depois.png` | `wave-0-board-antes.png` |

O **"antes" de uma wave vira histórico no instante em que a wave é commitada.** A partir
dali, aquele PNG é a única testemunha de um estado que ninguém consegue mais reconstruir —
nem com `git checkout`, porque o board depende de dados, de build e de um servidor vivo
naquele momento.

Tratar evidência histórica como saída de script é **erro de categoria**: script produz
artefato descartável; registro histórico é imutável por natureza.

## A proteção

`tests/qa-helpers.ts` mantém a lista `EVIDENCIA_HISTORICA`. Antes de gravar, o
`guardaEvidencia()` **recusa sobrescrever** um desses arquivos — e diz **qual** arquivo e
**por quê**:

```
[evidencia] RECUSADO sobrescrever "wave-0-board-antes.png": é evidência HISTÓRICA — o
código que produziu aquele estado não existe mais, então este PNG é a única cópia e não
pode ser regenerado.
Se você realmente quer perder o "antes", rode com FORCE=1.
```

Recusar **em silêncio** seria a mesma falha silenciosa que esta entrega inteira existe
para caçar. A recusa grita, nomeia o arquivo e oferece a saída consciente (`FORCE=1`).

Evidência reproduzível segue sobrescrevendo sem atrito — a guarda só vale para a lista.

## Como uma evidência nasce

Todo PNG aqui veio de navegação **como usuário**: login pela tela (com MFA quando o papel
exige), cliques até o destino, zero navegação por URL direta e zero asserção de API
tratada como prova. Os capturadores:

| Script | O que produz |
|---|---|
| `tests/capture-wave-0.ts` | linha de base do board (**histórica**) |
| `tests/capture-wave-1.ts` | os 4 cenários do dono-agente + axe + paridade de avatar |
| `tests/capture-wave-1-bulk.ts` | atribuição em massa sobre lead de dono agente |
| `tests/capture-wave-2.ts` | gate de altura constante, orçamento de elementos, axe |
| `tests/compose-antes-depois.ts` | o antes/depois lado a lado (cenário 8) |
| `tests/sonda-abas-do-inbox.ts` | a faixa de abas do inbox em 5 larguras (medição, não captura) |

A sonda de abas do inbox não captura cenas de usuário: ela **mede** a faixa de
filtros (colisão de rótulo, estouro de caixa, rolagem) em cinco larguras — md,
xl e 2xl — e grava a prova de cada medição: `evidence/abas-inbox-900.png`,
`evidence/abas-inbox-1280.png`, `evidence/abas-inbox-1440.png`,
`evidence/abas-inbox-1536.png` e `evidence/abas-inbox-1920.png`. O caso é o
conserto das abas colidindo em coluna estreita (PR do branch
`fix/inbox-abas-sem-sobreposicao`), e o `1280` é o aperto máximo: coluna de 272px.

`tests/capture-wave-2.ts` tem dois modos que auditam o **próprio instrumento**:

- `DEMO=1` — imprime a mensagem de falha sem navegador, para revisar o **formato** do
  relatório antes de precisar dele;
- `SELFCHECK=1` — infla um card por CSS e **exige** que o gate reprove. Gate que só foi
  visto passando é carimbo, não gate.

## 08/10 — Fotos do catálogo voltando a aparecer

- `evidence/fotos-produto-carregam.png` — coluna de fotos do catálogo com as
  imagens visíveis, capturada contra o site público **depois** da 1.25.3
  (PR #53). A captura é a ponta de uma cadeia que o spec
  `tests/fiscal/fotos-carregam.spec.ts` mede inteira, porque cada ponta já
  mentiu verde sozinha antes: semeei a foto, o *upload* respondia 200, o lote
  respondia 200, a URL respondia 200 com `image/png` — e a tela renderizava
  **zero** `<img>`. Foto nenhuma aparecia, e nenhuma dessas respostas apontava
  para o defeito. O spec mede os cinco `<img>` renderizados na tela e falha se
  algum deles não carregar.

## 08/10 — A foto do produto na PRIMEIRA pintura, sem depender de JavaScript

- `evidence/fotos-no-html-inicial.png` — a linha do produto semeado, com a foto
  verde já pintada, capturada contra o site público **depois** da 1.25.11
  (PR #72). A captura é da LINHA, não do topo da lista: a primeira versão
  registrava o topo, onde o produto semeado não está, e outra version registrava
  o Inbox — duas telas que documentam o defeito sem serem ele.

  O sintoma do dono era "aparece os produtos sem foto e só depois a página já
  carregada é que carrega as imagens". Isso é uma afirmação sobre **quando** a
  foto aparece, então o spec `tests/fiscal/fotos-no-html-inicial.spec.ts` mede
  três momentos e exige os três:

  1. o **HTML cru** do servidor (`page.request.get`, sem rodar JavaScript)
     já traz o mapa de fotos com a URL preenchida e a foto responde 200;
  2. a rota de lote `/api/v1/products/images` fica **bloqueada** durante a
     render — se a coluna ainda dependesse dela, o produto apareceria sem foto
     para sempre, e o defeito estaria de volta na tela;
  3. o `<img>` na tela tem `naturalWidth > 0`, ou seja, os pixels chegaram —
     `visible` sozinho prova só que existe uma caixa na tela.

  E o próprio spec já errou três vezes medindo a coisa errada, o que é a razão
  de ele estar documentado aqui e não só na sua própria linha: procurava um
  `<img>` de produto **qualquer** na página e achava o do logo, dando verde com
  o mapa inteiro vazio; aceitou só URL absoluta e reprovou com a forma correta
  em uso (foto em disco vira rota da API, não URL do bucket); e o padrão de
  extração não casava com o `\"` escapado do payload do RSC. Verde com o mapa
  vazio é pior que vermelho: parece prova e não é.

## 08/10 — Busca dos pedidos para montar a carga

- `evidence/expedicao-busca-carga.png` — tela de **Nova carga** com a busca
  apertada em "joinville", o contador em "1 de 18 pedidos", e o pedido
  **PED-0018, já marcado, ainda visível no bloco "Na carga (1)"** enquanto a
  lista de baixo mostra só o Joinville. É a prova do ponto que mais importa
  nesta funcionalidade: o que já foi escolhido não desaparece quando a busca
  aperta.

  Capturada contra o site público depois da 1.25.14. O spec
  `tests/fiscal/expedicao-busca-carga.spec.ts` semeia três pedidos
  (`Sonda São Paulo`/`Curitiba`/`Joinville`) e mede número, cidade sem acento,
  nome, termo inexistente, e a permanência do marcado — e **remove os pedidos
  que semeou**, porque cada rodada deixada para trás suja a fila da expedição
  da instalação real e faz a rodada seguinte medir uma lista que já estava
  suja.

  Duas coisas nesta entrega transformeram o teste em必要的, e ambas já
  aconteceu aqui:

  - **A entrega anterior entrou pela metade.** O PR #76 levou os 4 arquivos novos
    e não a ligação com a tela: em produção a versão subia para 1.25.13, os
    pedidos apareciam na fila, e **não havia campo nenhum**. Um teste que só
    exercitasse `filtrarEmbarcaveis` unitariamente ficaria verde com a tela
    desconectada da função — que era o estado. Por isso este spec exige o
    elemento na TELA.
  - **O spec esperava a coisa errada.** Ele usava `check()` para marcar, e o
    `check()` verifica que a caixa ficou marcada — mas o pedido sai da lista de
    baixo ao ser marcado, por desenho. O `check()` ficava esperando um elemento
    que já tinha saído do DOM e travava até o fim do teste, com uma falha que
    parecia defeito do produto.

## 09/10 — O certificado A1 sendo enviado de verdade

- `evidence/fiscal-certificado-enviado.png` — a seção **CERTIFICADO** da aba
  Configuração fiscal, com o campo mostrando `certificado.pfx`, o botão
  "Enviar certificado" e a linha **"Certificado gravado no servidor."**
  Capturada contra o site público depois da 1.25.20.

  O spec `tests/fiscal/certificado-a1-envio.spec.ts` gera um PKCS#12 de verdade
  com `openssl` (autossinado — o teste não toca em certificado da empresa),
  envia pela tela e percorre os três momentos: a tela **dizendo que não há
  certificado**, o envio, e a tela **dizendo que está gravado** na recarga. O
  que não é foto é `certificado_presente` vindo do servidor.

  A evidência já foi gravada duas vezes de forma inútil antes de servir: a
  primeira pegou o **esqueleto de carregamento** (o screenshot disparou antes do
  render — passou por prova e não provava nada), e a segunda pegou o **topo da
  página**, que documenta "Configuração fiscal" e o aviso de homologação, e não
  o certificado. Agora espera o texto, espera o valor do campo e rola até ele.

  ## O que a tela fazia antes

  O botão "Escolher arquivo" fazia `setCertPath(f.name)`: pegava o `.pfx` do
  computador de quem configurava, guardava o **nome**, e o arquivo nunca era
  lido, nunca saía do navegador e nunca chegava no servidor. Medido na
  instalação depois que alguém "configurou":

  ```
  /srv/fiscal/certs .......... NÃO EXISTE
  *.pfx / *.p12 no disco ..... nenhum
  *.pfx em volume docker ..... nenhum
  fiscal_settings.certificado_path = "PATRICIA CNPJ (1).pfx"
  ```

  Configuração fiscal com cara de pronta e nenhum certificado na máquina.

## 06/10 — SPED Bloco H editável e barra de notas

- `evidence/sped-bloco-h/sped-arquivo-editavel.png` — arquivo EDF ICMS/IPI com Bloco H gerado e textarea editável (spec 20 / PR #36).
- `evidence/notas-barra/1-barra-notas-ainda-vazia.png` — barra de ações da tela de Notas visível mesmo sem notas (PR #32).

## 09/10 — Alertas operacionais no Meu Dia

- `evidence/meu-dia-alertas.png` — o **Meu Dia** com o bloco **"Nota fiscal
  pendente (1)"**: um pedido que foi criado com a caixa **"Este pedido é com NF"**
  marcada, e que ainda não tem nota emitida. A linha mostra o pedido, o cliente,
  a ação recomendada e um link para abrir o registro.

- `evidence/meu-dia-alertas-resolvido.png` — a **mesma tela depois de resolver** o
  alerta pelo PATCH. É a segunda imagem que existe por um motivo: a primeira
  prova que o aviso aparece, e sem a segunda ninguém prova que ele sai — e um
  aviso que não sai é um aviso que ninguém lê.

**O que estas duas imagens não provam.** Que o estado fiscal está certo. A regra
que decide se o pedido está pendente é `estadoFiscal` em
`lib/meu-dia/nf-pendente.ts`, com 22 testes de unidade — e o caso mais importante
deles é o que a imagem **não** mostra: quando a instalação não tem provedor que
confirme emissão (provedor `stub`), o estado vira `nao_verificavel` e a tela diz
isso em vez de afirmar que a nota não saiu. Um alerta que promete uma confirmação
falsa treina o operador a ignorar o Meu Dia inteiro.

**Reprodutível.** `pnpm exec playwright test --config=playwright.config.ts
meu-dia-alertas` regenera as duas. O código que as produz continua no
repositório, que é o que distingue evidência reprodutível de histórica
(a distinção está no topo deste arquivo).

**Vermelho nesta wave:** nada. A conciliação do fechamento de carga
(`lib/comercial/conciliacao-carga.ts`, 17 testes) e a regra de pedido fora da
carga (`lib/meu-dia/fora-da-carga.ts`, 17 testes) não têm imagem porque não têm
tela — são regras de decisão, e o lugar delas é o teste de unidade.
